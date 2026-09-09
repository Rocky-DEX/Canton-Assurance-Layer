import { NextResponse } from "next/server";

import { orgForApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/db";

/** One publication's metadata and proof index by API key; `id` may be `latest`. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/publications/[id]">) {
  const { slug, id } = await ctx.params;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const key = await orgForApiKey(bearer);
  if (!key) return NextResponse.json({ error: "missing or invalid API key" }, { status: 401 });
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org || org.id !== key.orgId) return NextResponse.json({ error: "no such organisation for this key" }, { status: 404 });

  const select = {
    id: true,
    formatVersion: true,
    snapshotTime: true,
    ledgerOffset: true,
    reportDigest: true,
    anchorDigest: true,
    rootHash: true,
    leafCount: true,
    rootSums: true,
    publisherKey: true,
    manifest: true,
    createdAt: true,
    proofs: { select: { externalId: true, fileName: true } },
  } as const;
  const pub =
    id === "latest"
      ? await prisma.publication.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "desc" }, select })
      : await prisma.publication.findFirst({ where: { id, orgId: org.id }, select });
  if (!pub) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...pub,
    files: ["report.json", "anchor.json", "pack.json", ...pub.proofs.map((p) => p.fileName)],
  });
}
