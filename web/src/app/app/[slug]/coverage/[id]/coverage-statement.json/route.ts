import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/app/[slug]/coverage/[id]/coverage-statement.json">) {
  const { slug, id } = await ctx.params;
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
  const row = await prisma.coverageStatement.findFirst({ where: { id, orgId: org.id }, select: { statement: true } });
  if (!row) return new NextResponse("not found", { status: 404 });
  return new NextResponse(row.statement, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="coverage-statement.json"',
      "cache-control": "private, no-store",
    },
  });
}
