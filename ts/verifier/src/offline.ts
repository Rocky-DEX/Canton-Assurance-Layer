/**
 * View logic for the standalone offline verifier.
 *
 * Kept as a pure function over text so it can be tested against real
 * WebCrypto and the real golden fixtures; the HTML page is a thin DOM shell
 * over this. Nothing here touches the network.
 *
 * Every string a reader sees comes through a translator. The default is
 * English, so callers that say nothing about language — and the tests — get
 * the words they always did; the page hands in the reader's choice.
 */

/**
 * How a displayed value is known. `verified` means this browser recomputed it
 * from the commitment; `disclosed` means the publisher asserted it and signed
 * it, but one inclusion proof cannot prove it. Never render a value without
 * one of these.
 */
export type Provenance = "verified" | "disclosed";

export type Fact = { label: string; value: string; provenance: Provenance };

export type ViewModel = {
  status: "verified" | "failed" | "error";
  headline: string;
  detail: string;
  facts: Fact[];
};

import { formatAmount18dp, keysOf, parseAmount18dp } from "./verify";
import { verifyReport, type ProofDocument, type SignedReport } from "./report";
import { verifyChain, type GroupMembershipDocument } from "./group";
import { englishVerifier, type VerifierKey, type VerifierTranslator } from "./i18n/verifier-messages";

/** Optional group documents, for verifying up to a consolidated total. */
export type GroupInput = {
  reportText: string;
  membershipText: string;
  /** Defaults to the entity key; a group need not publish under the same one. */
  keyHex?: string;
};

/** Failure kinds that have a sentence of their own; the rest are described generically. */
const FAILURE_KEYS: Record<string, VerifierKey> = {
  entity_root_mismatch: "failure.entity_root_mismatch",
  entity_sums_mismatch: "failure.entity_sums_mismatch",
  digest_mismatch: "failure.digest_mismatch",
  unknown_signer: "failure.unknown_signer",
  bad_signature: "failure.bad_signature",
  root_hash_mismatch: "failure.root_hash_mismatch",
  root_sums_mismatch: "failure.root_sums_mismatch",
};

/**
 * Renders an amount map for display.
 *
 * Every value here came from a document supplied by the party being checked,
 * and this runs in a page with no error console anyone is watching. A value
 * that cannot be parsed is shown as-is and flagged, never thrown: a reader
 * looking at a blank screen cannot tell a malformed report from a broken page.
 */
function amountList(amounts: Record<string, string>, t: VerifierTranslator): string {
  if (amounts === null || typeof amounts !== "object") return t("value.malformed");
  const entries = Object.entries(amounts);
  if (entries.length === 0) return t("value.none");
  return entries
    .map(([asset, v]) => {
      try {
        return `${asset} ${formatAmount18dp(parseAmount18dp(v))}`;
      } catch {
        return `${asset} ${t("value.malformed")}`;
      }
    })
    .join(", ");
}

function error(detail: string, t: VerifierTranslator): ViewModel {
  return {
    status: "error",
    headline: t("headline.error"),
    detail,
    facts: [],
  };
}

export async function verifyFromText(
  reportText: string,
  proofText: string,
  trustedKeyHex: string,
  group?: GroupInput,
  t: VerifierTranslator = englishVerifier
): Promise<ViewModel> {
  const key = trustedKeyHex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    return error(t("error.keyFormat"), t);
  }

  let signed: SignedReport;
  let proof: ProofDocument;
  try {
    signed = JSON.parse(reportText);
    proof = JSON.parse(proofText);
  } catch {
    return error(t("error.notJson"), t);
  }
  if (!signed?.report || !proof?.leaf) {
    return error(t("error.swapped"), t);
  }

  let groupSigned: SignedReport | undefined;
  let membership: GroupMembershipDocument | undefined;
  let groupKey = key;
  if (group) {
    if (group.keyHex !== undefined) {
      const gk = group.keyHex.trim();
      if (!/^[0-9a-fA-F]{64}$/.test(gk)) {
        return error(t("error.groupKeyFormat"), t);
      }
      groupKey = gk;
    }
    try {
      groupSigned = JSON.parse(group.reportText);
      membership = JSON.parse(group.membershipText);
    } catch {
      return error(t("error.groupNotJson"), t);
    }
    if (!groupSigned?.report || !membership?.entity) {
      return error(t("error.groupSwapped"), t);
    }
  }

  let result;
  try {
    result =
      groupSigned && membership
        ? await verifyChain(groupSigned, membership, signed, proof, groupKey, key)
        : await verifyReport(signed, proof, key);
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), t);
  }

  // A document rejected as malformed has no figures worth displaying, and
  // rendering its fields as "verified" facts would be exactly backwards.
  if (!result.ok && result.failure?.kind === "malformed") {
    return error(t("error.malformedDocument", { detail: result.failure.detail ?? "" }), t);
  }

  const { report } = signed;
  // Values this browser recomputed, versus values the publisher merely
  // asserted. One inclusion proof cannot attest to the metadata.
  const facts: Fact[] = [
    { label: t("fact.yourBalance"), value: amountList(proof.leaf.balances, t), provenance: "verified" },
    { label: t("fact.publishedTotals"), value: amountList(report.root_sums, t), provenance: "verified" },
    { label: t("fact.root"), value: report.root_hash, provenance: "verified" },
    { label: t("fact.publisher"), value: report.publisher, provenance: "disclosed" },
    { label: t("fact.snapshotTime"), value: report.snapshot_time, provenance: "disclosed" },
    { label: t("fact.ledgerOffset"), value: report.ledger_offset, provenance: "disclosed" },
    { label: t("fact.entriesCommitted"), value: String(report.leaf_count), provenance: "disclosed" },
    {
      label: t("fact.badDebt"),
      value: amountList(report.disclosures.bad_debt, t),
      provenance: "disclosed",
    },
    {
      label: t("fact.houseExcluded"),
      value: String(report.disclosures.excluded_house_accounts),
      provenance: "disclosed",
    },
  ];

  // The manifest is signed and consistency-checked, but nothing in it is
  // recomputed from the commitment, so it is reported as the publisher's
  // statement rather than as something this browser derived.
  const manifest = report.manifest;
  if (manifest) {
    const fields = manifest.fields;
    const byState = (want: string): string =>
      keysOf(fields)
        .filter((path) => (fields as Record<string, string>)[path] === want)
        .sort()
        .join(", ") || t("value.none");
    facts.push(
      {
        label: t("fact.withheld"),
        value: byState("withheld"),
        provenance: "disclosed",
      },
      {
        label: t("fact.provenNotShown"),
        value: byState("committed"),
        provenance: "disclosed",
      }
    );
  }

  if (groupSigned && membership) {
    // Proven only when the chain verified; otherwise these are unchecked
    // claims and must not be dressed up as recomputed.
    const provenance: Provenance = result.ok ? "verified" : "disclosed";
    facts.unshift(
      {
        label: t("fact.entity"),
        value: membership.entity.entity_id,
        provenance,
      },
      {
        label: t("fact.groupTotals"),
        value: amountList(groupSigned.report.root_sums, t),
        provenance,
      },
      {
        label: t("fact.groupPublisher"),
        value: groupSigned.report.publisher,
        provenance: "disclosed",
      }
    );
  }

  if (result.ok) {
    return {
      status: "verified",
      headline: groupSigned ? t("headline.verifiedGroup") : t("headline.verified"),
      detail: groupSigned ? t("detail.verifiedGroup") : t("detail.verified"),
      facts,
    };
  }

  const { failure } = result;
  const known = FAILURE_KEYS[failure.kind];
  const detail = known
    ? t(known)
    : failure.kind === "unsupported_version"
      ? t("failure.unsupported_version", { found: failure.found })
      : failure.kind === "malformed"
        ? t("failure.malformed", { detail: failure.detail })
        : failure.kind;

  return {
    status: "failed",
    headline: t("headline.failed"),
    detail:
      failure.kind === "root_sums_mismatch"
        ? t("failure.asset", { detail, asset: failure.asset })
        : detail,
    facts,
  };
}
