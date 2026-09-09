/**
 * Seeds a demo organisation for local development and smoke tests.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Creates (idempotently): an owner account, an organisation, three customers
 * mapped to demo emails, and one API key, which is printed once. Sign in as
 * the owner through /login; the link lands in /dev/mail.
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.example" },
    create: { email: "owner@demo.example", name: "Demo Owner", emailVerified: new Date() },
    update: {},
  });
  const org = await prisma.organization.upsert({
    where: { slug: "demo-exchange" },
    create: {
      slug: "demo-exchange",
      name: "Demo Exchange",
      publisherParty: "demo::exchange",
      publicPage: true,
      memberships: { create: { userId: owner.id, role: "OWNER" } },
    },
    update: {},
  });
  for (const [externalId, email] of [
    ["alice", "alice@demo.example"],
    ["bob", "bob@demo.example"],
    ["carol", "carol@demo.example"],
  ] as const) {
    await prisma.customer.upsert({
      where: { orgId_externalId: { orgId: org.id, externalId } },
      create: { orgId: org.id, externalId, email },
      update: { email },
    });
  }
  await prisma.auditorGrant.upsert({
    where: { orgId_email: { orgId: org.id, email: "auditor@demo.example" } },
    create: { orgId: org.id, email: "auditor@demo.example", grantedById: owner.id },
    update: {},
  });

  const key = "cal_" + randomBytes(24).toString("base64url");
  await prisma.apiKey.create({
    data: { orgId: org.id, name: "seed", prefix: key.slice(0, 12), hash: createHash("sha256").update(key).digest("hex") },
  });

  console.log(JSON.stringify({ org: org.slug, owner: owner.email, apiKey: key }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
