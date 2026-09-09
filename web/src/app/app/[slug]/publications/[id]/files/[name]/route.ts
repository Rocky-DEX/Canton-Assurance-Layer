import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Serves a publication's files exactly as signed: report.json, anchor.json,
 * pack.json, and each proof by its pack name. Members and auditors of the
 * organisation only; customers collect their own proof through the portal.
 */
export async function GET(_req: Request, ctx: RouteContext<"/app/[slug]/publications/[id]/files/[name]">) {
  const { slug, id, name } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return new NextResponse("unauthorized", { status: 401 });

  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) return new NextResponse("not found", { status: 404 });
  const allowed =
    (await prisma.membership.count({ where: { orgId: org.id, userId: session.user.id } })) > 0 ||
    (await prisma.auditorGrant.count({
      where: { orgId: org.id, OR: [{ userId: session.user.id }, { email: session.user.email }] },
    })) > 0;
  if (!allowed) return new NextResponse("forbidden", { status: 403 });

  const pub = await prisma.publication.findFirst({
    where: { id, orgId: org.id },
    select: { report: true, anchor: true, pack: true },
  });
  if (!pub) return new NextResponse("not found", { status: 404 });

  let body: string | null = null;
  if (name === "report.json") body = pub.report;
  else if (name === "anchor.json") body = pub.anchor;
  else if (name === "pack.json") body = pub.pack;
  else {
    const proof = await prisma.proof.findUnique({
      where: { publicationId_fileName: { publicationId: id, fileName: name } },
      select: { document: true },
    });
    body = proof?.document ?? null;
  }
  if (body === null) return new NextResponse("not found", { status: 404 });

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
