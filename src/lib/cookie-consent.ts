/**
 * The cookie-banner answer, shared by the banner (src/components/CookieConsent.tsx)
 * and everything that must wait for it (src/lib/analytics.ts).
 *
 * Stored value: `{ accepted: boolean, time: ISO string, level: 'all' | 'essential' }`.
 */
export const CONSENT_STORAGE_KEY = 'fabrika_cookie_consent';

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
