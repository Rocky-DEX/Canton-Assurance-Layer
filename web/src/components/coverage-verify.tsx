"use client";

import { coverageRows, type CoverageRow } from "canton-solvency-verifier/src/console";
import { verifyCoverage, type CoverageFailure, type CoverageStatement } from "canton-solvency-verifier/src/coverage";
import type { SignedReport } from "canton-solvency-verifier/src/report";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { trimAmount } from "@/lib/format";
import { ProvenanceBadge } from "@/components/provenance-badge";

type State =
  | { status: "loading" }
  | { status: "error"; detail: string }
  | { status: "done"; ok: boolean; failure: CoverageFailure | null; rows: CoverageRow[] };

/**
 * Fetches the three documents and re-runs the coverage rules in this browser,
 * so the table it draws is recomputed here and not the server's reading.
 */
export function CoverageVerify({
  custodyUrl,
  liabilitiesUrl,
  statementUrl,
  custodyKey,
  liabilitiesKey,
  maxSkew,
}: {
  custodyUrl: string;
  liabilitiesUrl: string;
  statementUrl: string;
  custodyKey: string;
  liabilitiesKey: string;
  maxSkew: number;
}) {
  const t = useTranslations("coverage.verify");
  const tc = useTranslations("common");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [custody, liabilities, statement] = (await Promise.all(
          [custodyUrl, liabilitiesUrl, statementUrl].map(async (u) => {
            const r = await fetch(u, { cache: "no-store" });
            if (!r.ok) throw new Error(`${u}: ${r.status}`);
            return r.json();
          })
        )) as [SignedReport, SignedReport, CoverageStatement];
        const result = await verifyCoverage(custody, liabilities, statement, custodyKey, liabilitiesKey, maxSkew);
        const rows = coverageRows(custody.report, liabilities.report);
        if (!cancelled) setState({ status: "done", ok: result.ok, failure: result.ok ? null : result.failure, rows });
      } catch (e) {
        if (!cancelled) setState({ status: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [custodyUrl, liabilitiesUrl, statementUrl, custodyKey, liabilitiesKey, maxSkew]);

  if (state.status === "loading") return <p className="text-sm text-muted-foreground">{t("running")}</p>;
  if (state.status === "error") return <p className="text-sm text-destructive">{t("error", { detail: state.detail })}</p>;

  const failureText = (f: CoverageFailure | null): string => {
    if (!f) return "";
    switch (f.kind) {
      case "shortfall":
        return t("failure.shortfall", { asset: f.asset });
      case "temporal_mismatch":
        return t("failure.temporal", { detail: f.detail });
      case "digest_mismatch":
        return t("failure.digest");
      case "unknown_signer":
        return t("failure.signer");
      case "bad_signature":
        return t("failure.signature");
      case "profile":
        return t("failure.profile", { detail: f.detail });
      case "unsupported_version":
        return t("failure.version", { found: f.found });
      default:
        return t("failure.malformed", { detail: "detail" in f ? f.detail : "" });
    }
  };

  return (
    <div className="grid gap-3">
      <div className={`rounded-md border-l-4 p-3 text-sm ${state.ok ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-destructive bg-destructive/5"}`}>
        <div className="flex items-center gap-2 font-medium">
          {state.ok ? t("ok") : t("notOk")} <ProvenanceBadge kind="verified" />
        </div>
        <div className="text-muted-foreground">{state.ok ? t("okBody") : failureText(state.failure)}</div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 font-medium">{tc("asset")}</th>
            <th className="py-2 font-medium">{tc("held")}</th>
            <th className="py-2 font-medium">{tc("owed")}</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {state.rows.map((r) => (
            <tr key={r.asset} className="border-b last:border-0">
              <td className="py-2 font-medium">{r.asset}</td>
              <td className="py-2 font-mono text-xs" title={r.held}>
                {trimAmount(r.held)}
              </td>
              <td className="py-2 font-mono text-xs" title={r.owed}>
                {trimAmount(r.owed)}
              </td>
              <td className="py-2 text-right">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.covered ? "bg-emerald-600 text-white" : "bg-destructive text-white"}`}>
                  {r.covered ? tc("covered") : tc("short")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
