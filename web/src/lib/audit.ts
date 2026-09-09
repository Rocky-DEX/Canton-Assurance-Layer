import { prisma } from "@/lib/db";

/** Every organisation this account may read: auditor grants plus memberships. */
export async function auditableOrgs(userId: string, email: string) {
  const [grants, memberships] = await Promise.all([
    prisma.auditorGrant.findMany({ where: { OR: [{ userId }, { email: email.toLowerCase() }] }, select: { orgId: true } }),
    prisma.membership.findMany({ where: { userId }, select: { orgId: true } }),
  ]);
  const ids = [...new Set([...grants.map((g) => g.orgId), ...memberships.map((m) => m.orgId)])];
  return prisma.organization.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      publisherParty: true,
      signingKeyHex: true,
      publications: { orderBy: { createdAt: "desc" }, take: 1, select: { snapshotTime: true, createdAt: true, leafCount: true } },
      coverage: { orderBy: { createdAt: "desc" }, take: 1, select: { fullyCovered: true } },
      _count: { select: { publications: true } },
    },
  });
}

