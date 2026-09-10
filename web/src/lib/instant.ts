/**
 * The instant a report is "as of", as the format writes it: RFC 3339 in UTC,
 * whole seconds, `Z` suffix. These helpers move between that string and the
 * browser's `datetime-local` control, which speaks the reader's own timezone
 * so nobody has to type a UTC timestamp by hand.
 */

/** RFC 3339 UTC with whole seconds, e.g. `2026-09-10T11:00:00Z`. */
export function isoNow(now: Date = new Date()): string {
  return toIso(now);
}

export function toIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function isIso(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** `value` plus `seconds`, as RFC 3339 UTC; `null` when `value` is not a timestamp. */
export function plusSeconds(value: string, seconds: number): string | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return toIso(new Date(ms + seconds * 1000));
}

/**
 * The `datetime-local` control's value for an RFC 3339 instant, in the given
 * timezone offset (minutes east of UTC, i.e. `-new Date().getTimezoneOffset()`).
 * Seconds are kept so `step="1"` controls round-trip exactly.
 */
export function toLocalInput(iso: string, offsetMinutes: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const shifted = new Date(ms + offsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 19);
}

/** The reverse of {@link toLocalInput}; `null` when the control is empty or invalid. */
export function fromLocalInput(local: string, offsetMinutes: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const ms = Date.parse(`${withSeconds}Z`);
  if (Number.isNaN(ms)) return null;
  return toIso(new Date(ms - offsetMinutes * 60_000));
}

/** A human label for a timezone offset in minutes: `UTC+08:00`, `UTC`, `UTC-03:30`. */
export function offsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
