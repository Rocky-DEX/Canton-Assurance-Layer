"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Diagnosis, FeeSchedule, SimulationReport, StandaloneFeeQuote } from "@/lib/simulator";
import { parseSimulationInput, parseTransferAmounts } from "@/lib/simulator-input";
import { FormError } from "@/components/form/form-error";

import { explainAction, feeAction, simulateAction } from "./actions";
import { DiagnosisView, FeeQuoteView, RawJson, ReportView, ScheduleView } from "./report-view";

// Examples, not prose: kept out of the message catalogs, whose ICU syntax
// would read the braces as placeholders.
const COMMAND_PLACEHOLDER = '{"ExerciseCommand": {"templateId": "#pkg:Module:Template", "contractId": "00…", "choice": "Accept", "choiceArgument": {}}}';
const ERROR_PLACEHOLDER = 'DAML_AUTHORIZATION_ERROR   |   {"code":"CONTRACT_NOT_FOUND","cause":"…"}   |   a log line';

const SAMPLE_ACT_AS = "exchange::1220REPLACE_WITH_YOUR_PARTY";
const EXPLAIN_EXAMPLES = ["DAML_AUTHORIZATION_ERROR", "CONTRACT_NOT_FOUND", "UNHANDLED_EXCEPTION", "LOCAL_VERDICT_LOCKED_CONTRACTS"];

function SimulateTab({ slug, canSimulate, available }: { slug: string; canSimulate: boolean; available: boolean }) {
  const t = useTranslations("simulator.simulate");
  const [pending, start] = useTransition();
  const [commandsText, setCommandsText] = useState("");
  const [actAs, setActAs] = useState("");
  const [readAs, setReadAs] = useState("");
  const [synchronizerId, setSynchronizerId] = useState("");
  const [lookupContracts, setLookupContracts] = useState(true);
  const [includeArguments, setIncludeArguments] = useState(true);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  async function loadSample() {
    setLoadingSample(true);
    try {
      const res = await fetch("/samples/simulate-command.json", { cache: "no-store" });
      setCommandsText(JSON.stringify(JSON.parse(await res.text()), null, 2));
      if (!actAs.trim()) setActAs(SAMPLE_ACT_AS);
    } catch {
      toast.error(t("sampleFailed"));
    } finally {
      setLoadingSample(false);
    }
  }

  const parsed = commandsText.trim()
    ? parseSimulationInput({ commandsText, actAs, readAs, synchronizerId, lookupContracts, includeArguments })
    : null;
  const inputProblem = parsed && !parsed.ok ? t(`input.${parsed.error}`) : null;
  const ready = available && canSimulate && parsed?.ok === true && !pending;

  function submit() {
    if (!parsed?.ok) return;
    setError(null);
    start(async () => {
      const outcome = await simulateAction(slug, { request: parsed.request, forward_token: token.trim() || undefined });
      if (!outcome.ok) {
        setError(outcome.error);
        setReport(null);
        toast.error(t("failed"));
        return;
      }
      setReport(outcome.report);
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!canSimulate ? <p className="text-sm text-muted-foreground">{t("needOperator")}</p> : null}
          <div className="grid gap-2">
            <Label htmlFor="simCommands">{t("commands")}</Label>
            <Textarea
              id="simCommands"
              value={commandsText}
              onChange={(e) => setCommandsText(e.target.value)}
              placeholder={COMMAND_PLACEHOLDER}
              className="min-h-40 font-mono text-xs"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Button type="button" variant="outline" size="xs" disabled={loadingSample} onClick={() => void loadSample()}>
                {t("loadSample")}
              </Button>
              <span>
                {t("sampleNote")}{" "}
                <a className="underline" href="/samples/simulate-command.json" download>
                  simulate-command.json
                </a>
              </span>
            </div>
            {inputProblem ? <p className="text-sm text-destructive">{inputProblem}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="simActAs">{t("actAs")}</Label>
              <Textarea id="simActAs" value={actAs} onChange={(e) => setActAs(e.target.value)} className="min-h-16 font-mono text-xs" spellCheck={false} />
              <p className="text-xs text-muted-foreground">{t("actAsHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="simReadAs">{t("readAs")}</Label>
              <Textarea id="simReadAs" value={readAs} onChange={(e) => setReadAs(e.target.value)} className="min-h-16 font-mono text-xs" spellCheck={false} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="simSync">{t("synchronizer")}</Label>
              <Input id="simSync" value={synchronizerId} onChange={(e) => setSynchronizerId(e.target.value.trim())} className="font-mono" />
              <p className="text-xs text-muted-foreground">{t("synchronizerHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="simToken">{t("token")}</Label>
              <Input id="simToken" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">{t("tokenHint")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={lookupContracts} onChange={(e) => setLookupContracts(e.target.checked)} />
              {t("lookup")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeArguments} onChange={(e) => setIncludeArguments(e.target.checked)} />
              {t("includeArgs")}
            </label>
          </div>
          <FormError error={error} />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={!ready}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("submit")}
            </Button>
            {!ready && !pending ? (
              <span className="text-xs text-muted-foreground">
                {!available ? t("todo.service") : !canSimulate ? t("todo.role") : !commandsText.trim() ? t("todo.command") : (inputProblem ?? "")}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {report ? <ReportView report={report} /> : null}
    </div>
  );
}

function ExplainTab({ slug, available }: { slug: string; available: boolean }) {
  const t = useTranslations("simulator.explain");
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  function submit() {
    if (!text.trim()) return;
    setError(null);
    start(async () => {
      const outcome = await explainAction(slug, { error: text });
      if (!outcome.ok) {
        setError(outcome.error);
        setDiagnosis(null);
        toast.error(t("failed"));
        return;
      }
      setDiagnosis(outcome.diagnosis);
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="explainInput">{t("input")}</Label>
            <Textarea
              id="explainInput"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ERROR_PLACEHOLDER}
              className="min-h-28 font-mono text-xs"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t("examples")}</span>
              {EXPLAIN_EXAMPLES.map((code) => (
                <button key={code} type="button" className="rounded-full border px-2 py-0.5 font-mono hover:bg-accent" onClick={() => setText(code)}>
                  {code}
                </button>
              ))}
            </div>
          </div>
          <FormError error={error} />
          <div>
            <Button onClick={submit} disabled={!available || !text.trim() || pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
      {diagnosis ? (
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <DiagnosisView diagnosis={diagnosis} />
            <RawJson value={diagnosis} name={`diagnosis-${diagnosis.code}.json`} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FeeTab({ slug, available, schedule }: { slug: string; available: boolean; schedule: FeeSchedule | null }) {
  const t = useTranslations("simulator.fee");
  const [pending, start] = useTransition();
  const [requestBytes, setRequestBytes] = useState("");
  const [responseBytes, setResponseBytes] = useState("");
  const [transfers, setTransfers] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<StandaloneFeeQuote | null>(null);

  const amounts = parseTransferAmounts(transfers);
  const req = requestBytes.trim() === "" ? 0 : Number(requestBytes);
  const res = responseBytes.trim() === "" ? 0 : Number(responseBytes);
  const bytesOk = Number.isInteger(req) && req >= 0 && Number.isInteger(res) && res >= 0;
  const anything = req + res > 0 || (amounts.ok && amounts.amounts.length > 0);
  const ready = available && bytesOk && amounts.ok && anything && !pending;

  function submit() {
    if (!amounts.ok) return;
    setError(null);
    start(async () => {
      const outcome = await feeAction(slug, { request_bytes: req, response_bytes: res, transfer_cc: amounts.amounts });
      if (!outcome.ok) {
        setError(outcome.error);
        setQuote(null);
        toast.error(t("failed"));
        return;
      }
      setQuote(outcome.quote);
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="feeReq">{t("requestBytes")}</Label>
              <Input id="feeReq" inputMode="numeric" value={requestBytes} onChange={(e) => setRequestBytes(e.target.value.trim())} placeholder="4200" className="font-mono" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="feeRes">{t("responseBytes")}</Label>
              <Input id="feeRes" inputMode="numeric" value={responseBytes} onChange={(e) => setResponseBytes(e.target.value.trim())} placeholder="300" className="font-mono" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="feeCc">{t("transferCc")}</Label>
              <Input id="feeCc" value={transfers} onChange={(e) => setTransfers(e.target.value)} placeholder="10000, 2.5" className="font-mono" />
              <p className="text-xs text-muted-foreground">{t("transferHint")}</p>
            </div>
          </div>
          {!amounts.ok ? <p className="text-sm text-destructive">{t("badAmount", { value: amounts.bad })}</p> : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setRequestBytes("4200");
                setResponseBytes("300");
                setTransfers("10000");
              }}
            >
              {t("preset")}
            </Button>
            <span>{t("presetHint")}</span>
          </div>
          <FormError error={error} />
          <div>
            <Button onClick={submit} disabled={!ready}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
      {quote ? <FeeQuoteView quote={quote} /> : null}
      {schedule ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("schedule")}</CardTitle>
            <CardDescription>{t("scheduleBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleView schedule={schedule} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function SimulatorClient({
  slug,
  canSimulate,
  available,
  schedule,
}: {
  slug: string;
  canSimulate: boolean;
  available: boolean;
  schedule: FeeSchedule | null;
}) {
  const t = useTranslations("simulator.tabs");
  return (
    <Tabs defaultValue="simulate">
      <TabsList>
        <TabsTrigger value="simulate">{t("simulate")}</TabsTrigger>
        <TabsTrigger value="explain">{t("explain")}</TabsTrigger>
        <TabsTrigger value="fee">{t("fee")}</TabsTrigger>
      </TabsList>
      <TabsContent value="simulate">
        <SimulateTab slug={slug} canSimulate={canSimulate} available={available} />
      </TabsContent>
      <TabsContent value="explain">
        <ExplainTab slug={slug} available={available} />
      </TabsContent>
      <TabsContent value="fee">
        <FeeTab slug={slug} available={available} schedule={schedule} />
      </TabsContent>
    </Tabs>
  );
}
