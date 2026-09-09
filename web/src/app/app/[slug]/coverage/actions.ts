"use server";

import { SAME_RUN } from "canton-solvency-verifier/src/coverage";
import { z } from "zod";

import { pairCoverageForOrg } from "@/lib/coverage";
import { Forbidden, audit, orgForAction } from "@/lib/rbac";

const Payload = z.object({
  custodyId: z.string().min(1),
  publicationId: z.string().min(1),
  maxSkew: z.number().int().min(0).max(86_400).default(SAME_RUN),
});

export type CoverageOutcome = { ok: true; id: string; fullyCovered: boolean } | { ok: false; error: string };

export async function pairCoverageAction(slug: string, raw: unknown): Promise<CoverageOutcome> {
  let ctx;
  try {
    ctx = await orgForAction(slug, "OPERATOR");
  } catch (e) {
    return { ok: false, error: e instanceof Forbidden ? e.message : "forbidden" };
  }
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const { statement, ok } = await pairCoverageForOrg(ctx.org.id, parsed.data.custodyId, parsed.data.publicationId, parsed.data.maxSkew);
    await audit(ctx.org.id, ctx.user.id, "coverage.create", statement.id, { ok });
    return { ok: true, id: statement.id, fullyCovered: ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
