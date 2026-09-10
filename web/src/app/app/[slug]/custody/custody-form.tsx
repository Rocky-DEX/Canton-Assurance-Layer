"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePick } from "@/components/form/file-pick";
import { FormError } from "@/components/form/form-error";
import { InstantField } from "@/components/form/instant-field";
import { LedgerOffsetField, compareOffsets } from "@/components/form/ledger-offset-field";
import { isIso, isoNow, plusSeconds } from "@/lib/instant";

import { attestCustodyAction } from "./actions";

type Previous = { snapshotTime: string; ledgerOffset: string } | null;

type Detected = {
  entries: number;
  /** Field name → how many entries carry it, for the two dropdowns. */
  fields: Record<string, number>;
  /** Field name → distinct string values seen, to pick the asset field by eye. */
  samples: Record<string, string[]>;
};

type Preview = Detected | { error: string };

const BASIS_SUGGESTIONS = [
  "omnibus custody party venue::custody, template Holding",
  "segregated custody per customer, template Holding",
  "third-party custodian attestation, template CustodyPosition",
];

/** Reads the create arguments out of a v2 active-contracts response; a shape check only. */
function detect(body: string, notArray: string, notJson: string): Preview {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed)) return { error: notArray };
    const fields: Record<string, number> = {};
    const samples: Record<string, string[]> = {};
    for (const item of parsed) {
      const args = (item as { contractEntry?: { JsActiveContract?: { createdEvent?: { createArgument?: Record<string, unknown> } } } })
        ?.contractEntry?.JsActiveContract?.createdEvent?.createArgument;
      if (!args) continue;
      for (const [k, v] of Object.entries(args)) {
        fields[k] = (fields[k] ?? 0) + 1;
        if (typeof v === "string" || typeof v === "number") {
          const list = (samples[k] ??= []);
          if (list.length < 3 && !list.includes(String(v))) list.push(String(v));
        }
      }
    }
    return { entries: parsed.length, fields, samples };
  } catch {
    return { error: notJson };
  }
}

function guess(fields: string[], candidates: string[], fallback: string): string {
  return candidates.find((c) => fields.includes(c)) ?? fields[0] ?? fallback;
}

export function CustodyForm({ slug, disabled, previous }: { slug: string; disabled: boolean; previous: Previous }) {
  const t = useTranslations("custody.form");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState("");
  const [body, setBody] = useState<string | null>(null);
  const [assetField, setAssetField] = useState("instrument");
  const [amountField, setAmountField] = useState("amount");
  const [snapshotTime, setSnapshotTime] = useState(() => {
    const now = isoNow();
    return previous && now <= previous.snapshotTime ? (plusSeconds(previous.snapshotTime, 60) ?? now) : now;
  });
  const [ledgerOffset, setLedgerOffset] = useState(() =>
    previous && /^\d+$/.test(previous.ledgerOffset) ? (BigInt(previous.ledgerOffset) + 1n).toString() : ""
  );
  const [basis, setBasis] = useState("");
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo<Preview | null>(() => (body === null ? null : detect(body, t("notArray"), t("notJson"))), [body, t]);
  const detected = preview && !("error" in preview) ? preview : null;
  const fieldNames = detected ? Object.keys(detected.fields) : [];

  function onText(text: string, name: string) {
    setFileName(name);
    setBody(text);
    const d = detect(text, "", "");
    if (!("error" in d)) {
      const names = Object.keys(d.fields);
      if (names.length > 0) {
        setAssetField(guess(names, ["instrument", "asset", "symbol", "token", "currency"], assetField));
        setAmountField(guess(names, ["amount", "quantity", "balance", "value"], amountField));
      }
    }
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

  const offsetOk = /^\d{1,40}$/.test(ledgerOffset);
  const advances =
    !previous || (snapshotTime > previous.snapshotTime && (compareOffsets(ledgerOffset, previous.ledgerOffset) ?? -1) >= 0);
  const ready = detected !== null && isIso(snapshotTime) && offsetOk && advances && basis.trim().length >= 3 && !disabled;

  const select = "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm font-mono";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FilePick
          id="custodyFile"
          accept=".json,application/json"
          fileName={fileName}
          onText={onText}
          prompt={t("choose")}
          sample={{ url: "/samples/holdings.json", name: "holdings.json", note: t("sampleNote") }}
        />
        {preview ? (
          "error" in preview ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("preview", { entries: preview.entries })}{" "}
              {Object.entries(preview.fields)
                .map(([f, n]) => `${f} ×${n}`)
                .join(", ")}
            </p>
          )
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="assetField">{t("assetField")}</Label>
            {fieldNames.length > 0 ? (
              <select id="assetField" className={select} value={assetField} onChange={(e) => setAssetField(e.target.value)}>
                {fieldNames.map((f) => (
                  <option key={f} value={f}>
                    {f}
                    {detected?.samples[f]?.length ? ` — ${detected.samples[f].join(", ")}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <Input id="assetField" value={assetField} onChange={(e) => setAssetField(e.target.value.trim())} className="font-mono" />
            )}
            <p className="text-xs text-muted-foreground">{t("assetFieldHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amountField">{t("amountField")}</Label>
            {fieldNames.length > 0 ? (
              <select id="amountField" className={select} value={amountField} onChange={(e) => setAmountField(e.target.value)}>
                {fieldNames.map((f) => (
                  <option key={f} value={f}>
                    {f}
                    {detected?.samples[f]?.length ? ` — ${detected.samples[f].join(", ")}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <Input id="amountField" value={amountField} onChange={(e) => setAmountField(e.target.value.trim())} className="font-mono" />
            )}
            <p className="text-xs text-muted-foreground">{t("amountFieldHint")}</p>
          </div>
          <InstantField id="cSnapshot" label={t("snapshot")} value={snapshotTime} onChange={setSnapshotTime} previous={previous?.snapshotTime} hint={t("snapshotHint")} />
          <LedgerOffsetField id="cOffset" label={t("offset")} value={ledgerOffset} onChange={setLedgerOffset} previous={previous?.ledgerOffset} />
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="basis">{t("basis")}</Label>
            <Input id="basis" list="basisSuggestions" value={basis} onChange={(e) => setBasis(e.target.value)} placeholder={t("basisPlaceholder")} />
            <datalist id="basisSuggestions">
              {BASIS_SUGGESTIONS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">{t("basisHint")}</p>
          </div>
        </div>
        <FormError error={error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={!ready || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("submit")}
          </Button>
          {!ready && !pending ? (
            <span className="text-xs text-muted-foreground">
              {disabled
                ? t("todo.service")
                : detected === null
                  ? t("todo.file")
                  : !advances || !offsetOk || !isIso(snapshotTime)
                    ? t("todo.instant")
                    : t("todo.basis")}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
