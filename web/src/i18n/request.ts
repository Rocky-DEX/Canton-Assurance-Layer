import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";

/**
 * The reader's language: an explicit choice (cookie) first, then the
 * browser's preference list, then English. No locale segment in the URL: the
 * console's URLs identify organisations and documents, not languages.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  let locale: Locale | null = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  if (!locale) {
    const accept = (await headers()).get("accept-language") ?? "";
    for (const part of accept.split(",")) {
      locale = resolveLocale(part.split(";")[0]);
      if (locale) break;
    }
  }
  locale ??= DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
