"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Leading zeros dropped for reading; the wire keeps them. */
export function displayOffset(s: string): string {
  const t = s.replace(/^0+(?=\d)/, "");
  return t === "" ? "0" : t;
}

/** Numeric comparison of two digit strings of any width; `null` when either is not digits. */
export function compareOffsets(a: string, b: string): number | null {
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null;
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * A ledger offset: digits only, compared as a number against the previous
 * one, with the next value one click away. Non-digits are dropped as they
 * are typed rather than reported afterwards.
 */
export function LedgerOffsetField({
  id,
  label,
  value,
  onChange,
  previous,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (digits: string) => void;
  previous?: string | null;
  hint?: string;
}) {
  const t = useTranslations("form.offset");
  const filled = value !== "";
  const cmp = previous && filled ? compareOffsets(value, previous) : null;
  const backwards = cmp !== null && cmp < 0;
  const next = previous && /^\d+$/.test(previous) ? (BigInt(previous) + 1n).toString() : null;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D+/g, "").slice(0, 40))}
        placeholder={next ?? "3042"}
        className="font-mono"
        aria-invalid={backwards}
      />
      {previous ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {next ? (
            <Button type="button" variant="outline" size="xs" onClick={() => onChange(next)}>
              {t("useNext", { next })}
            </Button>
          ) : null}
          <span className={backwards ? "text-destructive" : undefined}>
            {backwards ? t("mustNotDecrease", { previous: displayOffset(previous) }) : t("previous", { previous: displayOffset(previous) })}
          </span>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{hint ?? t("hint")}</p>
    </div>
  );
}
