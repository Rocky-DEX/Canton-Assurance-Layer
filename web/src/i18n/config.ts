export const LOCALES = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

/** Exact match, then primary language subtag, so `zh-TW` lands on zh-CN rather than English. */
export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const wanted = tag.trim().toLowerCase();
  if (!wanted) return null;
  const exact = LOCALES.find((l) => l.code.toLowerCase() === wanted);
  if (exact) return exact.code;
  const primary = wanted.split(/[-_]/)[0];
  return LOCALES.find((l) => l.code.toLowerCase().split("-")[0] === primary)?.code ?? null;
}
