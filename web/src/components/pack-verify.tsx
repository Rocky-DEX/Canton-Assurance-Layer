"use client";

import { packDigestHex, verifyPack, type SignedPack } from "canton-solvency-verifier/src/pack";
import { verifyEd25519 } from "canton-solvency-verifier/src/report";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ProvenanceBadge } from "@/components/provenance-badge";

type Outcome = { ok: true; members: number } | { ok: false; detail: string };

/**
 * Re-verifies an evidence pack in the browser: fetch the signed index, check
 * its signature, fetch every member it names, check each digest, and refuse
 * anything unlisted. A delivery with one proof missing fails here even though
 * every file that remains is perfectly valid.
 */
export function PackVerify({ fileUrl, trustedKeyHex }: { fileUrl: (name: string) => string; trustedKeyHex: string }) {
  const t = useTranslations("audit.pack");
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<string>("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  function run() {
    setOutcome(null);
    start(async () => {
      try {
        const packRes = await fetch(fileUrl("pack.json"), { cache: "no-store" });
        if (!packRes.ok) throw new Error(`pack.json: ${packRes.status}`);
        const signed = (await packRes.json()) as SignedPack;
        const digest = await packDigestHex(signed.pack);
        const sigOk =
          signed.signature.public_key.toLowerCase() === trustedKeyHex.toLowerCase() &&
          (await verifyEd25519(trustedKeyHex, digest, signed.signature.value));
        if (!sigOk) {
          setOutcome({ ok: false, detail: t("badSignature") });
          return;
        }
        const members = new Map<string, Uint8Array>();
        let i = 0;
        for (const entry of signed.pack.entries) {
          i++;
          setProgress(t("fetching", { i, n: signed.pack.entries.length }));
          const r = await fetch(fileUrl(entry.name), { cache: "no-store" });
          if (!r.ok) {
            setOutcome({ ok: false, detail: t("missing", { name: entry.name }) });
            return;
          }
          members.set(entry.name, new Uint8Array(await r.arrayBuffer()));
        }
        const result = await verifyPack(signed, members);
        if (result.ok) setOutcome({ ok: true, members: members.size });
        else {
          const f = result as { failure: string; name?: string; found?: string };
          setOutcome({ ok: false, detail: t(`failure.${f.failure}`, { name: f.name ?? "", found: f.found ?? "" }) });
        }
      } catch (e) {
        setOutcome({ ok: false, detail: e instanceof Error ? e.message : String(e) });
      } finally {
        setProgress("");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div>
        <Button onClick={run} disabled={pending} variant="outline">
          {pending ? progress || t("running") : t("run")}
        </Button>
      </div>
      {outcome ? (
        <div className={`rounded-md border-l-4 p-3 text-sm ${outcome.ok ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-destructive bg-destructive/5"}`}>
          <div className="flex items-center gap-2 font-medium">
            {outcome.ok ? t("ok", { count: outcome.members }) : t("notOk")} <ProvenanceBadge kind="verified" />
          </div>
          {!outcome.ok ? <div className="text-muted-foreground">{outcome.detail}</div> : <div className="text-muted-foreground">{t("okBody")}</div>}
        </div>
      ) : null}
    </div>
  );
}
