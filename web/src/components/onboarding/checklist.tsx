import { CheckCircle2, Circle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { Checklist } from "@/lib/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ChecklistControls } from "./checklist-controls";

/**
 * The getting-started card on an organisation's overview: eight steps, each
 * ticked from the data itself. Shown until every step is done or the member
 * hides it; a hidden card can be brought back from the footer link.
 */
export async function GettingStarted({ slug, checklist }: { slug: string; checklist: Checklist }) {
  const t = await getTranslations("onboarding.checklist");
  const pct = Math.round((checklist.done / checklist.total) * 100);

  return (
    <Card data-tour="checklist">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("body")}</CardDescription>
          </div>
          <ChecklistControls slug={slug} />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums">{t("progress", { done: checklist.done, total: checklist.total })}</span>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 sm:grid-cols-2">
          {checklist.steps.map((s, i) => {
            const inner = (
              <>
                {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${s.done ? "text-muted-foreground line-through decoration-muted-foreground/50" : ""}`}>
                    {i + 1}. {t(`steps.${s.id}.title`)}
                  </span>
                  <span className="block text-xs text-muted-foreground">{t(`steps.${s.id}.body`)}</span>
                </span>
              </>
            );
            const cls = "flex items-start gap-2 rounded-md border p-3";
            return (
              <li key={s.id}>
                {s.href && !s.done ? (
                  <Link href={s.href} className={`${cls} transition-colors hover:bg-accent`}>
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
