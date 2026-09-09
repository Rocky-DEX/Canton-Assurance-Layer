/**
 * View logic for the disclosure console's viewer half.
 *
 * The console's job is not to say "verified". It is to show *what* was
 * verified, *what* was merely asserted, and where each number came from —
 * for a reader who did not write the format.
 *
 * Publisher-side workflows (connecting a participant node, designing a
 * disclosure, publishing) are not here: they need a live ledger connection,
 * which a page loaded from a file cannot have.
 */

import { anchorDigestHex, type Anchor } from "./anchor";
import { verifyFromText, type Fact, type ViewModel } from "./offline";
import { lookupProfile, type Report, type SignedReport } from "./report";
import { formatAmount18dp, parseAmount18dp } from "./verify";
import { englishVerifier, type VerifierTranslator } from "./i18n/verifier-messages";

export type CoverageRow = {
  asset: string;
  held: string;
  owed: string;
  covered: boolean;
};

export type HistoryRow = {
  index: number;
  snapshotTime: string;
  reportDigest: string;
  linked: boolean;
  /** Why not, when `linked` is false. Null when the row follows correctly. */
  problem: string | null;
};

/** A node in the data-flow view: where a published figure came from. */
export type FlowNode = {
  id: string;
  label: string;
  detail: string;
  /** Depth from the published root, so the view can lay it out. */
  depth: number;
};

export type ConsoleModel = {
  verification: ViewModel;
  /** What the report's profile asserts, in the format's own words. */
  statement: string | null;
  coverage: CoverageRow[] | null;
  history: HistoryRow[] | null;
  flow: FlowNode[];
};

/**
 * Format an amount for display, or say it is malformed.
 *
 * These figures come from a document supplied by the party being checked, and
 * this renders in a page whose error console nobody is watching. A throw out
 * of a display path leaves a blank screen, which a reader cannot tell from a
 * broken console — strictly worse than a row that says the figure is wrong.
 * The offline verifier had the same defect and the same fix.
 */
function display(amount: string, t: VerifierTranslator = englishVerifier): string {
  try {
    return formatAmount18dp(parseAmount18dp(amount));
  } catch {
    return t("value.malformed");
  }
}

/** Comparable only when both sides parse; an unreadable figure is not covered. */
function coveredBy(held: string, owed: string): boolean {
  try {
    return parseAmount18dp(held) >= parseAmount18dp(owed);
  } catch {
    return false;
  }
}

function amountRow(asset: string, held: string, owed: string, t: VerifierTranslator): CoverageRow {
  return {
    asset,
    held: display(held, t),
    owed: display(owed, t),
    covered: coveredBy(held, owed),
  };
}

/** A map of amounts, or nothing renderable. Untrusted input is not a map. */
function amountEntries(sums: unknown): [string, string][] {
  if (sums === null || typeof sums !== "object" || Array.isArray(sums)) return [];
  return Object.entries(sums as Record<string, string>);
}

/**
 * Coverage is driven by what is owed. An asset held but not owed is not a
 * coverage question; an asset owed and held nowhere is the worst case.
 */
export function coverageRows(
  custody: Report,
  liabilities: Report,
  t: VerifierTranslator = englishVerifier
): CoverageRow[] {
  const held = new Map(amountEntries(custody.root_sums));
  return amountEntries(liabilities.root_sums)
    .map(([asset, owed]) => amountRow(asset, held.get(`held/${asset}`) ?? "0", owed, t))
    .sort((a, b) => a.asset.localeCompare(b.asset));
}

/** Each row says whether it links to the one before it, so a break is visible. */
export async function historyRows(anchors: Anchor[]): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = [];
  for (const [index, anchor] of anchors.entries()) {
    // §12.1 is more than the digest link. This view used to check only that
    // each anchor named its predecessor, so a history that changed publisher,
    // restated a snapshot time or rewound a ledger offset rendered as fully
    // linked while `verifyAnchorChain` refused it — the reader saw green for
    // exactly the rewriting anchoring exists to expose.
    const problem = await chainProblem(anchors, index);
    rows.push({
      index,
      snapshotTime: anchor.snapshot_time,
      reportDigest: anchor.report_digest,
      linked: problem === null,
      problem,
    });
  }
  return rows;
}

/** What stops this anchor following the one before it, if anything. */
async function chainProblem(anchors: Anchor[], index: number): Promise<string | null> {
  const anchor = anchors[index];
  if (anchor.format_version !== "canton-solvency-anchor-v1") {
    return `unrecognised anchor format ${anchor.format_version}`;
  }
  if (index === 0) {
    return anchor.prev_anchor === undefined
      ? null
      : "the first anchor names a predecessor, so this history does not start at its beginning";
  }
  const previous = anchors[index - 1];
  if (anchor.prev_anchor !== (await anchorDigestHex(previous))) {
    return "does not name the anchor before it";
  }
  if (anchor.publisher !== previous.publisher) {
    return `publisher changed from ${previous.publisher}`;
  }
  if (anchor.snapshot_time <= previous.snapshot_time) {
    return "snapshot time does not advance, so an instant has been restated";
  }
  if (anchor.ledger_offset < previous.ledger_offset) {
    return "ledger offset moves backwards";
  }
  return null;
}

/**
 * Where a published figure came from, as a shallow tree. Aimed at readers new
 * to Canton who need to see that a number is an aggregate of things, not a
 * figure someone typed.
 */
export function flowOf(report: Report, t: VerifierTranslator = englishVerifier): FlowNode[] {
  const profile = lookupProfile(report.profile);
  const nodes: FlowNode[] = [
    {
      id: "root",
      label: t("flow.root.label", { profile: report.profile }),
      detail: t("flow.root.detail", {
        hash: report.root_hash.slice(0, 16),
        count: report.leaf_count,
      }),
      depth: 0,
    },
  ];

  for (const [key, total] of amountEntries(report.root_sums).sort()) {
    nodes.push({
      id: `total:${key}`,
      label: key,
      detail: t("flow.total.detail", { amount: display(total, t) }),
      depth: 1,
    });
  }

  nodes.push({
    id: "leaf",
    label: profile ? t("flow.leaf.label", { leaf: profile.leaf }) : t("flow.leaf.labelGeneric"),
    detail: t("flow.leaf.detail", { count: report.leaf_count }),
    depth: 2,
  });

  nodes.push({
    id: "snapshot",
    label: t("flow.offset.label"),
    detail: t("flow.offset.detail", { offset: report.ledger_offset }),
    depth: 3,
  });

  return nodes;
}

export type ConsoleInput = {
  reportText: string;
  proofText: string;
  trustedKeyHex: string;
  group?: { reportText: string; membershipText: string; keyHex?: string };
  custodyText?: string;
  historyText?: string;
  /** The reader's language; English when absent. */
  t?: VerifierTranslator;
};

export async function buildConsole(input: ConsoleInput): Promise<ConsoleModel> {
  const t = input.t ?? englishVerifier;
  const verification = await verifyFromText(
    input.reportText,
    input.proofText,
    input.trustedKeyHex,
    input.group,
    t
  );

  let report: Report | null = null;
  try {
    report = (JSON.parse(input.reportText) as SignedReport).report;
  } catch {
    report = null;
  }

  let coverage: CoverageRow[] | null = null;
  if (report && input.custodyText) {
    try {
      const custody = (JSON.parse(input.custodyText) as SignedReport).report;
      coverage = coverageRows(custody, report, t);
    } catch {
      coverage = null;
    }
  }

  let history: HistoryRow[] | null = null;
  if (input.historyText) {
    try {
      history = await historyRows(JSON.parse(input.historyText) as Anchor[]);
    } catch {
      history = null;
    }
  }

  return {
    verification,
    statement: report ? (lookupProfile(report.profile)?.name ?? null) : null,
    coverage,
    history,
    flow: report ? flowOf(report, t) : [],
  };
}

/** Re-exported so the page can render provenance without importing two modules. */
export type { Fact };

/**
 * The signed provenance graph (SPEC §17), for display.
 *
 * Distinct from `flowOf`, which derives a shape from the report itself and is
 * therefore a picture of what the format guarantees, not of where the numbers
 * came from. This renders a document the publisher signed.
 *
 * The graph is verified here before any of it is rendered, and nothing is
 * returned when it fails. The console has made the opposite mistake before:
 * anchor histories were displayed as linked while verification would have
 * rejected them, because the display path reimplemented the rules instead of
 * calling them. Display calls the verifier.
 */
export type ProvenanceSourceRow = {
  name: string;
  kind: string;
  onLedger: boolean;
  basis?: string;
};

export type ProvenanceFieldRow = {
  field: string;
  method: string;
  sources: ProvenanceSourceRow[];
};

export type ProvenanceView =
  | { ok: true; fields: ProvenanceFieldRow[]; undeclared: string[]; checkedLevels: boolean }
  | { ok: false; problem: string };

export async function provenanceView(
  signedReport: SignedReport,
  signedGraph: any,
  trustedKeyHex: string,
  statement?: { levels?: Record<string, any> }
): Promise<ProvenanceView> {
  const { verifyProvenance, checkAgainstAssurance, onLedger } = await import("./provenance");
  const { KNOWN_FIELDS } = await import("./assurance");

  const structural = await verifyProvenance(signedReport, signedGraph, trustedKeyHex);
  if (!structural.ok) {
    return { ok: false, problem: describeProvenanceFailure(structural.failure) };
  }
  if (statement) {
    const consistent = checkAgainstAssurance(signedGraph.provenance, statement.levels ?? {});
    if (!consistent.ok) {
      return { ok: false, problem: describeProvenanceFailure(consistent.failure) };
    }
  }

  const graph = signedGraph.provenance;
  const byId = new Map<string, any>(graph.sources.map((s: any) => [s.id, s]));
  const fields: ProvenanceFieldRow[] = graph.derivations.map((d: any) => ({
    field: d.field,
    method: d.method,
    sources: d.sources.map((id: string) => {
      const source = byId.get(id);
      return {
        name: source.name,
        kind: source.kind,
        onLedger: onLedger(source.kind),
        basis: source.basis,
      };
    }),
  }));

  // A partial graph is allowed (§17.1). Saying nothing about the fields it
  // omits would read as "everything is accounted for".
  const undeclared = KNOWN_FIELDS.filter(
    (f) => !graph.derivations.some((d: any) => d.field === f)
  );
  return { ok: true, fields, undeclared, checkedLevels: statement !== undefined };
}

function describeProvenanceFailure(failure: any): string {
  switch (failure?.kind) {
    case "digest_mismatch":
      return "this provenance graph describes a different report";
    case "unknown_signer":
      return "the graph is not signed by the trusted key";
    case "bad_signature":
      return "the graph's signature does not verify";
    case "unsupported_version":
      return `unsupported ${failure.field}: ${failure.found}`;
    case "provenance_inconsistent":
      return failure.field
        ? `${failure.field}: ${failure.detail}`
        : String(failure.detail);
    default:
      return `the graph could not be read: ${failure?.detail ?? "unknown"}`;
  }
}
