"use client";

import type { Anchor } from "canton-solvency-verifier/src/anchor";
import { historyRows, type HistoryRow } from "canton-solvency-verifier/src/console";
import { verifyAnchorChain, type ChainFailure } from "canton-solvency-verifier/src/coverage";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { shortHex } from "@/lib/format";
import { ProvenanceBadge } from "@/components/provenance-badge";

type State =
  | { status: "loading" }
  | { status: "error"; detail: string }
  | { status: "done"; rows: HistoryRow[]; anchors: Anchor[]; chain: { ok: true } | { ok: false; failure: ChainFailure } };

/**
 * Walks the anchor chain in this browser: each anchor's predecessor digest is
 * recomputed, never read off the document. A restated instant or a rewound
 * offset is a break in the row where it happened, not a footnote.
 */
export function AnchorHistory({ url, publicationHref }: { url: string; publicationHref?: (digest: string) => string | null }) {
  const t = useTranslations("history");
  const tc = useTranslations("common");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        const anchors = (await res.json()) as Anchor[];
        const [rows, chain] = await Promise.all([historyRows(anchors), verifyAnchorChain(anchors)]);
        if (!cancelled) setState({ status: "done", rows, anchors, chain });
      } catch (e) {
        if (!cancelled) setState({ status: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === "loading") return <p className="text-sm text-muted-foreground">{t("running")}</p>;
  if (state.status === "error") return <p className="text-sm text-destructive">{t("error", { detail: state.detail })}</p>;
  if (state.anchors.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  const chainText = (() => {
    if (state.chain.ok) return t("intact", { count: state.anchors.length });
    const f = state.chain.failure;
    switch (f.kind) {
      case "broken":
        return t("failure.broken", { index: f.index });
      case "not_genesis":
        return t("failure.notGenesis");
      case "publisher_changed":
        return t("failure.publisher", { index: f.index });
      case "went_backwards":
        return t("failure.backwards", { index: f.index, field: f.field });
      case "unsupported_version":
        return t("failure.version", { index: f.index, found: f.found });
      default:
        return t("failure.malformed", { detail: "detail" in f ? f.detail : "" });
    }
  })();

  return (
    <div className="grid gap-3">
      <div className={`rounded-md border-l-4 p-3 text-sm ${state.chain.ok ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-destructive bg-destructive/5"}`}>
        <div className="flex items-center gap-2 font-medium">
          {chainText} <ProvenanceBadge kind="verified" />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 font-medium">#</th>
            <th className="py-2 font-medium">{tc("snapshot")}</th>
            <th className="py-2 font-medium">{tc("ledgerOffset")}</th>
            <th className="py-2 font-medium">{t("report")}</th>
            <th className="py-2 font-medium">{t("anchor")}</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {state.rows.map((r, i) => {
            const a = state.anchors[i];
            const href = publicationHref?.(r.reportDigest) ?? null;
            return (
              <tr key={r.index} className="border-b last:border-0" title={r.problem ?? undefined}>
                <td className="py-2 tabular-nums">{r.index}</td>
                <td className="py-2 font-mono text-xs">{r.snapshotTime}</td>
                <td className="py-2 font-mono text-xs">{a.ledger_offset}</td>
                <td className="py-2 font-mono text-xs" title={r.reportDigest}>
                  {href ? (
                    <a className="underline" href={href}>
                      {shortHex(r.reportDigest)}
                    </a>
                  ) : (
                    shortHex(r.reportDigest)
                  )}
                </td>
                <td className="py-2 font-mono text-xs" title={a.prev_anchor ?? ""}>
                  {a.prev_anchor ? `← ${shortHex(a.prev_anchor, 6, 4)}` : t("genesis")}
                </td>
                <td className="py-2 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.linked ? "bg-emerald-600 text-white" : "bg-destructive text-white"}`}>
                    {r.linked ? tc("linked") : tc("break")}
                  </span>
                  {r.problem ? <div className="mt-1 text-xs text-destructive">{r.problem}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
