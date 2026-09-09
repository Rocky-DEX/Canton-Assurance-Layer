import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { proofForUser } from "@/lib/portal";

/**
 * A customer's own proof, and the report it belongs to. Nothing else: the
 * lookup is by proof file name and the caller must be a customer mapped to
 * that proof's leaf identity.
 */
export async function GET(_req: Request, ctx: RouteContext<"/portal/[slug]/[id]/[name]/files/[file]">) {
  const { id, name, file } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return new NextResponse("unauthorized", { status: 401 });
  const proof = await proofForUser(session.user.id, session.user.email, id, name);
  if (!proof) return new NextResponse("not found", { status: 404 });

  let body: string | null = null;
  if (file === "report.json") body = proof.publication.report;
  else if (file === name) body = proof.document;
  if (body === null) return new NextResponse("not found", { status: 404 });
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${file === name ? "proof.json" : file}"`,
      "cache-control": "private, no-store",
    },
  });
}
