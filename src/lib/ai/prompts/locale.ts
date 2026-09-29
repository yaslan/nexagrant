import { headers, cookies } from 'next/headers';

import { DEFAULT_PROMPT_LOCALE, PROMPT_LOCALES, type PromptLocale } from './index';

/** Request header next-intl's middleware (src/proxy.ts) sets on every `/(tr|en)/…` request. */
const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE';
/** Cookie next-intl keeps the visitor's last chosen locale in. */
const NEXT_LOCALE_COOKIE = 'NEXT_LOCALE';

function asLocale(value: string | undefined | null): PromptLocale | null {
  return value && (PROMPT_LOCALES as readonly string[]).includes(value) ? (value as PromptLocale) : null;
}

/**
 * The locale a prompt is rendered in: the UI locale of the user making the
 * request — a server action is a POST to the `/<locale>/…` page, so the
 * middleware header is present — then the locale cookie, then the app default.
 *
 * Outside a request (a job, a script, a unit test) `headers()` throws, and the
 * default is used. The prompt loader falls back to `en` for a locale a prompt
 * has no text in, so this never decides whether a prompt exists.
 */
export async function promptLocale(): Promise<PromptLocale> {
  try {
    const fromHeader = asLocale((await headers()).get(NEXT_INTL_LOCALE_HEADER));
    if (fromHeader) return fromHeader;
    const fromCookie = asLocale((await cookies()).get(NEXT_LOCALE_COOKIE)?.value);
    if (fromCookie) return fromCookie;
  } catch {
    // no request scope
  }
  return DEFAULT_PROMPT_LOCALE;
}
