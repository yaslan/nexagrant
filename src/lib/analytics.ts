/**
 * Product analytics → PostHog capture API (TASK-MULQMKP4YOM04).
 *
 * Three gates, all of which must pass before a byte leaves the browser:
 *   1. `NEXT_PUBLIC_POSTHOG_KEY` is set. Blank = silent no-op (no console noise).
 *   2. The visitor pressed "accept all" on the cookie banner
 *      (`hasAnalyticsConsent`). Unanswered or "essential only" = nothing sent,
 *      no identifier written — KVKK / ePrivacy opt-in.
 *   3. It runs in a browser. Server renders never send.
 *
 * No personal data (KVKK): events carry an anonymous random id minted per
 * browser *after* consent — never the user id, e-mail, name or organisation —
 * and properties go through `sanitizeProperties`, which keeps only short scalar
 * values and drops identity-shaped keys and e-mail-shaped strings. Each event
 * asks PostHog not to build a person profile and not to geolocate the IP.
 * No URL, referrer or page title is sent: readiness result links carry answers
 * in the query string.
 *
 * Why not posthog-js: its defaults (autocapture of clicks and input metadata,
 * `$current_url`, session recording, its own cookie) are the opposite of the
 * rules above, and every one would have to be turned off and kept off. The
 * capture endpoint is a documented HTTP contract; one keepalive fetch covers it.
 */

import { hasAnalyticsConsent } from '@/lib/cookie-consent';

/** EU cloud by default: analytics data should stay in the EU region. */
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const ANON_ID_STORAGE_KEY = 'fabrika_analytics_anon_id';

const MAX_PROPERTIES = 20;
const MAX_STRING_LENGTH = 64;

/** Substring, case-insensitive. `orgName`, `userEmail`, `kurumAdi` all match. */
const PII_KEY_NEEDLES = [
  'email',
  'mail',
  'name',
  'adi',
  'soyad',
  'kurum',
  'phone',
  'telefon',
  'address',
  'adres',
  'user',
  'tckn',
  'vkn',
  'iban',
  'token',
  'ip',
];

const EMAIL_SHAPE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export type AnalyticsProperties = Record<string, string | number | boolean>;

/**
 * Keep what is safe to export and nothing else. Exported for the unit test —
 * this is the security-relevant half of the module.
 */
export function sanitizeProperties(properties: Record<string, unknown> | undefined): AnalyticsProperties {
  const clean: AnalyticsProperties = {};
  if (!properties) return clean;
  for (const [key, value] of Object.entries(properties)) {
    if (Object.keys(clean).length >= MAX_PROPERTIES) break;
    const lower = key.toLowerCase();
    if (key.startsWith('$') || PII_KEY_NEEDLES.some((needle) => lower.includes(needle))) continue;
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'string' && !EMAIL_SHAPE.test(value)) {
      clean[key] = value.slice(0, MAX_STRING_LENGTH);
    }
    // Objects, arrays, null, e-mail-shaped strings: dropped.
  }
  return clean;
}

function posthogConfig(): { key: string; host: string } | null {
  // Direct member access: Next inlines NEXT_PUBLIC_* at build time only in this form.
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
  return { key, host: host.replace(/\/+$/, '') };
}

/** Random, per browser, created only once consent exists. Not derived from anything. */
function anonymousId(): string | null {
  try {
    const existing = window.localStorage.getItem(ANON_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(ANON_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/** The request body, exported so the unit test can assert every field that leaves. */
export function buildCaptureBody(apiKey: string, event: string, distinctId: string, properties: AnalyticsProperties) {
  return {
    api_key: apiKey,
    event: event.slice(0, 100),
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
    properties: {
      ...properties,
      $lib: 'fonbridge-web',
      // Anonymous event: no person profile, no IP → location lookup.
      $process_person_profile: false,
      $geoip_disable: true,
    },
  };
}

export const analytics = {
  /** Fire-and-forget. Never throws; a failed send is not the caller's problem. */
  track(event: string, properties?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    const config = posthogConfig();
    if (!config || !hasAnalyticsConsent()) return;
    const distinctId = anonymousId();
    if (!distinctId) return;

    const body = buildCaptureBody(config.key, event, distinctId, sanitizeProperties(properties));
    try {
      void fetch(`${config.host}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // Survives the navigation a CTA click starts.
        keepalive: true,
        credentials: 'omit',
      }).catch(() => undefined);
    } catch {
      // fetch unavailable or the body rejected synchronously — drop the event.
    }
  },
};
