"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import { pairCoverageAction } from "./actions";

type Option = { id: string; label: string };

export function PairForm({ slug, custody, publications }: { slug: string; custody: Option[]; publications: Option[] }) {
  const t = useTranslations("coverage.pair");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [custodyId, setCustodyId] = useState(custody[0]?.id ?? "");
  const [publicationId, setPublicationId] = useState(publications[0]?.id ?? "");
  const [maxSkew, setMaxSkew] = useState(300);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const outcome = await pairCoverageAction(slug, { custodyId, publicationId, maxSkew });
      if (!outcome.ok) {
        setError(outcome.error);
        toast.error(t("failed"));
        return;
      }
      toast[outcome.fullyCovered ? "success" : "warning"](outcome.fullyCovered ? t("covered") : t("short"));
      router.push(`/app/${slug}/coverage/${outcome.id}`);
    });
  }

  const select = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {custody.length === 0 || publications.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("needBoth")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="custody">{t("custody")}</Label>
                <select id="custody" className={select} value={custodyId} onChange={(e) => setCustodyId(e.target.value)}>
                  {custody.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="liabilities">{t("liabilities")}</Label>
                <select id="liabilities" className={select} value={publicationId} onChange={(e) => setPublicationId(e.target.value)}>
                  {publications.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="skew">{t("skew")}</Label>
                <select id="skew" className={select} value={maxSkew} onChange={(e) => setMaxSkew(Number(e.target.value))}>
                  <option value={0}>{t("skewExact")}</option>
                  <option value={300}>{t("skewSameRun")}</option>
                  <option value={3600}>{t("skewHour")}</option>
                  <option value={86400}>{t("skewDay")}</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("skewHint")}</p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div>
              <Button onClick={submit} disabled={pending || !custodyId || !publicationId}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("submit")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
