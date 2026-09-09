"use client";

import { Compass, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { setChecklistHiddenAction } from "@/app/app/[slug]/onboarding-actions";
import { Button } from "@/components/ui/button";

import { restartTour } from "./tour";

export function ChecklistControls({ slug }: { slug: string }) {
  const t = useTranslations("onboarding.checklist");
  const [pending, start] = useTransition();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => restartTour()}>
        <Compass className="size-4" /> {t("tour")}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={t("hide")} disabled={pending} onClick={() => start(() => setChecklistHiddenAction(slug, true))}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

export function ShowChecklist({ slug }: { slug: string }) {
  const t = useTranslations("onboarding.checklist");
  const [pending, start] = useTransition();
  return (
    <button type="button" className="text-xs text-muted-foreground underline" disabled={pending} onClick={() => start(() => setChecklistHiddenAction(slug, false))}>
      {t("show")}
    </button>
  );
}
