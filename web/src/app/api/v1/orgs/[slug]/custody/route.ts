import { NextResponse } from "next/server";
import { z } from "zod";

import { orgForApiKey } from "@/lib/api-keys";
import { attestCustodyForOrg } from "@/lib/custody";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/rbac";
import { ServiceError } from "@/lib/service";

const Body = z.object({
  snapshot_time: z.string().datetime({ offset: true }),
  ledger_offset: z.string().regex(/^\d{1,40}$/),
  /** The saved active-contracts response, as a JSON array or a JSON string of one. */
  response: z.union([z.array(z.unknown()), z.string().min(2)]),
  asset_field: z.string().min(1).max(64).default("instrument"),
  amount_field: z.string().min(1).max(64).default("amount"),
  custody_basis: z.string().min(3).max(500),
});

const json = (status: number, body: unknown) => NextResponse.json(body, { status });

async function authorise(req: Request, slug: string) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const key = await orgForApiKey(bearer);
  if (!key) return { error: json(401, { error: "missing or invalid API key" }) };
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, slug: true, publisherParty: true, signingKeyHex: true } });
  if (!org || org.id !== key.orgId) return { error: json(404, { error: "no such organisation for this key" }) };
  return { org, keyId: key.keyId };
}

export async function GET(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/custody">) {
  const { slug } = await ctx.params;
  const a = await authorise(req, slug);
  if ("error" in a) return a.error;
  const rows = await prisma.custodyReport.findMany({
    where: { orgId: a.org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, snapshotTime: true, ledgerOffset: true, reportDigest: true, rootHash: true, leafCount: true, rootSums: true, publisherKey: true, custodyBasis: true, createdAt: true },
  });
  return json(200, { custody: rows });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/custody">) {
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
  const b = parsed.data;
  try {
    const { custody, positions } = await attestCustodyForOrg(a.org, {
      snapshot_time: b.snapshot_time,
      ledger_offset: b.ledger_offset,
      response_json: typeof b.response === "string" ? b.response : JSON.stringify(b.response),
      asset_field: b.asset_field,
      amount_field: b.amount_field,
      custody_basis: b.custody_basis,
    });
    await audit(a.org.id, null, "custody.create", custody.id, { via: "api", keyId: a.keyId, positions });
    return json(201, { id: custody.id, report_digest: custody.reportDigest, root_hash: custody.rootHash, leaf_count: custody.leafCount, root_sums: custody.rootSums });
  } catch (e) {
    if (e instanceof ServiceError) return json(e.status >= 500 ? 502 : 400, { error: e.message });
    return json(400, { error: e instanceof Error ? e.message : String(e) });
  }
}
