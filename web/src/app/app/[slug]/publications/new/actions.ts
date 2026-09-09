"use server";

import { z } from "zod";

import { publishForOrg } from "@/lib/publications";
import { Forbidden, audit, orgForAction } from "@/lib/rbac";
import { ServiceError } from "@/lib/service";

const Amount = z.string().regex(/^-?\d+(\.\d{1,18})?$/);
const AmountMap = z.record(z.string().min(1).max(64), Amount);

const Payload = z.object({
  snapshot_time: z.string().datetime({ offset: true }),
  ledger_offset: z.string().regex(/^\d{1,40}$/),
  leaves: z
    .array(z.object({ user_id: z.string().min(1).max(200), balances: AmountMap }))
    .min(1)
    .max(500_000),
  mark_prices: AmountMap.optional(),
  disclosures: z
    .object({
      excluded_house_accounts: z.number().int().min(0).optional(),
      excluded_house_totals: AmountMap.optional(),
    })
    .optional(),
  manifest: z
    .object({
      audience: z.string().min(1).max(80),
      fields: z.record(z.string(), z.enum(["published", "committed", "withheld"])),
    })
    .nullable()
    .optional(),
});

export type PublishPayload = z.infer<typeof Payload>;

export type PublishOutcome =
  | { ok: true; id: string; clamped: number; leafCount: number }
  | { ok: false; error: string };

export async function publishAction(slug: string, raw: unknown): Promise<PublishOutcome> {
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
    const { publication, clamped } = await publishForOrg(ctx.org, parsed.data, ctx.user.id);
    await audit(ctx.org.id, ctx.user.id, "publication.create", publication.id, {
      reportDigest: publication.reportDigest,
      leafCount: publication.leafCount,
      formatVersion: publication.formatVersion,
    });
    return { ok: true, id: publication.id, clamped, leafCount: publication.leafCount };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
