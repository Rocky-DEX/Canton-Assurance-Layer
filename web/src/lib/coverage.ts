import { coverageRows } from "canton-solvency-verifier/src/console";
import { verifyCoverage, SAME_RUN, type CoverageStatement } from "canton-solvency-verifier/src/coverage";
import { reportDigestHex, type SignedReport } from "canton-solvency-verifier/src/report";

import { prisma } from "@/lib/db";

/**
 * Pairs a custody report with a liabilities report in a statement naming both
 * by digest, and records the server's reading of the comparison. Pages
 * re-derive that reading in the browser before calling anything verified.
 */
export async function pairCoverageForOrg(orgId: string, custodyId: string, publicationId: string, maxSkew = SAME_RUN) {
  const [custody, publication] = await Promise.all([
    prisma.custodyReport.findFirst({ where: { id: custodyId, orgId } }),
    prisma.publication.findFirst({ where: { id: publicationId, orgId } }),
  ]);
  if (!custody || !publication) throw new Error("no such custody report or publication");

  const custodySigned = JSON.parse(custody.report) as SignedReport;
  const liabilitiesSigned = JSON.parse(publication.report) as SignedReport;
  const statement: CoverageStatement = {
    format_version: "canton-solvency-coverage-v1",
    custody_report_digest: await reportDigestHex(custodySigned.report),
    liabilities_report_digest: await reportDigestHex(liabilitiesSigned.report),
    custody_basis: custody.custodyBasis,
  };
  const result = await verifyCoverage(custodySigned, liabilitiesSigned, statement, custody.publisherKey, publication.publisherKey, maxSkew);
  const rows = coverageRows(custodySigned.report, liabilitiesSigned.report);

  try {
    const created = await prisma.coverageStatement.create({
      data: {
        orgId,
        custodyId: custody.id,
        publicationId: publication.id,
        statement: JSON.stringify(statement, null, 2) + "\n",
        outcome: { ok: result.ok, failure: result.ok ? null : result.failure, maxSkew, rows },
        fullyCovered: result.ok,
      },
    });
    return { statement: created, ok: result.ok, failure: result.ok ? null : result.failure, rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg.includes("Unique constraint") ? "these two reports are already paired" : msg);
  }
}
