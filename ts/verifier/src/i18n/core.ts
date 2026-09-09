/**
 * Locale runtime for the browser pages.
 *
 * Every page is one self-contained file, so translations are bundled into the
 * script rather than fetched: there is nothing to fetch them from, and a
 * verifier that reached for the network to find its own words would fail the
 * test that keeps it offline. Messages live in per-page catalogs
 * (`verifier-messages.ts`, `designer-messages.ts`) so a page carries only the
 * vocabulary it is entitled to — the designer verifies nothing and must not
 * ship the words "recomputed here".
 *
 * This module holds no message text of its own. Everything here is either a
 * pure function over strings, tested in node, or a small DOM helper that a
 * page entry calls once it has a document.
 */

export type Locale = "en" | "zh-CN";

export const DEFAULT_LOCALE: Locale = "en";

/** Labels are each language's own name for itself, so they are not translated. */
export const LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
];

export type Params = Record<string, string | number>;

/** One message table per locale, all with the same keys. */
export type Catalog<K extends string> = Record<Locale, Record<K, string>>;

export type Translator<K extends string> = ((key: K, params?: Params) => string) & {
  readonly locale: Locale;
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.code === value);
}

/** Fills `{name}` placeholders; a placeholder with no value is left visible, never blanked. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
  );
}

export function makeTranslator<K extends string>(catalog: Catalog<K>, locale: Locale): Translator<K> {
  const messages = catalog[locale] ?? catalog[DEFAULT_LOCALE];
  const fallback = catalog[DEFAULT_LOCALE];
  const t = ((key: K, params?: Params) => {
    // A key the catalog does not define renders as itself. A blank label in a
    // page nobody is debugging would be indistinguishable from a missing value.
    const text = messages[key] ?? fallback[key] ?? key;
    return interpolate(text, params);
  }) as Translator<K>;
  Object.defineProperty(t, "locale", { value: locale, enumerable: true });
  return t;
}

/**
 * Maps a BCP 47 tag onto a supported locale: an exact match first, then the
 * primary language subtag, so `zh-TW` and `zh-Hans-SG` both land on `zh-CN`
 * rather than on English. Null when nothing matches.
 */
export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (typeof tag !== "string") return null;
  const wanted = tag.trim().toLowerCase();
  if (!wanted) return null;
  const exact = LOCALES.find((l) => l.code.toLowerCase() === wanted);
  if (exact) return exact.code;
  const primary = wanted.split(/[-_]/)[0];
  const byLanguage = LOCALES.find((l) => l.code.toLowerCase().split("-")[0] === primary);
  return byLanguage?.code ?? null;
}

export type LocaleHints = {
  /** `location.search`, e.g. `?lang=zh-CN`. */
  query?: string;
  /** `location.hash`, e.g. `#lang=zh-CN`; some file:// contexts drop the query. */
  hash?: string;
  /** What the reader chose last time, if storage was available. */
  stored?: string | null;
  /** `navigator.languages`, most preferred first. */
  languages?: readonly string[];
};

function langParam(fragment: string | undefined): string | null {
  if (!fragment) return null;
  const params = new URLSearchParams(fragment.replace(/^[?#]/, ""));
  return params.get("lang");
}

/**
 * An explicit request in the URL wins, then a remembered choice, then the
 * browser's preference list, then English.
 */
export function detectLocale(hints: LocaleHints): Locale {
  const candidates: Array<string | null | undefined> = [
    langParam(hints.query),
    langParam(hints.hash),
    hints.stored,
    ...(hints.languages ?? []),
  ];
  for (const candidate of candidates) {
    const locale = resolveLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * The inline markup a message may carry. Anything else is rendered as text.
 * Kept to two tags on purpose: enough for a file name and an emphasised term,
 * and small enough that this is a split, not an HTML parser.
 */
export type RichPart = { tag: "code" | "strong" | null; text: string };

export function splitRich(text: string): RichPart[] {
  const parts: RichPart[] = [];
  const re = /<(code|strong)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ tag: null, text: text.slice(last, at) });
    parts.push({ tag: m[1] as "code" | "strong", text: m[2] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ tag: null, text: text.slice(last) });
  return parts;
}

// ---------------------------------------------------------------------------
// DOM helpers. Nothing below runs at import time.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "canton-solvency.locale";

/**
 * Storage may be unavailable (a private window, a browser that denies it to
 * file:// pages) and the accessor itself may throw. Language choice is a
 * convenience, so both are treated as "nothing remembered".
 */
export function readStoredLocale(win: Window): string | null {
  try {
    return win.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLocale(win: Window, locale: Locale): void {
  try {
    win.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not remembered; the page still shows the chosen language for this visit.
  }
}

export function localeFromWindow(win: Window): Locale {
  const nav = win.navigator;
  return detectLocale({
    query: win.location.search,
    hash: win.location.hash,
    stored: readStoredLocale(win),
    languages: nav.languages?.length ? nav.languages : nav.language ? [nav.language] : [],
  });
}

/** Renders a message into an element as text nodes and, for its two tags, elements. Never innerHTML. */
export function renderRich(el: Element, text: string): void {
  const parts = splitRich(text);
  if (parts.length === 1 && parts[0].tag === null) {
    el.textContent = parts[0].text;
    return;
  }
  el.textContent = "";
  const doc = el.ownerDocument;
  for (const part of parts) {
    if (part.tag === null) {
      el.appendChild(doc.createTextNode(part.text));
    } else {
      const child = doc.createElement(part.tag);
      child.textContent = part.text;
      el.appendChild(child);
    }
  }
}

/**
 * Applies a translator to every element the markup marked for it:
 * `data-i18n` for content, `data-i18n-placeholder` for input placeholders.
 * Also sets the document language so assistive technology picks the right voice.
 */
export function applyTranslations<K extends string>(doc: Document, t: Translator<K>): void {
  doc.documentElement.lang = t.locale;
  for (const el of Array.from(doc.querySelectorAll("[data-i18n]"))) {
    const key = el.getAttribute("data-i18n");
    if (key) renderRich(el, t(key as K));
  }
  for (const el of Array.from(doc.querySelectorAll("[data-i18n-placeholder]"))) {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) (el as HTMLInputElement).placeholder = t(key as K);
  }
}

/** Fills the language `<select>` and reports a change; the caller re-renders. */
export function mountLanguageSwitch(
  select: HTMLSelectElement,
  current: Locale,
  onChange: (locale: Locale) => void
): void {
  select.textContent = "";
  for (const { code, label } of LOCALES) {
    const option = select.ownerDocument.createElement("option");
    option.value = code;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = current;
  select.addEventListener("change", () => {
    if (isLocale(select.value)) onChange(select.value);
  });
}
