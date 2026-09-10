"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { friendlyError } from "@/lib/friendly-error";

/**
 * A failed request, explained. The sentence comes from the catalog when the
 * error is one we recognise; the server's exact words stay one click away
 * under "technical details", because they are what a support thread needs.
 */
export function FormError({ error }: { error: string | null }) {
  const t = useTranslations("form.errors");
  const [open, setOpen] = useState(false);
  if (!error) return null;
  const f = friendlyError(error);
  const known = f.key !== "unknown";
  return (
    <div role="alert" className="grid gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t(f.key, f.values)}</span>
      </div>
      {known ? (
        <div className="pl-6">
          <button type="button" className="text-xs underline" onClick={() => setOpen((o) => !o)}>
            {t("details")}
          </button>
          {open ? <pre className="mt-1 font-mono text-xs whitespace-pre-wrap text-destructive/80">{error}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}
