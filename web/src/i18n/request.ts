import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from "./config";

/**
 * The reader's language: an explicit choice (the cookie the switcher sets),
 * otherwise English. The browser's Accept-Language is deliberately not
 * consulted: the console opens in English for everyone until they pick
 * another language. No locale segment in the URL: the console's URLs
 * identify organisations and documents, not languages.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value) ?? DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
