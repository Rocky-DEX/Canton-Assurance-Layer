/**
 * Client for the signing service (rust/solvency-service).
 *
 * The service is the only process holding signing seeds. This module is the
 * only place the web tier talks to it, so the boundary is one file wide.
 */

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export type FileOut = { name: string; content: string };

export type PublishRequest = {
  org_id: string;
  publisher: string;
  profile?: string;
  snapshot_time: string;
  ledger_offset: string;
  leaves: Array<{ user_id: string; balances: Record<string, string> }>;
  mark_prices?: Record<string, string>;
  disclosures?: {
    bad_debt?: Record<string, string>;
    excluded_house_accounts?: number;
    excluded_house_totals?: Record<string, string>;
  };
  manifest?: { audience: string; fields: Record<string, string> } | null;
  previous_anchor?: unknown | null;
};

export type PublishResponse = {
  public_key: string;
  format_version: string;
  report_digest: string;
  anchor_digest: string;
  root_hash: string;
  leaf_count: number;
  root_sums: Record<string, string>;
  clamped: number;
  proofs: Array<{ user_id: string; file_name: string }>;
  files: FileOut[];
};

export type CustodyRequest = {
  org_id: string;
  publisher: string;
  snapshot_time: string;
  ledger_offset: string;
  response_json: string;
  asset_field: string;
  amount_field: string;
};

export type CustodyResponse = {
  public_key: string;
  report_digest: string;
  root_hash: string;
  leaf_count: number;
  root_sums: Record<string, string>;
  positions: Array<{ contract_id: string; asset: string; amount: string }>;
  files: FileOut[];
};

function config() {
  const url = process.env.SERVICE_URL;
  const token = process.env.SERVICE_TOKEN;
  if (!url || !token) {
    throw new ServiceError("SERVICE_URL and SERVICE_TOKEN must be configured", 500);
  }
  return { url: url.replace(/\/$/, ""), token };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = config();
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    throw new ServiceError(
      `signing service unreachable at ${url}: ${e instanceof Error ? e.message : String(e)}`,
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
    throw new ServiceError(reason || `signing service returned ${res.status}`, res.status);
  }
  return JSON.parse(text) as T;
}

export const signingService = {
  async health(): Promise<boolean> {
    try {
      const { url } = config();
      const res = await fetch(`${url}/health`, { cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  },
  publicKey(orgId: string): Promise<{ public_key: string }> {
    return post("/keys", { org_id: orgId });
  },
  publish(req: PublishRequest): Promise<PublishResponse> {
    return post("/publish", req);
  },
  custody(req: CustodyRequest): Promise<CustodyResponse> {
    return post("/custody", req);
  },
};
