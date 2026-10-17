/**
 * Rules of the expert pre-registration that the server enforces (FO-19,
 * TASK-MVBIXPP33UK1B). One place, so the form copy, the mail and the tests read
 * the same numbers. No client import: this is server code.
 */

/**
 * Version of the consent text the expert ticks. A stored row never claims
 * agreement to a text nobody saw: bump this together with the copy in
 * messages/*.json when the consent wording changes.
 */
export const EXPERT_PREREG_CONSENT_VERSION = 'kvkk-v1';

/** The first this many verified experts get a founder number ("Kurucu Uzman"). */
export const FOUNDER_SEAT_LIMIT = 100;

/** A verification link works this long after the registration (24 hours). */
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** At most this many registrations per client IP in {@link IP_WINDOW_MS}. */
export const REGISTRATION_IP_LIMIT = 5;
export const IP_WINDOW_MS = 60 * 60 * 1000;

/** Serialises registrations and founder numbering so concurrent requests cannot pass a limit or share a number. */
export const EXPERT_PREREG_LOCK_KEY = 7_302_026_019_001n;

/** Where a verified expert lands, by UI language (the page itself is the frontend card's). */
export function verifiedRedirectPath(locale: string, outcome: { founderNumber: number | null } | { error: 'expired' | 'invalid' }): string {
  const base = locale === 'en' ? '/en/experts/verified' : '/tr/uzman/dogrulandi';
  if ('error' in outcome) return `${base}?error=${outcome.error}`;
  return `${base}?n=${outcome.founderNumber ?? 'yok'}`;
}
