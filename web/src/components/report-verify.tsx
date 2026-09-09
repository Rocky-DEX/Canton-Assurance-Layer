"use client";

import { reportDigestHex, verifyEd25519, type SignedReport } from "canton-solvency-verifier/src/report";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { amountMap, trimAmount } from "@/lib/format";
import { ProvenanceBadge, type Provenance } from "@/components/provenance-badge";

type Fact = { label: string; value: string; provenance: Provenance; title?: string };

type State =
  | { status: "loading" }
  | { status: "error"; detail: string }
  | { status: "done"; digestOk: boolean; signatureOk: boolean; facts: Fact[] };

/**
 * Re-derives what a report file alone can prove, in this browser: its digest,
 * and that the signature over that digest verifies under the trusted key. The
 * figures inside are the publisher's statement until a proof folds into them,
 * and are labelled so.
 */
export function ReportVerify({
  fileUrl,
  expectedDigest,
  trustedKeyHex,
}: {
  fileUrl: string;
  expectedDigest: string;
  trustedKeyHex: string;
}) {
  const t = useTranslations("publication");
  const tc = useTranslations("common");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        const signed = (await res.json()) as SignedReport;
        const digest = await reportDigestHex(signed.report);
        const digestOk = digest === expectedDigest;
        const signatureOk =
          signed.signature.public_key.toLowerCase() === trustedKeyHex.toLowerCase() &&
          (await verifyEd25519(trustedKeyHex, digest, signed.signature.value));
        const r = signed.report;
        const facts: Fact[] = [
          { label: tc("digest"), value: digest, provenance: "verified" },
          { label: t("verify.signature"), value: signatureOk ? t("verify.signatureOk") : t("verify.signatureBad"), provenance: "verified" },
          { label: tc("root"), value: r.root_hash, provenance: "disclosed" },
          {
            label: t("verify.totals"),
            value: amountMap(r.root_sums).map(([a, v]) => `${a} ${trimAmount(v)}`).join(", ") || tc("none"),
            provenance: "disclosed",
          },
          { label: tc("entries"), value: String(r.leaf_count), provenance: "disclosed" },
          { label: tc("publisher"), value: r.publisher, provenance: "disclosed" },
          { label: tc("snapshot"), value: r.snapshot_time, provenance: "disclosed" },
          { label: tc("ledgerOffset"), value: r.ledger_offset, provenance: "disclosed" },
          {
            label: t("verify.badDebt"),
            value: amountMap(r.disclosures?.bad_debt).map(([a, v]) => `${a} ${trimAmount(v)}`).join(", ") || tc("none"),
            provenance: "disclosed",
          },
          { label: t("verify.houseExcluded"), value: String(r.disclosures?.excluded_house_accounts ?? 0), provenance: "disclosed" },
        ];
        if (!cancelled) setState({ status: "done", digestOk, signatureOk, facts });
      } catch (e) {
        if (!cancelled) setState({ status: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, expectedDigest, trustedKeyHex, t, tc]);

  if (state.status === "loading") return <p className="text-sm text-muted-foreground">{t("verify.running")}</p>;
  if (state.status === "error") return <p className="text-sm text-destructive">{t("verify.error", { detail: state.detail })}</p>;

  const ok = state.digestOk && state.signatureOk;
  return (
    <div className="grid gap-3">
      <div
        className={`rounded-md border-l-4 p-3 text-sm ${ok ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-destructive bg-destructive/5"}`}
      >
        <div className="font-medium">{ok ? t("verify.ok") : t("verify.notOk")}</div>
        <div className="text-muted-foreground">{ok ? t("verify.okBody") : t("verify.notOkBody")}</div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {state.facts.map((f) => (
            <tr key={f.label} className="border-t">
              <th scope="row" className="w-44 py-2 pr-3 text-left font-medium">
                {f.label}
              </th>
              <td className="py-2 pr-3 font-mono text-xs break-all">{f.value}</td>
              <td className="py-2 text-right">
                <ProvenanceBadge kind={f.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">{t("verify.footnote")}</p>
    </div>
  );
}
