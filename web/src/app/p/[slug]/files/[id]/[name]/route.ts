import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

/** Public documents: report, anchor and pack. Never proofs — those belong to customers. */
export async function GET(_req: Request, ctx: RouteContext<"/p/[slug]/files/[id]/[name]">) {
  const { slug, id, name } = await ctx.params;
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, publicPage: true } });
  if (!org || !org.publicPage) return new NextResponse("not found", { status: 404 });
  const pub = await prisma.publication.findFirst({ where: { id, orgId: org.id }, select: { report: true, anchor: true, pack: true } });
  if (!pub) return new NextResponse("not found", { status: 404 });
  const body = name === "report.json" ? pub.report : name === "anchor.json" ? pub.anchor : name === "pack.json" ? pub.pack : null;
  if (body === null) return new NextResponse("not found", { status: 404 });
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "public, max-age=300",
    },
  });
}
