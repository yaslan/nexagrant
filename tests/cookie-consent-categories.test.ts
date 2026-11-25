// @vitest-environment jsdom
/**
 * NG-9 (FE-1.5) — cookie categories, the marketing gate, and what a saved choice
 * writes (browser) and sends (our own consent record). No database: the POST is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics } from '@/lib/analytics';
import {
  ANALYTICS_ANON_ID_STORAGE_KEY,
  CONSENT_CHANGED_EVENT,
  CONSENT_STORAGE_KEY,
  CONSENT_VISITOR_ID_STORAGE_KEY,
  COOKIE_POLICY_VERSION,
  choiceFor,
  hasAnalyticsConsent,
  hasMarketingConsent,
  saveConsent,
  storedConsent,
  storedConsentLevel,
} from '@/lib/cookie-consent';
import { cookieConsentInput } from '@/lib/cookie-consent-record';

const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));

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

const consentPosts = () =>
  (fetchMock.mock.calls as unknown as [string, RequestInit][]).filter(([url]) => url === '/api/cookie-consent');
const capturePosts = () =>
  (fetchMock.mock.calls as unknown as [string, RequestInit][]).filter(([url]) => url.endsWith('/i/v0/e/'));

describe('stored categories', () => {
  it('unanswered → null, every category off', () => {
    expect(storedConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(hasMarketingConsent()).toBe(false);
  });

  it('an older "accept all" (no categories) keeps analytics, never turns marketing on', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ accepted: true, level: 'all' }));
    expect(storedConsent()).toEqual({ analytics: true, marketing: false });
    expect(storedConsentLevel()).toBe('all');
    expect(hasMarketingConsent()).toBe(false);
  });

  it('the `analytics` field wins over `accepted` (fixtures write it)', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ accepted: true, analytics: false }));
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it.each([
    [{ analytics: true, marketing: true }, 'accept_all'],
    [{ analytics: false, marketing: false }, 'reject_all'],
    [{ analytics: true, marketing: false }, 'custom'],
    [{ analytics: false, marketing: true }, 'custom'],
  ] as const)('choiceFor(%o) → %s', (categories, choice) => {
    expect(choiceFor(categories)).toBe(choice);
  });
});

describe('saveConsent', () => {
  it('reject → stored off, no analytics id, one consent POST with an anonymous id and no capture', () => {
    window.localStorage.setItem(ANALYTICS_ANON_ID_STORAGE_KEY, 'left-over');
    const changed = vi.fn();
    window.addEventListener(CONSENT_CHANGED_EVENT, changed);
    saveConsent({ analytics: false, marketing: false }, 'reject_all', 'tr');
    window.removeEventListener(CONSENT_CHANGED_EVENT, changed);

    expect(changed).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? '{}')).toMatchObject({
      necessary: true,
      analytics: false,
      marketing: false,
      accepted: false,
      level: 'essential',
      version: COOKIE_POLICY_VERSION,
    });
    expect(window.localStorage.getItem(ANALYTICS_ANON_ID_STORAGE_KEY)).toBeNull();

    const posts = consentPosts();
    expect(posts).toHaveLength(1);
    const body = JSON.parse(String(posts[0]![1].body));
    expect(body).toEqual({
      visitorId: window.localStorage.getItem(CONSENT_VISITOR_ID_STORAGE_KEY),
      choice: 'reject_all',
      analytics: false,
      marketing: false,
      policyVersion: COOKIE_POLICY_VERSION,
      locale: 'tr',
    });
    expect(posts[0]![1].credentials).toBe('omit');
    expect(cookieConsentInput.safeParse(body).success).toBe(true);

    analytics.track('readiness_started', { orgType: 'sme' });
    expect(capturePosts()).toHaveLength(0);
  });

  it('the same visitor id is reused for every later choice; analytics flows only while on', () => {
    saveConsent({ analytics: true, marketing: false }, 'custom', 'en');
    const id = window.localStorage.getItem(CONSENT_VISITOR_ID_STORAGE_KEY);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(storedConsentLevel()).toBe('custom');
    analytics.track('readiness_started', { orgType: 'sme' });
    expect(capturePosts()).toHaveLength(1);
    // The analytics id is not the consent id: the record cannot be joined to analytics events.
    expect(window.localStorage.getItem(ANALYTICS_ANON_ID_STORAGE_KEY)).not.toBe(id);

    saveConsent({ analytics: false, marketing: false }, 'reject_all', 'en');
    analytics.track('readiness_started', { orgType: 'sme' });
    expect(capturePosts()).toHaveLength(1);
    const ids = consentPosts().map(([, init]) => JSON.parse(String(init.body)).visitorId);
    expect(ids).toEqual([id, id]);
  });
});

describe('consent record input', () => {
  const ok = {
    visitorId: '6f1c2b8e-3d1a-4c5e-9b7a-2f4e6d8c0a1b',
    choice: 'custom',
    analytics: true,
    marketing: false,
    policyVersion: COOKIE_POLICY_VERSION,
    locale: 'tr',
  };
  it('accepts a well-formed choice', () => {
    expect(cookieConsentInput.safeParse(ok).success).toBe(true);
  });
  it.each([
    ['a visitor id that is not a UUID', { ...ok, visitorId: 'ali@example.com' }],
    ['an extra field (no IP, e-mail or user id may ride along)', { ...ok, ip: '1.2.3.4' }],
    ['an unknown choice', { ...ok, choice: 'maybe' }],
    ['"accept all" with a category off', { ...ok, choice: 'accept_all' }],
    ['"reject all" with a category on', { ...ok, choice: 'reject_all' }],
    ['an unknown locale', { ...ok, locale: 'de' }],
    ['a free-text policy version', { ...ok, policyVersion: 'Version 1 <script>' }],
  ])('rejects %s', (_label, body) => {
    expect(cookieConsentInput.safeParse(body).success).toBe(false);
  });
});
