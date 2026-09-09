"use client";

import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocale } from "@/app/actions/locale";
import { LOCALES } from "@/i18n/config";

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground ${className ?? ""}`}>
      <Languages className="size-4" aria-hidden />
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
        value={locale}
        disabled={pending}
        aria-label="Language"
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setLocale(next);
            router.refresh();
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
