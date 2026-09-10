/**
 * Client for the transaction simulator (rust/sim-server, `canton-sim-server`).
 *
 * A different process from the signing service on purpose: the simulator
 * holds a read-only participant token and never a seed. This module is the
 * only place the web tier talks to it. Nothing here is stored — a report
 * contains contract arguments and goes to the browser that asked for it and
 * nowhere else; only the outcome lands in the audit log.
 */

export class SimulatorError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/** Mirrors `canton_sim_core::SimulationRequest`. `commands` are JSON Ledger API `Command` objects. */
export type SimulationRequest = {
  user_id?: string;
  command_id?: string;
  act_as: string[];
  read_as?: string[];
  commands: unknown[];
  disclosed_contracts?: unknown[];
  synchronizer_id?: string;
  package_id_selection_preference?: string[];
  min_ledger_time_rel_secs?: number;
  expected_signatures?: string[];
  lookup_contracts?: boolean;
  include_arguments?: boolean;
  include_prepared_transaction?: boolean;
};

export type Outcome = "would_succeed" | "would_fail" | "inconclusive";

export type EffectNode = {
  node_id: string;
  depth: number;
  kind: "create" | "exercise" | "fetch" | "rollback";
  template_id?: string;
  package_name?: string;
  interface_id?: string;
  contract_id?: string;
  choice?: string;
  consuming?: boolean;
  acting_parties?: string[];
  signatories?: string[];
  stakeholders?: string[];
  choice_observers?: string[];
  argument?: unknown;
  result?: unknown;
  children?: string[];
};

export type InputContract = {
  contract_id: string;
  template_id?: string;
  created_at?: string;
  signatories?: string[];
  stakeholders?: string[];
  consumed: boolean;
};

export type Effects = {
  transaction_version: string;
  roots: string[];
  nodes: EffectNode[];
  counts: { creates: number; archives: number; exercises: number; fetches: number; rollbacks: number };
  informees: string[];
  input_contracts: InputContract[];
  act_as: string[];
  command_id: string;
  synchronizer_id: string;
  mediator_group: number;
  transaction_uuid: string;
  preparation_time?: string;
  min_ledger_effective_time?: string;
  max_ledger_effective_time?: string;
  max_record_time?: string;
  prepared_size_bytes: number;
  prepared_transaction_hash_hex: string;
  hashing_scheme_version: string;
};

export type TrafficPricing = {
  extra_traffic_price_usd_per_mb: string;
  amulet_price_usd: string;
  min_topup_bytes?: number;
  source: string;
};

export type TrafficQuote = {
  cost: { confirmation_request: number; confirmation_response: number; total: number };
  usd: string;
  cc: string;
  note: string;
  pricing: TrafficPricing;
};

export type AmuletFeeQuote = {
  amulet_price_usd: string;
  transfer_fee_usd: string;
  create_fee_usd: string;
  lock_holder_fee_usd: string;
  total_usd: string;
  total_cc: string;
  outputs: number;
  schedule_source: string;
};

export type FeeSchedule = {
  traffic: TrafficPricing;
  amulet: {
    create_fee_usd: string;
    holding_fee_usd_per_round: string;
    lock_holder_fee_usd: string;
    transfer_fee_initial_rate: string;
    transfer_fee_steps: Array<[string, string]>;
    source: string;
  };
};

export type Phase =
  | "auth"
  | "request"
  | "interpretation"
  | "authorization"
  | "routing"
  | "sequencing"
  | "confirmation"
  | "unknown";

export type LedgerError = {
  http_status?: number;
  code: string;
  cause: string;
  error_category?: number;
  grpc_code?: number;
  definite_answer?: boolean;
  retry_after_secs?: number;
  [key: string]: unknown;
};

export type Diagnosis = {
  code: string;
  phase: Phase;
  category?: string;
  title: string;
  summary: string;
  explanation?: string;
  resolution?: string;
  hints?: string[];
  extracted: {
    template_id?: string;
    choice?: string;
    contract_ids?: string[];
    parties?: string[];
    required_authorizers?: string[];
    given_authorizers?: string[];
    message?: string;
    [key: string]: unknown;
  };
  retryable: boolean;
  definite_answer?: boolean;
  catalog_source?: string;
  error: LedgerError;
};

export type ContractState =
  | { state: "active"; contract_id: string; template_id?: string; created_at_offset?: number }
  | {
      state: "archived";
      contract_id: string;
      template_id?: string;
      created_at_offset?: number;
      archived_at_offset?: number;
    }
  | { state: "unknown"; contract_id: string }
  | { state: "lookup_failed"; contract_id: string; error: string };

export type SimulationReport = {
  outcome: Outcome;
  ledger: { base_url: string; participant_version?: string };
  request: SimulationRequest;
  command_id: string;
  effects?: Effects;
  traffic?: TrafficQuote;
  amulet_fee?: AmuletFeeQuote;
  diagnosis?: Diagnosis;
  contract_states?: ContractState[];
  caveats?: string[];
  prepared_transaction_base64?: string;
  prepared_transaction_hash_base64?: string;
  elapsed_ms: number;
  simulated_at: string;
};

export type StandaloneFeeQuote = {
  traffic?: TrafficQuote;
  amulet_fee?: AmuletFeeQuote;
  schedule: FeeSchedule;
};

function baseUrl(): string | null {
  const url = process.env.SIMULATOR_URL;
  return url ? url.replace(/\/$/, "") : null;
}

function requireUrl(): string {
  const url = baseUrl();
  if (!url) throw new SimulatorError("SIMULATOR_URL is not configured", 500);
  return url;
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const url = requireUrl();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, { ...init, cache: "no-store" });
  } catch (e) {
    throw new SimulatorError(
      `simulator unreachable at ${url}: ${e instanceof Error ? e.message : String(e)}`,
      503
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let reason = text;
    try {
      reason = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // not JSON; keep the raw body
    }
    throw new SimulatorError(reason || `simulator returned ${res.status}`, res.status);
  }
  return JSON.parse(text) as T;
}

function postJson<T>(path: string, body: unknown, forwardToken?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  // The simulator forwards a caller's bearer token to the participant unchanged
  // (its --forward-auth default), so an operator can simulate with their own
  // read rights instead of the service's. The token is not logged or stored.
  if (forwardToken) headers.authorization = `Bearer ${forwardToken}`;
  return call<T>(path, { method: "POST", headers, body: JSON.stringify(body) });
}

export const simulatorService = {
  /** Whether the web tier knows where the simulator is at all. */
  configured(): boolean {
    return baseUrl() !== null;
  },
  async health(): Promise<boolean> {
    const url = baseUrl();
    if (!url) return false;
    try {
      const res = await fetch(`${url}/healthz`, { cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  },
  simulate(req: SimulationRequest, forwardToken?: string): Promise<SimulationReport> {
    return postJson("/v1/simulate", req, forwardToken);
  },
  explain(error: string): Promise<Diagnosis> {
    return postJson("/v1/explain", { error });
  },
  fee(body: { request_bytes?: number; response_bytes?: number; transfer_cc?: string[] }): Promise<StandaloneFeeQuote> {
    return postJson("/v1/fee", body);
  },
  feeSchedule(): Promise<FeeSchedule> {
    return call("/v1/fee-schedule", { method: "GET" });
  },
};
