import { prisma } from "@/lib/db";
import { signingService } from "@/lib/service";

export type CustodyInput = {
  snapshot_time: string;
  ledger_offset: string;
  response_json: string;
  asset_field: string;
  amount_field: string;
  custody_basis: string;
};

/** Attest custody for an organisation: the signing service commits, this stores the exact bytes. */
export async function attestCustodyForOrg(org: { id: string; publisherParty: string }, input: CustodyInput) {
  const ledgerOffset = input.ledger_offset.padStart(18, "0");
  const result = await signingService.custody({
    org_id: org.id,
    publisher: org.publisherParty,
    snapshot_time: input.snapshot_time,
    ledger_offset: ledgerOffset,
    response_json: input.response_json,
    asset_field: input.asset_field,
    amount_field: input.amount_field,
  });
  const report = result.files.find((f) => f.name === "custody-report.json");
  if (!report) throw new Error("signing service returned no custody report");
  const created = await prisma.custodyReport.create({
    data: {
      orgId: org.id,
      snapshotTime: input.snapshot_time,
      ledgerOffset,
      reportDigest: result.report_digest,
      rootHash: result.root_hash,
      leafCount: result.leaf_count,
      rootSums: result.root_sums,
      publisherKey: result.public_key,
      custodyBasis: input.custody_basis,
      report: report.content,
    },
  });
  return { custody: created, positions: result.leaf_count };
}
