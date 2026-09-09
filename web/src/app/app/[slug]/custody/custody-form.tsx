"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { attestCustodyAction } from "./actions";

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

type Preview = { entries: number; assets: Record<string, number> } | { error: string };

export function CustodyForm({ slug, disabled }: { slug: string; disabled: boolean }) {
  const t = useTranslations("custody.form");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState("");
  const [body, setBody] = useState<string | null>(null);
  const [assetField, setAssetField] = useState("instrument");
  const [amountField, setAmountField] = useState("amount");
  const [snapshotTime, setSnapshotTime] = useState(nowIso());
  const [ledgerOffset, setLedgerOffset] = useState("");
  const [basis, setBasis] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A shape check only; the service parses and commits.
  const preview: Preview | null = (() => {
    if (body === null) return null;
    try {
      const parsed = JSON.parse(body) as unknown;
      if (!Array.isArray(parsed)) return { error: t("notArray") };
      const assets: Record<string, number> = {};
      for (const item of parsed) {
        const args = (item as { contractEntry?: { JsActiveContract?: { createdEvent?: { createArgument?: Record<string, unknown> } } } })
          ?.contractEntry?.JsActiveContract?.createdEvent?.createArgument;
        const asset = args?.[assetField];
        if (typeof asset === "string") assets[asset] = (assets[asset] ?? 0) + 1;
      }
      return { entries: parsed.length, assets };
    } catch {
      return { error: t("notJson") };
    }
  })();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setBody(await file.text());
  }

  function submit() {
    if (body === null) return;
    setError(null);
    start(async () => {
      const outcome = await attestCustodyAction(slug, {
        snapshot_time: snapshotTime,
        ledger_offset: ledgerOffset,
        response_json: body,
        asset_field: assetField,
        amount_field: amountField,
        custody_basis: basis,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        toast.error(t("failed"));
        return;
      }
      toast.success(t("done", { count: outcome.positions }));
      setBody(null);
      setFileName("");
      router.refresh();
    });
  }

  const ready = body !== null && preview !== null && !("error" in preview) && /^\d{1,40}$/.test(ledgerOffset) && basis.trim().length >= 3 && !disabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 hover:bg-accent">
          <FileUp className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-sm">{fileName || t("choose")}</span>
          <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <p className="text-xs text-muted-foreground">
          {t("sampleNote")}{" "}
          <a className="underline" href="/samples/holdings.json" download>
            holdings.json
          </a>
        </p>
        {preview ? (
          "error" in preview ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("preview", { entries: preview.entries })}{" "}
              {Object.entries(preview.assets)
                .map(([a, n]) => `${a} ×${n}`)
                .join(", ")}
            </p>
          )
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="assetField">{t("assetField")}</Label>
            <Input id="assetField" value={assetField} onChange={(e) => setAssetField(e.target.value.trim())} className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amountField">{t("amountField")}</Label>
            <Input id="amountField" value={amountField} onChange={(e) => setAmountField(e.target.value.trim())} className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cSnapshot">{t("snapshot")}</Label>
            <Input id="cSnapshot" value={snapshotTime} onChange={(e) => setSnapshotTime(e.target.value.trim())} className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cOffset">{t("offset")}</Label>
            <Input id="cOffset" value={ledgerOffset} onChange={(e) => setLedgerOffset(e.target.value.trim())} placeholder="000000000000003042" className="font-mono" />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="basis">{t("basis")}</Label>
            <Input id="basis" value={basis} onChange={(e) => setBasis(e.target.value)} placeholder={t("basisPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("basisHint")}</p>
          </div>
        </div>
        {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        <div>
          <Button onClick={submit} disabled={!ready || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("submit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
