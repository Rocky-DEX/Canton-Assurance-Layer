"use server";

import { z } from "zod";

import { Forbidden, audit, orgForAction } from "@/lib/rbac";
import {
  SimulatorError,
  simulatorService,
  type Diagnosis,
  type SimulationReport,
  type StandaloneFeeQuote,
} from "@/lib/simulator";

type Fail = { ok: false; error: string };

function failure(e: unknown): Fail {
  if (e instanceof SimulatorError) return { ok: false, error: e.message };
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

const Command = z
  .record(z.string(), z.unknown())
  .refine((c) => Object.keys(c).length === 1 && /Command$/.test(Object.keys(c)[0]), "not a Ledger API Command");

const SimulatePayload = z.object({
  request: z.object({
    user_id: z.string().max(200).optional(),
    command_id: z.string().max(200).optional(),
    act_as: z.array(z.string().min(1).max(500)).min(1).max(50),
    read_as: z.array(z.string().min(1).max(500)).max(50).optional(),
    commands: z.array(Command).min(1).max(100),
    disclosed_contracts: z.array(z.unknown()).max(1000).optional(),
    synchronizer_id: z.string().max(500).optional(),
    package_id_selection_preference: z.array(z.string()).max(100).optional(),
    min_ledger_time_rel_secs: z.number().int().nonnegative().optional(),
    expected_signatures: z.array(z.string()).max(50).optional(),
    lookup_contracts: z.boolean().optional(),
    include_arguments: z.boolean().optional(),
    include_prepared_transaction: z.literal(false).optional(),
  }),
  // Forwarded to the participant for this one call, never stored or logged.
  forward_token: z.string().max(16 * 1024).optional(),
});

export type SimulateOutcome = { ok: true; report: SimulationReport } | Fail;

export async function simulateAction(slug: string, raw: unknown): Promise<SimulateOutcome> {
  let ctx;
  try {
    ctx = await orgForAction(slug, "OPERATOR");
  } catch (e) {
    return { ok: false, error: e instanceof Forbidden ? e.message : "forbidden" };
  }
  const parsed = SimulatePayload.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "payload"}: ${issue.message}` };
  }
  try {
    const report = await simulatorService.simulate(parsed.data.request, parsed.data.forward_token || undefined);
    // The report itself is not kept: it carries contract arguments. The audit
    // trail records that a simulation happened and how it came out.
    await audit(ctx.org.id, ctx.user.id, "simulator.simulate", report.command_id, {
      outcome: report.outcome,
      code: report.diagnosis?.code,
      commands: parsed.data.request.commands.length,
      elapsedMs: report.elapsed_ms,
    });
    return { ok: true, report };
  } catch (e) {
    return failure(e);
  }
}

const ExplainPayload = z.object({ error: z.string().min(1).max(256 * 1024) });

export type ExplainOutcome = { ok: true; diagnosis: Diagnosis } | Fail;

export async function explainAction(slug: string, raw: unknown): Promise<ExplainOutcome> {
  try {
    await orgForAction(slug, "VIEWER");
  } catch (e) {
    return { ok: false, error: e instanceof Forbidden ? e.message : "forbidden" };
  }
  const parsed = ExplainPayload.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    return { ok: true, diagnosis: await simulatorService.explain(parsed.data.error.trim()) };
  } catch (e) {
    return failure(e);
  }
}

const FeePayload = z.object({
  request_bytes: z.number().int().nonnegative().max(1_000_000_000),
  response_bytes: z.number().int().nonnegative().max(1_000_000_000),
  transfer_cc: z.array(z.string().regex(/^\d+(\.\d+)?$/)).max(100),
});

export type FeeOutcome = { ok: true; quote: StandaloneFeeQuote } | Fail;

export async function feeAction(slug: string, raw: unknown): Promise<FeeOutcome> {
  try {
    await orgForAction(slug, "VIEWER");
  } catch (e) {
    return { ok: false, error: e instanceof Forbidden ? e.message : "forbidden" };
  }
  const parsed = FeePayload.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "payload"}: ${issue.message}` };
  }
  try {
    return { ok: true, quote: await simulatorService.fee(parsed.data) };
  } catch (e) {
    return failure(e);
  }
}
