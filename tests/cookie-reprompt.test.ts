// @vitest-environment jsdom
/**
 * NG-371 — a stored cookie answer expires after COOKIE_CONSENT_REPROMPT_DAYS and is void
 * when it was made against another policy version. Expired, undated, other-version or
 * unreadable answers read as "no answer": analytics and marketing stay off and the banner asks again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANALYTICS_ANON_ID_STORAGE_KEY,
  COOKIE_CONSENT_REPROMPT_DAYS,
  COOKIE_POLICY_VERSION,
  CONSENT_STORAGE_KEY,
  forgetAnalyticsWithoutConsent,
  hasAnalyticsConsent,
  hasMarketingConsent,
  saveConsent,
  storedConsent,
} from '@/lib/cookie-consent';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function store(answer: Record<string, unknown>): void {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(answer));
}

const answerAged = (ageDays: number, extra: Record<string, unknown> = {}) => ({
  necessary: true,
  analytics: true,
  marketing: true,
  accepted: true,
  level: 'all',
  time: new Date(Date.now() - ageDays * DAY_MS).toISOString(),
  version: COOKIE_POLICY_VERSION,
  ...extra,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('cookie answer expiry (NG-371)', () => {
  it('the re-ask window is 12 months', () => {
    expect(COOKIE_CONSENT_REPROMPT_DAYS).toBe(365);
  });

  it('a fresh answer is current: analytics and marketing follow it', () => {
    store(answerAged(1));
    expect(storedConsent()).toEqual({ analytics: true, marketing: true });
    expect(hasAnalyticsConsent()).toBe(true);
    expect(hasMarketingConsent()).toBe(true);
  });

  it('an answer just inside the window (364 days) is still current', () => {
    store(answerAged(364));
    expect(storedConsent()).toEqual({ analytics: true, marketing: true });
  });

  it('an answer 366 days old is no answer: null, analytics and marketing off', () => {
    store(answerAged(366));
    expect(storedConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(hasMarketingConsent()).toBe(false);
  });

  it('an answer made against another policy version is no answer', () => {
    store(answerAged(1, { version: 'draft-2025-01-01' }));
    expect(storedConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('an undated answer (from before the date was stored) is no answer', () => {
    const { time: _time, ...undated } = answerAged(1);
    void _time;
    store(undated);
    expect(storedConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('an answer with an unreadable date is no answer', () => {
    store(answerAged(1, { time: 'not-a-date' }));
    expect(storedConsent()).toBeNull();
  });

  it('a corrupt stored value is no answer', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, '{nope');
    expect(storedConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  // Ö-2: a clock that ran ahead when the choice was saved must not stretch the window.
  it('an answer dated in the future is no answer', () => {
    store(answerAged(-1));
    expect(storedConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(hasMarketingConsent()).toBe(false);
  });

  // Ö-1: an expired answer leaves no anonymous analytics id behind.
  it('an expired answer: the banner clears the analytics anonymous id', () => {
    store(answerAged(366));
    window.localStorage.setItem(ANALYTICS_ANON_ID_STORAGE_KEY, 'anon-from-last-year');
    forgetAnalyticsWithoutConsent();
    expect(window.localStorage.getItem(ANALYTICS_ANON_ID_STORAGE_KEY)).toBeNull();
  });

  it('a current answer keeps the analytics anonymous id', () => {
    store(answerAged(1));
    window.localStorage.setItem(ANALYTICS_ANON_ID_STORAGE_KEY, 'anon-current');
    forgetAnalyticsWithoutConsent();
    expect(window.localStorage.getItem(ANALYTICS_ANON_ID_STORAGE_KEY)).toBe('anon-current');
  });

  it('a choice saved now is dated and current, so it is not asked again', () => {
    saveConsent({ analytics: true, marketing: false }, 'custom', 'tr');
    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? '{}') as { time?: string };
    expect(Number.isNaN(Date.parse(saved.time ?? ''))).toBe(false);
    expect(storedConsent()).toEqual({ analytics: true, marketing: false });
  });
});

/**
 * The e2e fixtures seed a stored answer by hand. Each one must carry the current policy
 * version, or the banner would open in every test and it would be the fixture that is stale.
 * A policy bump has to change these fixtures with it.
 */
describe('e2e consent fixtures carry the current policy version', () => {
  function specFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return specFiles(path);
      return name.endsWith('.ts') ? [path] : [];
    });
  }

  it('every seeded `time: new Date()` fixture names COOKIE_POLICY_VERSION', () => {
    const seeded: { file: string; version: string }[] = [];
    for (const file of specFiles(join(process.cwd(), 'tests', 'e2e'))) {
      // Whitespace-tolerant (Ö-5): a fixture written over several lines is still checked.
      for (const match of readFileSync(file, 'utf8').matchAll(/time:\s*new Date\(\)\.toISOString\(\),\s*version:\s*'([^']+)'/g)) {
        seeded.push({ file, version: match[1] ?? '' });
      }
    }
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.filter((s) => s.version !== COOKIE_POLICY_VERSION)).toEqual([]);
  });
});
