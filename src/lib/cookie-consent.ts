/**
 * The cookie-banner answer, shared by the banner (src/components/CookieConsent.tsx)
 * and everything that must wait for it (src/lib/analytics.ts).
 *
 * Stored value: `{ accepted: boolean, time: ISO string, level: 'all' | 'essential' }`.
 */
export const CONSENT_STORAGE_KEY = 'fabrika_cookie_consent';

/**
 * The only thing analytics stores in the browser: the anonymous id minted after
 * "accept all" (src/lib/analytics.ts). Withdrawing consent removes it.
 */
export const ANALYTICS_ANON_ID_STORAGE_KEY = 'fabrika_analytics_anon_id';

/** Window event the "Cookie preferences" links fire to reopen the banner (FO-180). */
export const OPEN_COOKIE_PREFERENCES_EVENT = 'fabrika:open-cookie-preferences';

export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}

/** What this browser answered last, or `null` when it has not (or storage is blocked). */
export function storedConsentLevel(): 'all' | 'essential' | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { accepted?: unknown }).accepted === true ? 'all' : 'essential';
  } catch {
    return null;
  }
}

/**
 * KVKK / ePrivacy: withdrawing must be as easy as giving, and leave nothing
 * behind. Removes what analytics stored; it sets no cookie of its own.
 */
export function clearAnalyticsStorage(): void {
  try {
    window.localStorage.removeItem(ANALYTICS_ANON_ID_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing could have been stored either.
  }
}

/**
 * True only for an explicit "accept all". Unanswered, "essential only", a
 * malformed value, a server render and blocked storage are all "no" — KVKK /
 * ePrivacy need opt-in, so every doubt resolves to not tracking.
 */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { accepted?: unknown; analytics?: unknown };
    // `analytics` is the shape the e2e fixtures seed; `accepted` is what the banner writes.
    return parsed.accepted === true || parsed.analytics === true;
  } catch {
    return false;
  }
}
