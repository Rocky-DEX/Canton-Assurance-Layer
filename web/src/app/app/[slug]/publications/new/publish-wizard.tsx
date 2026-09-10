"use client";

import { buildDesigner } from "canton-solvency-verifier/src/publisher";
import { designerTranslator } from "canton-solvency-verifier/src/i18n/designer-messages";
import { KNOWN_MANIFEST_FIELDS, type Disclosure, type Manifest, type Report } from "canton-solvency-verifier/src/report";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { parseBalancesCsv, type BalancesParse } from "@/lib/csv";
import { trimAmount } from "@/lib/format";
import { isIso, isoNow, plusSeconds } from "@/lib/instant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePick } from "@/components/form/file-pick";
import { FormError } from "@/components/form/form-error";
import { InstantField } from "@/components/form/instant-field";
import { LedgerOffsetField, compareOffsets } from "@/components/form/ledger-offset-field";

import { publishAction } from "./actions";

type Previous = { snapshotTime: string; ledgerOffset: string; manifest: { audience: string; fields: Record<string, string> } | null };

const STATES: Disclosure[] = ["published", "committed", "withheld"];
const AUDIENCES = ["public", "auditor", "customer", "regulator", "counterparty"];

/** Message key for a manifest field path (`disclosures.bad_debt` → `disclosures_bad_debt`). */
function fieldKey(path: string): string {
  return path.replace(/\./g, "_");
}

/**
 * Defaults that pass the advance rule on their own: the snapshot is now, or a
 * minute after the previous one when "now" would not be later; the offset is
 * the previous one plus one. An operator who wants exact values overwrites
 * them; one who is trying the console gets through.
 */
function defaultInstant(previous: Previous | null): string {
  const now = isoNow();
  if (previous && now <= previous.snapshotTime) return plusSeconds(previous.snapshotTime, 60) ?? now;
  return now;
}

function defaultOffset(previous: Previous | null): string {
  return previous && /^\d+$/.test(previous.ledgerOffset) ? (BigInt(previous.ledgerOffset) + 1n).toString() : "";
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
  const [snapshotTime, setSnapshotTime] = useState(() => defaultInstant(previous));
  const [ledgerOffset, setLedgerOffset] = useState(() => defaultOffset(previous));
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
  const timeOk = isIso(snapshotTime);
  // Offsets compare as numbers here; the wire pads them to one width so the
  // string comparison the format specifies agrees.
  const advances =
    !previous || (snapshotTime > previous.snapshotTime && (compareOffsets(ledgerOffset, previous.ledgerOffset) ?? -1) >= 0);
  const fileOk = Boolean(parsed && parsed.leaves.length > 0 && parsed.errors.length === 0);
  const manifestOk = !designer || designer.problems.length === 0;
  const ready = fileOk && offsetOk && timeOk && advances && manifestOk && !disabled;

  function onText(text: string, name: string) {
    setFileName(name);
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
          <FilePick
            id="balances"
            accept=".csv,text/csv"
            fileName={fileName}
            onText={onText}
            prompt={t("step1.choose")}
            sample={{ url: "/samples/balances.csv", name: "balances.csv", note: t("step1.sampleNote") }}
          />
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
          <InstantField
            id="snapshot"
            label={t("step2.snapshot")}
            value={snapshotTime}
            onChange={setSnapshotTime}
            previous={previous?.snapshotTime}
            hint={t("step2.snapshotHint")}
          />
          <LedgerOffsetField id="offset" label={t("step2.offset")} value={ledgerOffset} onChange={setLedgerOffset} previous={previous?.ledgerOffset} />
          <div className="grid gap-2">
            <Label htmlFor="house">{t("step2.house")}</Label>
            <Input id="house" type="number" min={0} inputMode="numeric" value={houseAccounts} onChange={(e) => setHouseAccounts(Math.max(0, Number(e.target.value) || 0))} />
            <p className="text-xs text-muted-foreground">{t("step2.houseHint")}</p>
          </div>
          {previous ? <p className="text-xs text-muted-foreground sm:col-span-2">{t("step2.defaultsNote")}</p> : null}
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
          <p className="text-xs text-muted-foreground">{t("step3.attachHint")}</p>
          {withManifest ? (
            <>
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="audience">{t("step3.audience")}</Label>
                <Input id="audience" list="audiences" value={audience} onChange={(e) => setAudience(e.target.value)} />
                <datalist id="audiences">
                  {AUDIENCES.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">{t("step3.audienceHint")}</p>
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
                        <td className="py-2">
                          <div className="text-sm">{t(`step3.fields.${fieldKey(path)}`)}</div>
                          <div className="font-mono text-xs text-muted-foreground">{path}</div>
                        </td>
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
            <Check ok={fileOk} label={t("step4.checkFile")} todo={t("step4.checkFileTodo")} />
            <Check ok={offsetOk && timeOk && advances} label={t("step4.checkInstant")} todo={t("step4.checkInstantTodo")} />
            <Check ok={manifestOk} label={t("step4.checkManifest")} todo={t("step4.checkManifestTodo")} />
            {disabled ? <Check ok={false} label="" todo={t("step4.serviceTodo")} /> : null}
          </ul>
          <FormError error={error} />
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

function Check({ ok, label, todo }: { ok: boolean; label: string; todo: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-amber-600" />}
      <span className={ok ? "" : "text-muted-foreground"}>{ok ? label : todo}</span>
    </li>
  );
}
