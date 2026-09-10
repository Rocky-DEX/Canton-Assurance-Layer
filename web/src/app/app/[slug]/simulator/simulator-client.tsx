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

import { explainAction, feeAction, simulateAction } from "./actions";
import { DiagnosisView, FeeQuoteView, RawJson, ReportView, ScheduleView } from "./report-view";

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{text}</p>;
}

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
              placeholder={t("commandsPlaceholder")}
              className="min-h-40 font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {t("sampleNote")}{" "}
              <a className="underline" href="/samples/simulate-command.json" download>
                simulate-command.json
              </a>
            </p>
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
          <ErrorBox text={error} />
          <div>
            <Button onClick={submit} disabled={!ready}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("submit")}
            </Button>
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
              placeholder={t("inputPlaceholder")}
              className="min-h-28 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <ErrorBox text={error} />
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
          <ErrorBox text={error} />
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
