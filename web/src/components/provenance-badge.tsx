import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * How a displayed value is known. The same three words the offline pages use,
 * plus one for the server's own summaries, which are never called verified.
 */
export type Provenance = "verified" | "disclosed" | "server";

export function ProvenanceBadge({ kind, className }: { kind: Provenance; className?: string }) {
  const t = useTranslations("common");
  const label = kind === "verified" ? t("recomputedHere") : kind === "disclosed" ? t("publisherSays") : t("serverReading");
  const hint =
    kind === "verified" ? t("recomputedHint") : kind === "disclosed" ? t("publisherSaysHint") : t("serverReadingHint");
  return (
    <span
      title={hint}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        kind === "verified" && "bg-emerald-600 text-white dark:bg-emerald-500",
        kind === "disclosed" && "border border-border text-muted-foreground",
        kind === "server" && "border border-dashed border-border text-muted-foreground",
        className
      )}
    >
      {label}
    </span>
  );
}
