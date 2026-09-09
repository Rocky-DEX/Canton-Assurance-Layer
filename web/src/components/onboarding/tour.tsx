"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * A guided tour over the organisation console: a spotlight on one element at
 * a time, a short explanation, next / back / skip. No library; the targets are
 * `data-tour` attributes in the markup, and a step whose target is not on the
 * page (a role that cannot see it, a narrow screen without the sidebar) is
 * shown centred rather than skipped, so the words still arrive.
 *
 * Runs once per browser (localStorage) when the console is new, and again on
 * demand from the checklist's "Show me around" button.
 */
const STEPS = ["overview", "publications", "custody", "coverage", "history", "customers", "settings", "publish", "principle"] as const;
type StepId = (typeof STEPS)[number];

const STORAGE_KEY = "canton-assurance.tour.v1";
const RESTART_EVENT = "canton-assurance:tour:restart";

export function restartTour(): void {
  window.dispatchEvent(new Event(RESTART_EVENT));
}

type Rect = { top: number; left: number; width: number; height: number } | null;

function targetRect(id: StepId): Rect {
  const el = document.querySelector<HTMLElement>(`[data-tour="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function ConsoleTour({ autoStart }: { autoStart: boolean }) {
  const t = useTranslations("onboarding.tour");
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect>(null);

  // Start on first visit, or when asked.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "done";
    } catch {
      seen = true;
    }
    // Deferred past hydration: the server rendered no dialog, and the first
    // client paint must match it before the tour appears.
    const timer = autoStart && !seen ? window.setTimeout(() => setStep(0), 600) : undefined;
    const onRestart = () => setStep(0);
    window.addEventListener(RESTART_EVENT, onRestart);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(RESTART_EVENT, onRestart);
    };
  }, [autoStart]);

  const finish = useCallback(() => {
    setStep(null);
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      // Not remembered; the tour will offer itself again next visit.
    }
  }, []);

  // Measure the current target, and re-measure on resize / scroll.
  useLayoutEffect(() => {
    if (step === null) return;
    const id = STEPS[step];
    const el = document.querySelector<HTMLElement>(`[data-tour="${id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setRect(targetRect(id));
    measure();
    const timer = window.setTimeout(measure, 350); // after the smooth scroll settles
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") setStep((s) => (s === null ? s : Math.min(STEPS.length - 1, s + 1)));
      if (e.key === "ArrowLeft") setStep((s) => (s === null ? s : Math.max(0, s - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish]);

  if (step === null) return null;
  const id = STEPS[step];
  const last = step === STEPS.length - 1;
  const pad = 8;

  // Tooltip placement: below the target when there is room, else above; centred when no target.
  const tooltipStyle: React.CSSProperties = rect
    ? (() => {
        const below = rect.top + rect.height + pad + 220 < window.innerHeight;
        const left = Math.min(Math.max(16, rect.left), window.innerWidth - 360 - 16);
        return below
          ? { position: "fixed", top: rect.top + rect.height + pad + 4, left }
          : { position: "fixed", bottom: window.innerHeight - rect.top + pad + 4, left };
      })()
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("aria")}>
      {/* Dimmed backdrop with a hole cut around the target. */}
      <div
        className="absolute inset-0 bg-black/50 transition-all"
        style={
          rect
            ? {
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.top - pad}px, ${rect.left - pad}px ${rect.top - pad}px, ${rect.left - pad}px ${rect.top + rect.height + pad}px, ${rect.left + rect.width + pad}px ${rect.top + rect.height + pad}px, ${rect.left + rect.width + pad}px ${rect.top - pad}px, 0 ${rect.top - pad}px)`,
              }
            : undefined
        }
        onClick={finish}
      />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-emerald-500 ring-offset-2 ring-offset-transparent"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : null}
      <div style={tooltipStyle} className="w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border bg-background p-4 shadow-xl">
        <div className="text-xs text-muted-foreground">{t("stepOf", { n: step + 1, total: STEPS.length })}</div>
        <div className="mt-1 font-semibold">{t(`steps.${id}.title`)}</div>
        <p className="mt-1 text-sm text-muted-foreground">{t(`steps.${id}.body`)}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={finish}>
            {t("skip")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
              {t("back")}
            </Button>
            <Button size="sm" onClick={() => (last ? finish() : setStep(step + 1))}>
              {last ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
