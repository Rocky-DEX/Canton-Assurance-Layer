import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/p/[slug]/anchors.json">) {
  const { slug } = await ctx.params;
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, publicPage: true } });
  if (!org || !org.publicPage) return new NextResponse("not found", { status: 404 });
  const rows = await prisma.publication.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" }, select: { anchor: true } });
  return new NextResponse(`[\n${rows.map((r) => r.anchor.trimEnd()).join(",\n")}\n]\n`, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
