import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { signingService, type PublishRequest } from "@/lib/service";

export type PublishInput = Omit<PublishRequest, "org_id" | "publisher" | "previous_anchor" | "profile">;

/**
 * Publish for an organisation: ask the signing service, then store the
 * publication and every proof in one transaction. A half-stored publication
 * must not exist, so nothing is written until the service has returned
 * everything.
 */
export async function publishForOrg(
  org: { id: string; publisherParty: string },
  input: PublishInput,
  createdById: string | null
) {
  // Offsets are compared as strings (SPEC §12.1), so they must be the fixed
  // width the format uses; a bare "1" would otherwise sort after "0000…4000".
  const ledgerOffset = input.ledger_offset.padStart(18, "0");
  input = { ...input, ledger_offset: ledgerOffset };
  const previous = await prisma.publication.findFirst({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, anchor: true, snapshotTime: true, ledgerOffset: true },
  });
  if (previous) {
    // The anchor chain refuses these too (SPEC §12.1); saying so before the
    // signing service is asked gives the operator a reason, not a status.
    if (input.snapshot_time <= previous.snapshotTime) {
      throw new Error(
        `snapshot time ${input.snapshot_time} does not advance past the previous publication (${previous.snapshotTime})`
      );
    }
    if (ledgerOffset < previous.ledgerOffset) {
      throw new Error(`ledger offset ${ledgerOffset} moves backwards (previous ${previous.ledgerOffset})`);
    }
  }

  const result = await signingService.publish({
    ...input,
    org_id: org.id,
    publisher: org.publisherParty,
    previous_anchor: previous ? JSON.parse(previous.anchor) : null,
  });

  const file = (name: string) => {
    const f = result.files.find((x) => x.name === name);
    if (!f) throw new Error(`signing service returned no ${name}`);
    return f.content;
  };

  const publication = await prisma.$transaction(async (tx) => {
    const created = await tx.publication.create({
      data: {
        orgId: org.id,
        profile: "solvency.liabilities",
        formatVersion: result.format_version,
        snapshotTime: input.snapshot_time,
        ledgerOffset: ledgerOffset,
        reportDigest: result.report_digest,
        rootHash: result.root_hash,
        leafCount: result.leaf_count,
        rootSums: result.root_sums,
        publisherKey: result.public_key,
        report: file("report.json"),
        anchor: file("anchor.json"),
        anchorDigest: result.anchor_digest,
        pack: file("pack.json"),
        manifest: (input.manifest ?? undefined) as Prisma.InputJsonValue | undefined,
        previousId: previous?.id ?? null,
        createdById,
      },
    });
    // createMany in chunks: 100k proofs is one publication for a mid-size venue.
    const rows = result.proofs.map((p) => ({
      publicationId: created.id,
      externalId: p.user_id,
      fileName: p.file_name,
      document: file(p.file_name),
    }));
    for (let i = 0; i < rows.length; i += 2000) {
      await tx.proof.createMany({ data: rows.slice(i, i + 2000) });
    }
    await tx.organization.update({ where: { id: org.id }, data: { signingKeyHex: result.public_key } });
    return created;
  }, { timeout: 120_000 });

  return { publication, clamped: result.clamped };
}

export const publicationSummary = {
  id: true,
  profile: true,
  formatVersion: true,
  snapshotTime: true,
  ledgerOffset: true,
  reportDigest: true,
  rootHash: true,
  leafCount: true,
  rootSums: true,
  publisherKey: true,
  anchorDigest: true,
  manifest: true,
  previousId: true,
  createdAt: true,
} satisfies Prisma.PublicationSelect;
