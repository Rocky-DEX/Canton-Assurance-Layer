"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromLocalInput, isIso, isoNow, offsetLabel, plusSeconds, toLocalInput } from "@/lib/instant";

/**
 * A snapshot time, edited in the reader's own timezone with the browser's
 * date-time control and stored as RFC 3339 UTC — the only form the format
 * accepts. The UTC string it will submit is always shown, so what is signed
 * is never a surprise. When a previous value is given, the field says when
 * it is not later and offers the smallest step that is.
 */
const subscribeNever = () => () => {};
const readOffset = () => -new Date().getTimezoneOffset();
const readNothing = () => null;

export function InstantField({
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
  onChange: (iso: string) => void;
  previous?: string | null;
  hint?: string;
}) {
  const t = useTranslations("form.instant");
  // The timezone is the browser's, which the server cannot know; the server
  // snapshot is null so both render the read-only fallback until hydration.
  const offset = useSyncExternalStore(subscribeNever, readOffset, readNothing);

  const valid = isIso(value);
  const later = !previous || (valid && value > previous);
  const nextAfterPrevious = previous ? plusSeconds(previous, 60) : null;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {offset === null ? (
        <Input id={id} value={value} readOnly className="font-mono" />
      ) : (
        <Input
          id={id}
          type="datetime-local"
          step={1}
          value={toLocalInput(value, offset)}
          onChange={(e) => {
            const iso = fromLocalInput(e.target.value, offset);
            if (iso) onChange(iso);
          }}
          aria-invalid={!valid || !later}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Button type="button" variant="outline" size="xs" onClick={() => onChange(isoNow())}>
          {t("now")}
        </Button>
        {previous && nextAfterPrevious && !later ? (
          <Button type="button" variant="outline" size="xs" onClick={() => onChange(nextAfterPrevious)}>
            {t("afterPrevious")}
          </Button>
        ) : null}
        {offset !== null ? <span>{t("timezone", { tz: offsetLabel(offset) })}</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("recordedAs")} <span className="font-mono">{valid ? value : "—"}</span>
      </p>
      {previous ? (
        <p className={`text-xs ${later ? "text-muted-foreground" : "text-destructive"}`}>
          {later ? t("previous", { previous }) : t("mustBeAfter", { previous })}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
