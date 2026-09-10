/**
 * Server actions return the reason a request failed as one string, often the
 * signing service's or the database layer's own words. These are exact and
 * worth keeping, but the operator needs the sentence first: what happened
 * and what to do. Each rule turns one known shape into a message key plus
 * the values the message needs; anything unrecognised falls through with the
 * raw text as the message.
 */

export type Friendly = { key: FriendlyKey; values: Record<string, string> };

export type FriendlyKey =
  | "offsetBackwards"
  | "snapshotNotLater"
  | "signingUnreachable"
  | "signingNotConfigured"
  | "simulatorUnreachable"
  | "simulatorNotConfigured"
  | "forbidden"
  | "signingKeyChanged"
  | "notJson"
  | "unknown";

const RULES: Array<[RegExp, (m: RegExpMatchArray) => Friendly]> = [
  [
    /ledger offset (\S+) moves backwards \(previous (\S+)\)/,
    (m) => ({ key: "offsetBackwards", values: { offset: trimZeros(m[1]), previous: trimZeros(m[2]) } }),
  ],
  [
    /snapshot time (\S+) does not advance past the previous publication \((\S+)\)/,
    (m) => ({ key: "snapshotNotLater", values: { time: m[1], previous: m[2] } }),
  ],
  [/signing service unreachable/, () => ({ key: "signingUnreachable", values: {} })],
  [/SERVICE_URL and SERVICE_TOKEN must be configured/, () => ({ key: "signingNotConfigured", values: {} })],
  [/simulator unreachable/, () => ({ key: "simulatorUnreachable", values: {} })],
  [/SIMULATOR_URL is not configured/, () => ({ key: "simulatorNotConfigured", values: {} })],
  [/^forbidden$|requires role|not a member/i, () => ({ key: "forbidden", values: {} })],
  [/signing key changed for (\S+):/, (m) => ({ key: "signingKeyChanged", values: { slug: m[1] } })],
  [/Unexpected token|is not valid JSON|JSON at position/, () => ({ key: "notJson", values: {} })],
];

function trimZeros(s: string): string {
  const t = s.replace(/^0+(?=\d)/, "");
  return t === "" ? "0" : t;
}

export function friendlyError(raw: string): Friendly {
  for (const [re, make] of RULES) {
    const m = raw.match(re);
    if (m) return make(m);
  }
  return { key: "unknown", values: { detail: raw } };
}
