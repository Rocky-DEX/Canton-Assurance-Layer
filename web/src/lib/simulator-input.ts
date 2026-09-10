/**
 * Turns what an operator types into the simulator page into a
 * `SimulationRequest`, with the same tolerance as the CLI: the commands box
 * accepts one JSON Ledger API `Command` object, an array of them, or a full
 * request object (recognised by its `commands` field), in which case the form
 * fields fill in whatever the object leaves out.
 *
 * Pure, so it is unit-tested without a browser or a simulator.
 */

import type { SimulationRequest } from "@/lib/simulator";

export type SimulationForm = {
  commandsText: string;
  actAs: string;
  readAs: string;
  synchronizerId: string;
  lookupContracts: boolean;
  includeArguments: boolean;
};

export type ParsedInput = { ok: true; request: SimulationRequest } | { ok: false; error: InputError };

export type InputError = "notJson" | "notCommand" | "noCommands" | "noActAs";

/** Splits a party list typed as one per line, or comma/space separated. */
export function splitParties(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const p = raw.trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

function isCommand(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v as object);
  return keys.length === 1 && /Command$/.test(keys[0]);
}

export function parseSimulationInput(form: SimulationForm): ParsedInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(form.commandsText);
  } catch {
    return { ok: false, error: "notJson" };
  }

  const actAsTyped = splitParties(form.actAs);
  const readAsTyped = splitParties(form.readAs);
  const synchronizer = form.synchronizerId.trim();

  let base: Partial<SimulationRequest> = {};
  let commands: unknown[];
  if (Array.isArray(parsed)) {
    commands = parsed;
  } else if (isCommand(parsed)) {
    commands = [parsed];
  } else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { commands?: unknown }).commands)) {
    base = parsed as Partial<SimulationRequest>;
    commands = (parsed as { commands: unknown[] }).commands;
  } else {
    return { ok: false, error: "notCommand" };
  }
  if (commands.length === 0) return { ok: false, error: "noCommands" };
  if (!commands.every(isCommand)) return { ok: false, error: "notCommand" };

  const actAs = actAsTyped.length > 0 ? actAsTyped : (base.act_as ?? []);
  if (actAs.length === 0) return { ok: false, error: "noActAs" };

  const request: SimulationRequest = {
    ...base,
    act_as: actAs,
    read_as: readAsTyped.length > 0 ? readAsTyped : (base.read_as ?? []),
    commands,
    lookup_contracts: form.lookupContracts,
    include_arguments: form.includeArguments,
    // Never ask for the raw prepared transaction from the console: it is large
    // and the page has nothing to do with it.
    include_prepared_transaction: false,
  };
  if (synchronizer) request.synchronizer_id = synchronizer;
  else if (!base.synchronizer_id) delete request.synchronizer_id;
  return { ok: true, request };
}

/** Comma/space/newline separated decimal amounts in CC; rejects anything that is not a plain decimal. */
export function parseTransferAmounts(text: string): { ok: true; amounts: string[] } | { ok: false; bad: string } {
  const amounts: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const a = raw.trim();
    if (!a) continue;
    if (!/^\d+(\.\d+)?$/.test(a)) return { ok: false, bad: a };
    amounts.push(a);
  }
  return { ok: true, amounts };
}
