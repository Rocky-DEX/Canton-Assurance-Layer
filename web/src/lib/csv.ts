/**
 * Balance and roster files, parsed in the browser before anything is sent.
 *
 * Balances: `user_id,asset,amount` with no header (a header row is tolerated
 * and skipped). Amounts are 18dp decimals; a leading `-` is a negative balance
 * the signing service will clamp to zero and disclose as bad debt. Nothing
 * here does arithmetic beyond a display total; the committed totals come back
 * from the signed report.
 */

export type Leaf = { user_id: string; balances: Record<string, string> };

export type BalancesParse = {
  leaves: Leaf[];
  /** Asset → decimal total of the non-negative balances, as a display string. */
  totals: Record<string, string>;
  rows: number;
  negatives: number;
  /** Asset → total magnitude of the negative balances, the bad debt the report will disclose. */
  negativeTotals: Record<string, string>;
  assets: string[];
  errors: string[];
};

const AMOUNT = /^-?\d+(\.\d{1,18})?$/;

function splitLine(line: string): string[] {
  // Quoted fields are rare in balance exports but cheap to honour.
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Adds two non-negative decimal strings exactly, for the preview total. */
export function addDecimal(a: string, b: string): string {
  const scale = (s: string) => {
    const [i, f = ""] = s.split(".");
    return BigInt(i + f.padEnd(18, "0"));
  };
  const sum = scale(a) + scale(b);
  const whole = sum / 10n ** 18n;
  const frac = (sum % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function parseBalancesCsv(text: string, maxErrors = 20): BalancesParse {
  const byUser = new Map<string, Record<string, string>>();
  const totals: Record<string, string> = {};
  const negativeTotals: Record<string, string> = {};
  const errors: string[] = [];
  let rows = 0;
  let negatives = 0;

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cols = splitLine(line);
    if (index === 0 && /^user[_ ]?id$/i.test(cols[0] ?? "")) return; // header
    if (cols.length < 3) {
      if (errors.length < maxErrors) errors.push(`line ${index + 1}: expected user_id,asset,amount`);
      return;
    }
    const [user_id, asset, amount] = cols;
    if (!user_id || !asset) {
      if (errors.length < maxErrors) errors.push(`line ${index + 1}: empty user_id or asset`);
      return;
    }
    if (!AMOUNT.test(amount)) {
      if (errors.length < maxErrors) errors.push(`line ${index + 1}: amount ${JSON.stringify(amount)} is not an 18dp decimal`);
      return;
    }
    const balances = byUser.get(user_id) ?? {};
    if (asset in balances) {
      if (errors.length < maxErrors) errors.push(`line ${index + 1}: duplicate asset ${asset} for ${user_id}`);
      return;
    }
    balances[asset] = amount;
    byUser.set(user_id, balances);
    rows++;
    if (amount.startsWith("-")) {
      negatives++;
      negativeTotals[asset] = addDecimal(negativeTotals[asset] ?? "0", amount.slice(1));
    } else {
      totals[asset] = addDecimal(totals[asset] ?? "0", amount);
    }
  });

  const leaves = [...byUser.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([user_id, balances]) => ({ user_id, balances }));

  return {
    leaves,
    totals,
    rows,
    negatives,
    negativeTotals,
    assets: [...new Set([...Object.keys(totals), ...Object.keys(negativeTotals)])].sort(),
    errors,
  };
}

export type RosterRow = { externalId: string; email: string };

/** `user_id,email` with an optional header. */
export function parseRosterCsv(text: string): { rows: RosterRow[]; errors: string[] } {
  const rows: RosterRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cols = splitLine(line);
    if (index === 0 && /^user[_ ]?id$/i.test(cols[0] ?? "")) return;
    const [externalId, email] = cols;
    if (!externalId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push(`line ${index + 1}: expected user_id,email`);
      return;
    }
    if (seen.has(externalId)) {
      errors.push(`line ${index + 1}: duplicate user_id ${externalId}`);
      return;
    }
    seen.add(externalId);
    rows.push({ externalId, email: email.toLowerCase() });
  });
  return { rows, errors };
}
