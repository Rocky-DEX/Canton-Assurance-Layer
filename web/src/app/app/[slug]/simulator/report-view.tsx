"use client";

import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AmuletFeeQuote,
  ContractState,
  Diagnosis,
  EffectNode,
  FeeSchedule,
  Outcome,
  SimulationReport,
  StandaloneFeeQuote,
  TrafficQuote,
} from "@/lib/simulator";
import { cn } from "@/lib/utils";

/** Decimal strings from the simulator are exact; trim trailing zeros for display only. */
function dec(s: string | undefined): string {
  if (s === undefined) return "";
  if (!/^-?\d+\.\d+$/.test(s)) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

function short(id: string, head = 10, tail = 6): string {
  return id.length > head + tail + 3 ? `${id.slice(0, head)}…${id.slice(-tail)}` : id;
}

function Mono({ children, title, className }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span className={cn("font-mono text-xs break-all", className)} title={title}>
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function Parties({ list }: { list?: string[] }) {
  const t = useTranslations("common");
  if (!list || list.length === 0) return <span className="text-muted-foreground">{t("none")}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((p) => (
        <Mono key={p} title={p} className="rounded bg-muted px-1.5 py-0.5">
          {short(p, 14, 8)}
        </Mono>
      ))}
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const t = useTranslations("simulator.report");
  const Icon = outcome === "would_succeed" ? CheckCircle2 : outcome === "would_fail" ? XCircle : CircleHelp;
  return (
    <span
      title={t(`outcomeHint.${outcome}`)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        outcome === "would_succeed" && "bg-emerald-600 text-white dark:bg-emerald-500",
        outcome === "would_fail" && "bg-destructive text-white",
        outcome === "inconclusive" && "bg-amber-500 text-white"
      )}
    >
      <Icon className="size-4" aria-hidden />
      {t(`outcome.${outcome}`)}
    </span>
  );
}

/** Copy-to-clipboard plus a collapsible raw JSON block, for any result. */
export function RawJson({ value, name }: { value: unknown; name: string }) {
  const t = useTranslations("simulator.report");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(value, null, 2);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? t("hideRaw") : t("showRaw")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(json).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? tc("copied") : t("copyJson")}
        </Button>
        <a
          className="inline-flex h-7 items-center rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-accent"
          href={`data:application/json;charset=utf-8,${encodeURIComponent(json)}`}
          download={name}
        >
          {tc("download")}
        </a>
      </div>
      {open ? <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">{json}</pre> : null}
    </div>
  );
}

export function TrafficView({ quote }: { quote: TrafficQuote }) {
  const t = useTranslations("simulator.report");
  return (
    <dl className="grid gap-2">
      <Row label={t("trafficBytes")}>
        <span className="tabular-nums">{quote.cost.total.toLocaleString()}</span>{" "}
        <span className="text-xs text-muted-foreground">
          ({t("request")} {quote.cost.confirmation_request.toLocaleString()} + {t("response")}{" "}
          {quote.cost.confirmation_response.toLocaleString()})
        </span>
      </Row>
      <Row label={t("usd")}>
        <span className="tabular-nums">{dec(quote.usd)}</span>
      </Row>
      <Row label={t("cc")}>
        <span className="tabular-nums">{dec(quote.cc)}</span>
      </Row>
      <Row label={t("pricingSource")}>
        <Badge variant={quote.pricing.source === "splice-defaults" ? "destructive" : "outline"}>{quote.pricing.source}</Badge>{" "}
        <span className="text-xs text-muted-foreground">
          {dec(quote.pricing.extra_traffic_price_usd_per_mb)} USD/MB · {dec(quote.pricing.amulet_price_usd)} USD/CC
        </span>
      </Row>
      {quote.note ? (
        <Row label={t("note")}>
          <span className="text-muted-foreground">{quote.note}</span>
        </Row>
      ) : null}
    </dl>
  );
}

export function AmuletView({ quote }: { quote: AmuletFeeQuote }) {
  const t = useTranslations("simulator.report");
  return (
    <dl className="grid gap-2">
      <Row label={t("transferFee")}>
        <span className="tabular-nums">{dec(quote.transfer_fee_usd)} USD</span>
      </Row>
      <Row label={t("createFee")}>
        <span className="tabular-nums">{dec(quote.create_fee_usd)} USD</span>
      </Row>
      {quote.lock_holder_fee_usd !== "0" && quote.lock_holder_fee_usd !== "0.0" ? (
        <Row label={t("lockHolderFee")}>
          <span className="tabular-nums">{dec(quote.lock_holder_fee_usd)} USD</span>
        </Row>
      ) : null}
      <Row label={t("total")}>
        <span className="tabular-nums font-medium">
          {dec(quote.total_usd)} USD ≈ {dec(quote.total_cc)} CC
        </span>{" "}
        <span className="text-xs text-muted-foreground">{t("outputs", { count: quote.outputs })}</span>
      </Row>
      <Row label={t("pricingSource")}>
        <Badge variant={quote.schedule_source === "splice-defaults" ? "destructive" : "outline"}>{quote.schedule_source}</Badge>{" "}
        <span className="text-xs text-muted-foreground">{dec(quote.amulet_price_usd)} USD/CC</span>
      </Row>
    </dl>
  );
}

export function ScheduleView({ schedule }: { schedule: FeeSchedule }) {
  const t = useTranslations("simulator.fee");
  return (
    <dl className="grid gap-2">
      <Row label={t("scheduleSource")}>
        <Badge variant={schedule.traffic.source === "splice-defaults" ? "destructive" : "outline"}>{schedule.traffic.source}</Badge>
      </Row>
      <Row label={t("trafficPrice")}>
        <span className="tabular-nums">{dec(schedule.traffic.extra_traffic_price_usd_per_mb)} USD/MB</span>
      </Row>
      <Row label={t("ccPrice")}>
        <span className="tabular-nums">{dec(schedule.traffic.amulet_price_usd)} USD</span>
      </Row>
      <Row label={t("createFee")}>
        <span className="tabular-nums">{dec(schedule.amulet.create_fee_usd)} USD</span>
      </Row>
      <Row label={t("lockHolderFee")}>
        <span className="tabular-nums">{dec(schedule.amulet.lock_holder_fee_usd)} USD</span>
      </Row>
      <Row label={t("initialRate")}>
        <span className="tabular-nums">{dec(schedule.amulet.transfer_fee_initial_rate)}</span>
        {schedule.amulet.transfer_fee_steps.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {" "}
            · {schedule.amulet.transfer_fee_steps.map(([at, rate]) => `${dec(rate)} @ ${dec(at)} USD`).join(", ")}
          </span>
        ) : null}
      </Row>
    </dl>
  );
}

export function FeeQuoteView({ quote }: { quote: StandaloneFeeQuote }) {
  const t = useTranslations("simulator.report");
  return (
    <div className="grid gap-4">
      {quote.traffic ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("traffic")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrafficView quote={quote.traffic} />
          </CardContent>
        </Card>
      ) : null}
      {quote.amulet_fee ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("amuletFee")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AmuletView quote={quote.amulet_fee} />
          </CardContent>
        </Card>
      ) : null}
      <RawJson value={quote} name="fee-quote.json" />
    </div>
  );
}

export function DiagnosisView({ diagnosis }: { diagnosis: Diagnosis }) {
  const t = useTranslations("simulator.diagnosis");
  const tc = useTranslations("common");
  const x = diagnosis.extracted;
  const hasExtracted =
    x.template_id || x.choice || (x.contract_ids?.length ?? 0) > 0 || (x.parties?.length ?? 0) > 0 ||
    (x.required_authorizers?.length ?? 0) > 0 || (x.given_authorizers?.length ?? 0) > 0 || x.message;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Mono className="text-sm font-semibold">{diagnosis.code}</Mono>
          <Badge variant="outline">{t(`phases.${diagnosis.phase}`)}</Badge>
          {diagnosis.category ? <Badge variant="secondary">{diagnosis.category}</Badge> : null}
          <Badge variant={diagnosis.retryable ? "secondary" : "outline"}>{diagnosis.retryable ? t("retryable") : t("notRetryable")}</Badge>
        </div>
        <p className="text-base font-medium">{diagnosis.title}</p>
        <p className="text-sm text-muted-foreground">{diagnosis.summary}</p>
      </div>

      {hasExtracted ? (
        <dl className="grid gap-2 rounded-lg border p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("extracted")}</p>
          {x.template_id ? (
            <Row label={t("template")}>
              <Mono>{x.template_id}</Mono>
            </Row>
          ) : null}
          {x.choice ? (
            <Row label={t("choice")}>
              <Mono>{x.choice}</Mono>
            </Row>
          ) : null}
          {(x.contract_ids?.length ?? 0) > 0 ? (
            <Row label={t("contracts")}>
              <Parties list={x.contract_ids} />
            </Row>
          ) : null}
          {(x.parties?.length ?? 0) > 0 ? (
            <Row label={t("parties")}>
              <Parties list={x.parties} />
            </Row>
          ) : null}
          {(x.required_authorizers?.length ?? 0) > 0 ? (
            <Row label={t("requiredAuthorizers")}>
              <Parties list={x.required_authorizers} />
            </Row>
          ) : null}
          {(x.given_authorizers?.length ?? 0) > 0 ? (
            <Row label={t("givenAuthorizers")}>
              <Parties list={x.given_authorizers} />
            </Row>
          ) : null}
          {x.message ? (
            <Row label={t("message")}>
              <Mono>{x.message}</Mono>
            </Row>
          ) : null}
        </dl>
      ) : null}

      {diagnosis.explanation ? (
        <div className="grid gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("explanation")}</p>
          <p className="text-sm whitespace-pre-line">{diagnosis.explanation}</p>
        </div>
      ) : null}
      {diagnosis.resolution ? (
        <div className="grid gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("resolution")}</p>
          <p className="text-sm whitespace-pre-line">{diagnosis.resolution}</p>
        </div>
      ) : null}
      {(diagnosis.hints?.length ?? 0) > 0 ? (
        <div className="grid gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("hints")}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {diagnosis.hints!.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <dl className="grid gap-2">
        <Row label={t("cause")}>
          <Mono className="whitespace-pre-wrap">{diagnosis.error.cause || tc("none")}</Mono>
        </Row>
        <Row label={t("source")}>
          <span className="text-xs text-muted-foreground">{diagnosis.catalog_source ?? tc("none")}</span>
        </Row>
      </dl>
    </div>
  );
}

function NodeRow({ node, showArgs }: { node: EffectNode; showArgs: boolean }) {
  const t = useTranslations("simulator.report.nodes");
  const [open, setOpen] = useState(false);
  const kindLabel =
    node.kind === "exercise" ? (node.consuming ? t("exerciseConsuming") : t("exercise")) : t(node.kind);
  return (
    <div className="border-b py-2 last:border-0" style={{ paddingLeft: `${node.depth * 1.25}rem` }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={node.kind === "create" ? "default" : node.kind === "rollback" ? "destructive" : node.consuming ? "secondary" : "outline"}
        >
          {kindLabel}
        </Badge>
        {node.template_id ? <Mono title={node.template_id}>{node.template_id.split(":").slice(-2).join(":")}</Mono> : null}
        {node.choice ? <Mono className="font-semibold">.{node.choice}</Mono> : null}
        {node.contract_id ? (
          <Mono title={node.contract_id} className="text-muted-foreground">
            {short(node.contract_id)}
          </Mono>
        ) : null}
        {showArgs && (node.argument !== undefined || node.result !== undefined) ? (
          <button type="button" className="text-xs underline" onClick={() => setOpen((o) => !o)}>
            {open ? t("hideArgument") : t("showArgument")}
          </button>
        ) : null}
      </div>
      <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {(node.acting_parties?.length ?? 0) > 0 ? (
          <div>
            {t("actingParties")}: <Parties list={node.acting_parties} />
          </div>
        ) : null}
        {(node.signatories?.length ?? 0) > 0 ? (
          <div>
            {t("signatories")}: <Parties list={node.signatories} />
          </div>
        ) : null}
        {(node.stakeholders?.length ?? 0) > 0 ? (
          <div>
            {t("stakeholders")}: <Parties list={node.stakeholders} />
          </div>
        ) : null}
      </div>
      {open ? (
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
          {JSON.stringify({ argument: node.argument, result: node.result }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function StateBadge({ s }: { s: ContractState }) {
  const t = useTranslations("simulator.report.states");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={s.state === "active" ? "default" : s.state === "archived" ? "secondary" : "destructive"}>{t(s.state)}</Badge>
      <Mono title={s.contract_id}>{short(s.contract_id)}</Mono>
      {"template_id" in s && s.template_id ? <Mono className="text-muted-foreground">{s.template_id}</Mono> : null}
      {s.state === "archived" && s.archived_at_offset !== undefined ? (
        <span className="text-xs text-muted-foreground">@ {s.archived_at_offset}</span>
      ) : null}
      {s.state === "lookup_failed" ? <span className="text-xs text-destructive">{s.error}</span> : null}
    </div>
  );
}

export function ReportView({ report }: { report: SimulationReport }) {
  const t = useTranslations("simulator.report");
  const tc = useTranslations("common");
  const fx = report.effects;
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("title")}</CardTitle>
            <OutcomeBadge outcome={report.outcome} />
          </div>
          <CardDescription>{t(`outcomeHint.${report.outcome}`)}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2">
            <Row label={t("ledger")}>
              <Mono>{report.ledger.base_url}</Mono>
              {report.ledger.participant_version ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("participant")} {report.ledger.participant_version}
                </span>
              ) : null}
            </Row>
            <Row label={t("commandId")}>
              <Mono>{report.command_id}</Mono>
            </Row>
            <Row label={t("simulatedAt")}>
              <Mono>{report.simulated_at}</Mono>
              <span className="ml-2 text-xs text-muted-foreground">{t("elapsed", { ms: report.elapsed_ms })}</span>
            </Row>
          </dl>
        </CardContent>
      </Card>

      {report.diagnosis ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("diagnosis")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DiagnosisView diagnosis={report.diagnosis} />
          </CardContent>
        </Card>
      ) : null}

      {(report.contract_states?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("contractStates")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {report.contract_states!.map((s) => (
              <StateBadge key={s.contract_id} s={s} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {fx ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("effects")}</CardTitle>
            <CardDescription>
              {t("counts.creates", { n: fx.counts.creates })} · {t("counts.archives", { n: fx.counts.archives })} ·{" "}
              {t("counts.exercises", { n: fx.counts.exercises })} · {t("counts.fetches", { n: fx.counts.fetches })} ·{" "}
              {t("counts.rollbacks", { n: fx.counts.rollbacks })}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              {fx.nodes.map((n) => (
                <NodeRow key={n.node_id} node={n} showArgs={report.request.include_arguments !== false} />
              ))}
            </div>
            <dl className="grid gap-2">
              <Row label={t("informees")}>
                <Parties list={fx.informees} />
              </Row>
              <Row label={t("inputContracts")}>
                {fx.input_contracts.length === 0 ? (
                  <span className="text-muted-foreground">{tc("none")}</span>
                ) : (
                  <div className="grid gap-1">
                    {fx.input_contracts.map((c) => (
                      <div key={c.contract_id} className="flex flex-wrap items-center gap-2">
                        <Mono title={c.contract_id}>{short(c.contract_id)}</Mono>
                        {c.template_id ? <Mono className="text-muted-foreground">{c.template_id.split(":").slice(-2).join(":")}</Mono> : null}
                        {c.consumed ? <Badge variant="secondary">{t("consumed")}</Badge> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Row>
              <Row label={t("synchronizer")}>
                <Mono>{fx.synchronizer_id}</Mono>
              </Row>
              {fx.min_ledger_effective_time || fx.max_ledger_effective_time ? (
                <Row label={t("validity")}>
                  <Mono>
                    {fx.min_ledger_effective_time ?? "…"} → {fx.max_ledger_effective_time ?? "…"}
                  </Mono>
                </Row>
              ) : null}
              <Row label={t("prepared")}>
                <span className="tabular-nums">{fx.prepared_size_bytes.toLocaleString()}</span> {t("bytes")} ·{" "}
                <Mono title={fx.prepared_transaction_hash_hex} className="text-muted-foreground">
                  {short(fx.prepared_transaction_hash_hex, 12, 8)}
                </Mono>{" "}
                <span className="text-xs text-muted-foreground">({fx.hashing_scheme_version})</span>
              </Row>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {report.traffic ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("traffic")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrafficView quote={report.traffic} />
          </CardContent>
        </Card>
      ) : null}

      {report.amulet_fee ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("amuletFee")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AmuletView quote={report.amulet_fee} />
          </CardContent>
        </Card>
      ) : null}

      {(report.caveats?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("caveats")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {report.caveats!.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <RawJson value={report} name={`simulation-${report.command_id}.json`} />
    </div>
  );
}
