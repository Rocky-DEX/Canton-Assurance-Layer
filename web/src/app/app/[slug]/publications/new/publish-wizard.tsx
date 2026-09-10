"use client";

import { buildDesigner } from "canton-solvency-verifier/src/publisher";
import { designerTranslator } from "canton-solvency-verifier/src/i18n/designer-messages";
import { KNOWN_MANIFEST_FIELDS, type Disclosure, type Manifest, type Report } from "canton-solvency-verifier/src/report";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { parseBalancesCsv, type BalancesParse } from "@/lib/csv";
import { trimAmount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { publishAction } from "./actions";

type Previous = { snapshotTime: string; ledgerOffset: string; manifest: { audience: string; fields: Record<string, string> } | null };

const STATES: Disclosure[] = ["published", "committed", "withheld"];

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function PublishWizard({
  slug,
  publisher,
  previous,
  disabled,
}: {
  slug: string;
  publisher: string;
  previous: Previous | null;
  disabled: boolean;
}) {
  const t = useTranslations("wizard");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [parsed, setParsed] = useState<BalancesParse | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [snapshotTime, setSnapshotTime] = useState(nowIso());
  const [ledgerOffset, setLedgerOffset] = useState("");
  const [houseAccounts, setHouseAccounts] = useState(0);
  const [withManifest, setWithManifest] = useState(Boolean(previous?.manifest));
  const [audience, setAudience] = useState(previous?.manifest?.audience ?? "public");
  const [fields, setFields] = useState<Record<string, Disclosure>>(() => {
    const init: Record<string, Disclosure> = {};
    for (const path of KNOWN_MANIFEST_FIELDS) {
      const prev = previous?.manifest?.fields?.[path];
      init[path] = STATES.includes(prev as Disclosure) ? (prev as Disclosure) : path === "root_sums" ? "published" : path === "customer_balances" ? "committed" : "withheld";
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  const manifest = useMemo<Manifest | null>(() => (withManifest ? { audience, fields } : null), [withManifest, audience, fields]);

  // A draft of the report as the signing service will shape it, so the
  // designer can check the manifest against what will actually be published.
  const designer = useMemo(() => {
    if (!parsed || !manifest) return null;
    const draft = {
      format_version: "canton-solvency-report-v2",
      profile: "solvency.liabilities",
      publisher,
      snapshot_time: snapshotTime,
      ledger_offset: ledgerOffset,
      root_hash: "",
      leaf_count: parsed.leaves.length,
      root_sums: parsed.totals,
      mark_prices: {},
      disclosures: {
        bad_debt: parsed.negativeTotals,
        excluded_house_accounts: houseAccounts,
        excluded_house_totals: {},
      },
      manifest,
    } as unknown as Report;
    return buildDesigner(draft, manifest, previous?.manifest as Manifest | null, designerTranslator(locale === "zh-CN" ? "zh-CN" : "en"));
  }, [parsed, manifest, publisher, snapshotTime, ledgerOffset, houseAccounts, previous, locale]);

  const offsetOk = /^\d{1,40}$/.test(ledgerOffset);
  const timeOk = !Number.isNaN(Date.parse(snapshotTime));
  const advances = !previous || (snapshotTime > previous.snapshotTime && ledgerOffset >= previous.ledgerOffset);
  const ready =
    Boolean(parsed && parsed.leaves.length > 0 && parsed.errors.length === 0) &&
    offsetOk &&
    timeOk &&
    advances &&
    (!designer || designer.problems.length === 0) &&
    !disabled;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setParsed(parseBalancesCsv(text));
  }

  function publish() {
    if (!parsed) return;
    setError(null);
    start(async () => {
      const outcome = await publishAction(slug, {
        snapshot_time: snapshotTime,
        ledger_offset: ledgerOffset,
        leaves: parsed.leaves,
        disclosures: { excluded_house_accounts: houseAccounts },
        manifest,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        toast.error(t("failed"));
        return;
      }
      toast.success(t("published", { count: outcome.leafCount }));
      router.push(`/app/${slug}/publications/${outcome.id}`);
    });
  }

  return (
    <div className="grid gap-6">
      {/* Step 1: balances */}
      <Card>
        <CardHeader>
          <CardTitle>{t("step1.title")}</CardTitle>
          <CardDescription>{t("step1.body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 hover:bg-accent">
            <FileUp className="size-5 text-muted-foreground" aria-hidden />
            <span className="text-sm">{fileName || t("step1.choose")}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <p className="text-xs text-muted-foreground">
            {t("step1.sampleNote")}{" "}
            <a className="underline" href="/samples/balances.csv" download>
              balances.csv
            </a>
          </p>
          {parsed ? (
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap gap-4">
                <Stat label={t("step1.customers")} value={parsed.leaves.length} />
                <Stat label={t("step1.rows")} value={parsed.rows} />
                <Stat label={t("step1.negatives")} value={parsed.negatives} warn={parsed.negatives > 0} />
              </div>
              <div>
                <div className="text-muted-foreground">{t("step1.totals")}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(parsed.totals).map(([a, v]) => (
                    <Badge key={a} variant="secondary" className="font-mono">
                      {a} {trimAmount(v)}
                    </Badge>
                  ))}
                </div>
              </div>
              {parsed.negatives > 0 ? (
                <p className="text-muted-foreground">
                  {t("step1.negativesNote")}{" "}
                  {Object.entries(parsed.negativeTotals)
                    .map(([a, v]) => `${a} ${trimAmount(v)}`)
                    .join(", ")}
                </p>
              ) : null}
              {parsed.errors.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertTriangle className="size-4" /> {t("step1.errors", { count: parsed.errors.length })}
                  </div>
                  <ul className="mt-1 list-inside list-disc font-mono text-xs">
                    {parsed.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Step 2: the instant */}
      <Card>
        <CardHeader>
          <CardTitle>{t("step2.title")}</CardTitle>
          <CardDescription>{t("step2.body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="snapshot">{t("step2.snapshot")}</Label>
            <Input id="snapshot" value={snapshotTime} onChange={(e) => setSnapshotTime(e.target.value.trim())} className="font-mono" aria-invalid={!timeOk} />
            {previous ? (
              <p className="text-xs text-muted-foreground">
                {t("step2.previous")} <span className="font-mono">{previous.snapshotTime}</span>
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="offset">{t("step2.offset")}</Label>
            <Input id="offset" value={ledgerOffset} onChange={(e) => setLedgerOffset(e.target.value.trim())} placeholder="000000000000003042" className="font-mono" aria-invalid={ledgerOffset !== "" && !offsetOk} />
            {previous ? (
              <p className="text-xs text-muted-foreground">
                {t("step2.previous")} <span className="font-mono">{previous.ledgerOffset}</span>
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="house">{t("step2.house")}</Label>
            <Input id="house" type="number" min={0} value={houseAccounts} onChange={(e) => setHouseAccounts(Math.max(0, Number(e.target.value) || 0))} />
            <p className="text-xs text-muted-foreground">{t("step2.houseHint")}</p>
          </div>
          {!advances ? <p className="text-sm text-destructive sm:col-span-2">{t("step2.mustAdvance")}</p> : null}
        </CardContent>
      </Card>

      {/* Step 3: disclosure */}
      <Card>
        <CardHeader>
          <CardTitle>{t("step3.title")}</CardTitle>
          <CardDescription>{t("step3.body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withManifest} onChange={(e) => setWithManifest(e.target.checked)} />
            {t("step3.attach")}
          </label>
          {withManifest ? (
            <>
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="audience">{t("step3.audience")}</Label>
                <Input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} />
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 font-medium">{t("step3.field")}</th>
                    <th className="py-2 font-medium">{t("step3.state")}</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...KNOWN_MANIFEST_FIELDS].sort().map((path) => {
                    const row = designer?.fields.find((f) => f.path === path);
                    return (
                      <tr key={path} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{path}</td>
                        <td className="py-2">
                          <select
                            className="rounded-md border border-input bg-background px-2 py-1"
                            value={fields[path]}
                            onChange={(e) => setFields({ ...fields, [path]: e.target.value as Disclosure })}
                          >
                            {STATES.map((s) => (
                              <option key={s} value={s}>
                                {t(`step3.states.${s}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={`py-2 text-xs ${row?.problem ? "text-destructive" : "text-muted-foreground"}`}>
                          {row?.problem ?? (row?.carriesData ? t("step3.carries") : "")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {designer ? (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <ListBlock title={t("step3.problems")} items={designer.problems} tone="bad" empty={t("step3.noProblems")} />
                  <ListBlock title={t("step3.reduced")} items={designer.warnings} tone="warn" empty={t("step3.noReduction")} />
                  <ListBlock
                    title={t("step3.changes")}
                    items={designer.changes.map((c) => `${c.path}: ${c.from ?? "—"} → ${c.to ?? "—"}`)}
                    empty={previous?.manifest ? t("step3.noChanges") : t("step3.noPrevious")}
                  />
                  <div className="rounded-md border p-3">
                    <div className="font-medium">{t("step3.preview", { audience })}</div>
                    <dl className="mt-2 grid gap-1 text-xs">
                      <Pair k={t("step3.shown")} v={designer.preview.shown.join(", ") || tc("none")} />
                      <Pair k={t("step3.proven")} v={designer.preview.provenOnly.join(", ") || tc("none")} />
                      <Pair k={t("step3.withheld")} v={designer.preview.withheld.join(", ") || tc("none")} />
                    </dl>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("step3.needFile")}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("step3.v1Note")}</p>
          )}
        </CardContent>
      </Card>

      {/* Step 4: publish */}
      <Card>
        <CardHeader>
          <CardTitle>{t("step4.title")}</CardTitle>
          <CardDescription>{t("step4.body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid gap-1 text-sm">
            <Check ok={Boolean(parsed && parsed.errors.length === 0 && parsed.leaves.length > 0)} label={t("step4.checkFile")} />
            <Check ok={offsetOk && timeOk && advances} label={t("step4.checkInstant")} />
            <Check ok={!designer || designer.problems.length === 0} label={t("step4.checkManifest")} />
          </ul>
          {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
          <div>
            <Button onClick={publish} disabled={!ready || pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? t("step4.publishing") : t("step4.publish")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("step4.note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</div>
    </div>
  );
}

function ListBlock({ title, items, tone, empty }: { title: string; items: string[]; tone?: "bad" | "warn"; empty: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className={`font-medium ${tone === "bad" && items.length ? "text-destructive" : tone === "warn" && items.length ? "text-amber-600" : ""}`}>{title}</div>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 list-inside list-disc text-xs">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-muted-foreground" />}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}
