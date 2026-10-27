// @vitest-environment jsdom
/**
 * TASK-MULQMKP4YOM04 — PostHog capture behind key + cookie consent, no PII.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics, buildCaptureBody, sanitizeProperties } from '@/lib/analytics';
import {
  ANALYTICS_ANON_ID_STORAGE_KEY,
  CONSENT_STORAGE_KEY,
  OPEN_COOKIE_PREFERENCES_EVENT,
  clearAnalyticsStorage,
  hasAnalyticsConsent,
  openCookiePreferences,
  storedConsentLevel,
} from '@/lib/cookie-consent';

const fetchMock = vi.fn(async () => new Response('{}'));

/**
 * jsdom here has no Storage (`typeof localStorage` is `undefined`, same as
 * tests/notifications-read-store.test.tsx), so install a real in-memory one.
 */
function installLocalStorage(): void {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}
installLocalStorage();

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'http://127.0.0.1:9/');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const accept = () => window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ accepted: true, level: 'all' }));
const reject = () => window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ accepted: false, level: 'essential' }));

describe('consent gate', () => {
  it.each([
    ['unanswered', () => undefined],
    ['essential only', reject],
    ['malformed', () => window.localStorage.setItem(CONSENT_STORAGE_KEY, '{nope')],
  ])('%s → nothing sent, no identifier written', (_label, setup) => {
    setup();
    expect(hasAnalyticsConsent()).toBe(false);
    analytics.track('readiness_started', { orgType: 'sme' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('fabrika_analytics_anon_id')).toBeNull();
  });

  it('no key → silent no-op even with consent', () => {
    accept();
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const log = vi.spyOn(console, 'log');
    analytics.track('readiness_started', { orgType: 'sme' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('accepted → one POST to the capture endpoint with a stable anonymous id', () => {
    accept();
    analytics.track('readiness_started', { orgType: 'sme' });
    analytics.track('readiness_completed', { orgType: 'sme', total: 72 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9/i/v0/e/');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('omit');
    const first = JSON.parse(String(init.body));
    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(first.distinct_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.distinct_id).toBe(first.distinct_id);
    expect(first.properties).toMatchObject({ orgType: 'sme', $process_person_profile: false, $geoip_disable: true });
  });
});

describe('sanitizeProperties', () => {
  it('drops identity-shaped keys, e-mail values, objects and caller-set $ keys', () => {
    expect(
      sanitizeProperties({
        orgType: 'municipality',
        total: 72,
        ok: true,
        email: 'a@b.co',
        orgName: 'Örnek Belediyesi',
        kurumAdi: 'Örnek',
        fullName: 'Ayşe Y',
        userId: 'cuid123',
        note: 'mail me at a@b.co',
        nested: { a: 1 },
        $ip: '1.2.3.4',
        long: 'x'.repeat(200),
      })
    ).toEqual({ orgType: 'municipality', total: 72, ok: true, long: 'x'.repeat(64) });
  });

  it('builds a body with no url/referrer/person fields', () => {
    const body = buildCaptureBody('k', 'e', 'id', { a: 1 });
    expect(Object.keys(body).sort()).toEqual(['api_key', 'distinct_id', 'event', 'properties', 'timestamp']);
    expect(Object.keys(body.properties).sort()).toEqual(['$geoip_disable', '$lib', '$process_person_profile', 'a']);
  });
});

/** FO-180 — the "Cookie preferences" links reopen the banner; withdrawing removes what analytics stored. */
describe('cookie preferences', () => {
  it('opens the banner through one window event', () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, listener);
    openCookiePreferences();
    window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reads the stored answer, and nothing as "not answered"', () => {
    expect(storedConsentLevel()).toBeNull();
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ accepted: true, level: 'all' }));
    expect(storedConsentLevel()).toBe('all');
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ accepted: false, level: 'essential' }));
    expect(storedConsentLevel()).toBe('essential');
    window.localStorage.setItem(CONSENT_STORAGE_KEY, '{nope');
    expect(storedConsentLevel()).toBeNull();
  });

  it('withdrawing removes the analytics id and leaves the rest of storage alone', () => {
    window.localStorage.setItem(ANALYTICS_ANON_ID_STORAGE_KEY, 'anon');
    window.localStorage.setItem('fabrika_cart', '[]');
    clearAnalyticsStorage();
    expect(window.localStorage.getItem(ANALYTICS_ANON_ID_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('fabrika_cart')).toBe('[]');
  });
});
