"use client";

import { verifierTranslator } from "canton-solvency-verifier/src/i18n/verifier-messages";
import { verifyFromText, type ViewModel } from "canton-solvency-verifier/src/offline";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ProvenanceBadge } from "@/components/provenance-badge";

type State = { status: "loading" } | { status: "done"; vm: ViewModel } | { status: "error"; detail: string };

/**
 * The customer's own check, in the customer's browser: the same
 * `verifyFromText` the offline page runs, over the same two files, in the
 * same language. The server handed over the files and nothing else.
 */
export function ProofVerify({ reportUrl, proofUrl, trustedKeyHex }: { reportUrl: string; proofUrl: string; trustedKeyHex: string }) {
  const locale = useLocale();
  const t = useTranslations("portal.verify");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [report, proof] = await Promise.all(
          [reportUrl, proofUrl].map(async (u) => {
            const r = await fetch(u, { cache: "no-store" });
            if (!r.ok) throw new Error(`${r.status}`);
            return r.text();
          })
        );
        const vm = await verifyFromText(report, proof, trustedKeyHex, undefined, verifierTranslator(locale === "zh-CN" ? "zh-CN" : "en"));
        if (!cancelled) setState({ status: "done", vm });
      } catch (e) {
        if (!cancelled) setState({ status: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportUrl, proofUrl, trustedKeyHex, locale]);

  if (state.status === "loading") return <p className="text-sm text-muted-foreground">{t("running")}</p>;
  if (state.status === "error") return <p className="text-sm text-destructive">{t("error", { detail: state.detail })}</p>;

  const { vm } = state;
  const tone = vm.status === "verified" ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : vm.status === "failed" ? "border-destructive bg-destructive/5" : "border-amber-500 bg-amber-50 dark:bg-amber-950/30";
  return (
    <div className="grid gap-3">
      <div className={`rounded-md border-l-4 p-3 ${tone}`}>
        <div className="font-medium">{vm.headline}</div>
        <div className="text-sm text-muted-foreground">{vm.detail}</div>
      </div>
      {vm.facts.length > 0 ? (
        <table className="w-full text-sm">
          <tbody>
            {vm.facts.map((f) => (
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
      ) : null}
    </div>
  );
}
