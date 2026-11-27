/**
 * The cookie-banner answer, shared by the banner (src/components/CookieConsent.tsx)
 * and everything that must wait for it (src/lib/analytics.ts).
 *
 * Stored value (NG-9): `{ necessary: true, analytics: boolean, marketing: boolean,
 * accepted: boolean, level: 'all' | 'essential' | 'custom', time: ISO string,
 * version: COOKIE_POLICY_VERSION }`. `accepted` mirrors `analytics`; it is what
 * the banner wrote before the preference panel (FO-180) and older stored answers
 * carry nothing else.
 */
export const CONSENT_STORAGE_KEY = 'fabrika_cookie_consent';

/**
 * The only thing analytics stores in the browser: the anonymous id minted after
 * consent to analytics (src/lib/analytics.ts). Withdrawing consent removes it.
 */
export const ANALYTICS_ANON_ID_STORAGE_KEY = 'fabrika_analytics_anon_id';

/**
 * NG-9: the anonymous id the consent record is filed under (CookieConsentRecord.visitorId).
 * A random UUID minted when the visitor first saves a choice, never derived from anything.
 * Strictly necessary (it is the proof of the choice itself), so it is not removed on "reject"
 * and it never travels with analytics events.
 */
export const CONSENT_VISITOR_ID_STORAGE_KEY = 'fabrika_consent_id';

/**
 * The version of the cookie text a choice was made against, stored with the choice and in
 * the consent record. Bump it when the cookie policy or the banner text changes in substance.
 * `draft-…` while the policy waits for legal approval (NG-9, NG-29 publish gate).
 */
export const COOKIE_POLICY_VERSION = 'draft-2026-11-18';

/**
 * NG-371: an answer older than this is asked again (the browser side of the 12-month
 * limit the consent-record retention rests on, NG-366). Measured from `time`, the moment
 * the choice was saved.
 */
export const COOKIE_CONSENT_REPROMPT_DAYS = 365;

/** Window event the "Cookie preferences" links fire to reopen the banner (FO-180). */
export const OPEN_COOKIE_PREFERENCES_EVENT = 'fabrika:open-cookie-preferences';

/** NG-9: fired after a choice is saved, so a loader waiting for consent can start or stop. */
export const CONSENT_CHANGED_EVENT = 'fabrika:cookie-consent-changed';

/** The optional categories of the preference panel. `necessary` is always on and not a choice. */
export const OPTIONAL_COOKIE_CATEGORIES = ['analytics', 'marketing'] as const;
export type OptionalCookieCategory = (typeof OPTIONAL_COOKIE_CATEGORIES)[number];

export type CookieChoice = 'accept_all' | 'reject_all' | 'custom';
export const COOKIE_CHOICES: readonly CookieChoice[] = ['accept_all', 'reject_all', 'custom'];

export interface ConsentCategories {
  analytics: boolean;
  marketing: boolean;
}

export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}

function readStored(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * NG-371: an answer counts only while it is inside the re-ask window and was made against
 * the current policy text. No date (`time`), an unreadable date, another version: not an answer.
 */
function isCurrentAnswer(parsed: Record<string, unknown>, now: number): boolean {
  if (parsed.version !== COOKIE_POLICY_VERSION) return false;
  const decided = typeof parsed.time === 'string' ? Date.parse(parsed.time) : Number.NaN;
  // A date ahead of the clock (a skewed clock at save time) is not a current answer either.
  return Number.isFinite(decided) && decided <= now && now - decided < COOKIE_CONSENT_REPROMPT_DAYS * DAY_MS;
}

/**
 * The categories this browser agreed to, or `null` when it has not answered (or storage
 * is blocked, the value is unreadable, or the answer has expired or predates the current
 * policy: NG-371). Every doubt resolves to "off": KVKK / ePrivacy need opt-in.
 */
export function storedConsent(): ConsentCategories | null {
  if (typeof window === 'undefined') return null;
  const parsed = readStored();
  if (!parsed || !isCurrentAnswer(parsed, Date.now())) return null;
  // `analytics` is the panel's shape (and the e2e fixtures'); `accepted` is the older banner's.
  const analytics = typeof parsed.analytics === 'boolean' ? parsed.analytics : parsed.accepted === true;
  // Marketing never follows an older "accept all": that banner did not offer it.
  return { analytics, marketing: parsed.marketing === true };
}

/** What this browser answered last, or `null` when it has not (or storage is blocked). */
export function storedConsentLevel(): 'all' | 'essential' | 'custom' | null {
  const consent = storedConsent();
  if (!consent) return null;
  // An answer from before the panel had no marketing choice: "all" meant all it offered.
  if (typeof readStored()?.marketing !== 'boolean') return consent.analytics ? 'all' : 'essential';
  if (consent.analytics && consent.marketing) return 'all';
  if (!consent.analytics && !consent.marketing) return 'essential';
  return 'custom';
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
 * NG-371 (KVKK: withdrawing leaves nothing behind). Called by the banner when it finds no
 * current answer: an expired, older-policy or unreadable answer must not leave the analytics
 * anonymous id behind. Analytics only mints that id after a "yes", so a current answer keeps it.
 */
export function forgetAnalyticsWithoutConsent(): void {
  if (storedConsent() === null) clearAnalyticsStorage();
}

/** True only for an explicit "yes" to analytics. Unanswered, rejected, malformed, server render: no. */
export function hasAnalyticsConsent(): boolean {
  return storedConsent()?.analytics === true;
}

/** True only for an explicit "yes" to marketing (ad pixels). No pixel exists yet; this is its gate. */
export function hasMarketingConsent(): boolean {
  return storedConsent()?.marketing === true;
}

export function choiceFor(categories: ConsentCategories): CookieChoice {
  if (categories.analytics && categories.marketing) return 'accept_all';
  if (!categories.analytics && !categories.marketing) return 'reject_all';
  return 'custom';
}

/** The anonymous consent-record id of this browser, minted on first use. `null` if storage is blocked. */
export function consentVisitorId(): string | null {
  try {
    const existing = window.localStorage.getItem(CONSENT_VISITOR_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(CONSENT_VISITOR_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/**
 * Save a choice: browser first (the gate reads it at once), then the consent record in
 * our own database (POST /api/cookie-consent, fire-and-forget: a failed write never
 * blocks the visitor, and the stored choice still governs what loads).
 * `choice` is what the visitor pressed: the panel's "save" is `custom` even when its
 * switches happen to match "accept all".
 */
export function saveConsent(categories: ConsentCategories, choice: CookieChoice, locale: string): void {
  const level = choice === 'custom' ? 'custom' : categories.analytics && categories.marketing ? 'all' : 'essential';
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        necessary: true,
        analytics: categories.analytics,
        marketing: categories.marketing,
        accepted: categories.analytics,
        level,
        time: new Date().toISOString(),
        version: COOKIE_POLICY_VERSION,
      }),
    );
  } catch {
    // Storage blocked: nothing is stored, so the gate stays closed (hasAnalyticsConsent → false).
  }
  if (!categories.analytics) clearAnalyticsStorage();
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));

  const visitorId = consentVisitorId();
  if (!visitorId) return;
  try {
    void fetch('/api/cookie-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, choice, ...categories, policyVersion: COOKIE_POLICY_VERSION, locale }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // fetch unavailable: the browser-side choice stands.
  }
}
