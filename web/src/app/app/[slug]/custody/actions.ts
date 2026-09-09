"use server";

import { z } from "zod";

import { attestCustodyForOrg } from "@/lib/custody";
import { Forbidden, audit, orgForAction } from "@/lib/rbac";
import { ServiceError } from "@/lib/service";

const Payload = z.object({
  snapshot_time: z.string().datetime({ offset: true }),
  ledger_offset: z.string().regex(/^\d{1,40}$/),
  response_json: z.string().min(2).max(64 * 1024 * 1024),
  asset_field: z.string().min(1).max(64),
  amount_field: z.string().min(1).max(64),
  custody_basis: z.string().min(3).max(500),
});

export type CustodyOutcome = { ok: true; id: string; positions: number } | { ok: false; error: string };

export async function attestCustodyAction(slug: string, raw: unknown): Promise<CustodyOutcome> {
  let ctx;
  try {
    ctx = await orgForAction(slug, "OPERATOR");
  } catch (e) {
    return { ok: false, error: e instanceof Forbidden ? e.message : "forbidden" };
  }
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "payload"}: ${issue.message}` };
  }
  try {
    const { custody, positions } = await attestCustodyForOrg(ctx.org, parsed.data);
    await audit(ctx.org.id, ctx.user.id, "custody.create", custody.id, { reportDigest: custody.reportDigest, positions });
    return { ok: true, id: custody.id, positions };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
