import { NextResponse } from "next/server";
import { z } from "zod";

import { orgForApiKey } from "@/lib/api-keys";
import { pairCoverageForOrg } from "@/lib/coverage";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/rbac";

const Body = z.object({
  custody_id: z.string().min(1),
  /** A publication id, or "latest". */
  publication_id: z.string().min(1).default("latest"),
  max_skew: z.number().int().min(0).max(86_400).default(300),
});

const json = (status: number, body: unknown) => NextResponse.json(body, { status });

async function authorise(req: Request, slug: string) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const key = await orgForApiKey(bearer);
  if (!key) return { error: json(401, { error: "missing or invalid API key" }) };
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org || org.id !== key.orgId) return { error: json(404, { error: "no such organisation for this key" }) };
  return { org, keyId: key.keyId };
}

export async function GET(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/coverage">) {
  const { slug } = await ctx.params;
  const a = await authorise(req, slug);
  if ("error" in a) return a.error;
  const rows = await prisma.coverageStatement.findMany({
    where: { orgId: a.org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, custodyId: true, publicationId: true, fullyCovered: true, outcome: true, statement: true, createdAt: true },
  });
  return json(200, { coverage: rows.map((r) => ({ ...r, statement: JSON.parse(r.statement) })) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/coverage">) {
  const { slug } = await ctx.params;
  const a = await authorise(req, slug);
  if ("error" in a) return a.error;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "body is not JSON" });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json(400, { error: `${issue.path.join(".") || "body"}: ${issue.message}` });
  }
  let publicationId = parsed.data.publication_id;
  if (publicationId === "latest") {
    const latest = await prisma.publication.findFirst({ where: { orgId: a.org.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!latest) return json(404, { error: "no publication yet" });
    publicationId = latest.id;
  }
  try {
    const { statement, ok, failure, rows } = await pairCoverageForOrg(a.org.id, parsed.data.custody_id, publicationId, parsed.data.max_skew);
    await audit(a.org.id, null, "coverage.create", statement.id, { via: "api", keyId: a.keyId, ok });
    return json(201, { id: statement.id, fully_covered: ok, failure, rows });
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : String(e) });
  }
}
