import { NextResponse } from "next/server";

import { orgForApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/db";

/** A publication's files by API key; `id` may be `latest`. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/publications/[id]/files/[name]">) {
  const { slug, id, name } = await ctx.params;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const key = await orgForApiKey(bearer);
  if (!key) return NextResponse.json({ error: "missing or invalid API key" }, { status: 401 });
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org || org.id !== key.orgId) return NextResponse.json({ error: "no such organisation for this key" }, { status: 404 });

  const pub =
    id === "latest"
      ? await prisma.publication.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "desc" }, select: { id: true, report: true, anchor: true, pack: true } })
      : await prisma.publication.findFirst({ where: { id, orgId: org.id }, select: { id: true, report: true, anchor: true, pack: true } });
  if (!pub) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: string | null = null;
  if (name === "report.json") body = pub.report;
  else if (name === "anchor.json") body = pub.anchor;
  else if (name === "pack.json") body = pub.pack;
  else {
    const proof = await prisma.proof.findUnique({ where: { publicationId_fileName: { publicationId: pub.id, fileName: name } }, select: { document: true } });
    body = proof?.document ?? null;
  }
  if (body === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}
