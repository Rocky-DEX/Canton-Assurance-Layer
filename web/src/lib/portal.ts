import { prisma } from "@/lib/db";

/**
 * The proofs a signed-in customer may collect: every `Customer` row for their
 * account (or, before the row was linked, their email), joined to the proofs
 * whose leaf identity matches. Never anyone else's.
 */
export async function proofsForUser(userId: string, email: string) {
  const customers = await prisma.customer.findMany({
    where: { OR: [{ userId }, { email: email.toLowerCase() }] },
    include: { org: { select: { id: true, slug: true, name: true, publisherParty: true, signingKeyHex: true } } },
  });
  const out: Array<{
    org: { id: string; slug: string; name: string; publisherParty: string; signingKeyHex: string | null };
    externalId: string;
    publications: Array<{ id: string; snapshotTime: string; ledgerOffset: string; reportDigest: string; publisherKey: string; fileName: string; createdAt: Date }>;
  }> = [];
  for (const c of customers) {
    const proofs = await prisma.proof.findMany({
      where: { externalId: c.externalId, publication: { orgId: c.orgId } },
      include: {
        publication: { select: { id: true, snapshotTime: true, ledgerOffset: true, reportDigest: true, publisherKey: true, createdAt: true } },
      },
      orderBy: { publication: { createdAt: "desc" } },
    });
    out.push({
      org: c.org,
      externalId: c.externalId,
      publications: proofs.map((p) => ({ ...p.publication, fileName: p.fileName })),
    });
  }
  return out;
}

/** Whether this user may read this proof, and the proof if so. */
export async function proofForUser(userId: string, email: string, publicationId: string, fileName: string) {
  const proof = await prisma.proof.findUnique({
    where: { publicationId_fileName: { publicationId, fileName } },
    include: { publication: { select: { orgId: true, report: true, publisherKey: true, reportDigest: true } } },
  });
  if (!proof) return null;
  const allowed = await prisma.customer.count({
    where: { orgId: proof.publication.orgId, externalId: proof.externalId, OR: [{ userId }, { email: email.toLowerCase() }] },
  });
  return allowed > 0 ? proof : null;
}
