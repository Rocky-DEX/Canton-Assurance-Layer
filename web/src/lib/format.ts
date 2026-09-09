/** Display helpers. Nothing here changes a stored value. */

export function shortHex(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** Trim trailing zeros of an 18dp amount for display; keeps the full string in a title. */
export function trimAmount(amount: string): string {
  if (!amount.includes(".")) return amount;
  const trimmed = amount.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
}

export function amountMap(map: Record<string, string> | null | undefined): Array<[string, string]> {
  if (!map || typeof map !== "object") return [];
  return Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function fmtDate(iso: string | Date, locale: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
}

/** A fingerprint of an Ed25519 public key, in the style operators compare by eye. */
export function fingerprint(hex: string): string {
  return hex
    .toLowerCase()
    .match(/.{1,4}/g)
    ?.slice(0, 8)
    .join(" ") ?? hex;
}
