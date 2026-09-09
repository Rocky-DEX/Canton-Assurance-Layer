import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * The organisation's anchor history, oldest first, as a JSON array of the
 * anchor documents exactly as signed. The CLI's `anchors --chain` reads the
 * same shape.
 */
export async function GET(_req: Request, ctx: RouteContext<"/app/[slug]/history/anchors.json">) {
  const { slug } = await ctx.params;
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
  const rows = await prisma.publication.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "asc" },
    select: { anchor: true },
  });
  const body = `[\n${rows.map((r) => r.anchor.trimEnd()).join(",\n")}\n]\n`;
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="anchors.json"',
      "cache-control": "private, no-store",
    },
  });
}
