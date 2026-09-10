import { NextResponse } from "next/server";
import { z } from "zod";

import { orgForApiKey } from "@/lib/api-keys";
import { parseBalancesCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { publishForOrg } from "@/lib/publications";
import { audit } from "@/lib/rbac";
import { ServiceError } from "@/lib/service";

const Amount = z.string().regex(/^-?\d+(\.\d{1,18})?$/);
const AmountMap = z.record(z.string().min(1).max(64), Amount);
const Body = z.object({
  snapshot_time: z.string().datetime({ offset: true }),
  ledger_offset: z.string().regex(/^\d{1,40}$/),
  leaves: z.array(z.object({ user_id: z.string().min(1).max(200), balances: AmountMap })).min(1).max(500_000),
  mark_prices: AmountMap.optional(),
  disclosures: z
    .object({ excluded_house_accounts: z.number().int().min(0).optional(), excluded_house_totals: AmountMap.optional() })
    .optional(),
  manifest: z
    .object({ audience: z.string().min(1).max(80), fields: z.record(z.string(), z.enum(["published", "committed", "withheld"])) })
    .nullable()
    .optional(),
});

const json = (status: number, body: unknown) => NextResponse.json(body, { status });

async function authorise(req: Request, slug: string) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const key = await orgForApiKey(bearer);
  if (!key) return { error: json(401, { error: "missing or invalid API key" }) };
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, publisherParty: true, signingKeyHex: true },
  });
  if (!org || org.id !== key.orgId) return { error: json(404, { error: "no such organisation for this key" }) };
  return { org, keyId: key.keyId };
}

/** GET: the organisation's publications, newest first. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/publications">) {
  const { slug } = await ctx.params;
  const a = await authorise(req, slug);
  if ("error" in a) return a.error;
  const rows = await prisma.publication.findMany({
    where: { orgId: a.org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
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
      createdAt: true,
    },
  });
  return json(200, { publications: rows });
}

/**
 * POST: publish. Either a JSON body in the console's shape, or a CSV body
 * (`Content-Type: text/csv`) with `snapshot_time` and `ledger_offset` as
 * query parameters.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/orgs/[slug]/publications">) {
  const { slug } = await ctx.params;
  const a = await authorise(req, slug);
  if ("error" in a) return a.error;

  let input: z.infer<typeof Body>;
  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("text/csv") || type.startsWith("text/plain")) {
    const url = new URL(req.url);
    const parsed = parseBalancesCsv(await req.text());
    if (parsed.errors.length) return json(400, { error: "csv rejected", details: parsed.errors });
    const meta = Body.pick({ snapshot_time: true, ledger_offset: true }).safeParse({
      snapshot_time: url.searchParams.get("snapshot_time"),
      ledger_offset: url.searchParams.get("ledger_offset")?.padStart(18, "0"),
    });
    if (!meta.success) return json(400, { error: "snapshot_time and ledger_offset query parameters are required" });
    input = { ...meta.data, leaves: parsed.leaves };
  } else {
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
    input = parsed.data;
  }

  try {
    const { publication, clamped } = await publishForOrg(a.org, input, null);
    await audit(a.org.id, null, "publication.create", publication.id, { via: "api", keyId: a.keyId, leafCount: publication.leafCount });
    return json(201, {
      id: publication.id,
      report_digest: publication.reportDigest,
      anchor_digest: publication.anchorDigest,
      root_hash: publication.rootHash,
      leaf_count: publication.leafCount,
      root_sums: publication.rootSums,
      format_version: publication.formatVersion,
      clamped,
    });
  } catch (e) {
    if (e instanceof ServiceError) return json(e.status >= 500 ? 502 : 400, { error: e.message });
    return json(400, { error: e instanceof Error ? e.message : String(e) });
  }
}
