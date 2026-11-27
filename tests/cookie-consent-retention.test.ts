import { describe, expect, it } from 'vitest';
import {
  COOKIE_CONSENT_RETENTION_DAYS,
  cookieConsentPurgeCutoff,
  purgeableCookieConsentWhere,
} from '@/lib/cookie-consent-retention';

const DAY = 24 * 60 * 60 * 1000;

describe('cookie consent retention (pure)', () => {
  it('keeps 1095 days, the value the patron approved on 26.11.2026 (NG-366)', () => {
    expect(COOKIE_CONSENT_RETENTION_DAYS).toBe(1095);
  });

  it('cutoff is exactly the retention window before now', () => {
    const now = new Date('2026-11-26T03:40:00.000Z');
    expect(cookieConsentPurgeCutoff(now).getTime()).toBe(now.getTime() - 1095 * DAY);
  });

  it('refuses a zero, negative, fractional or missing window', () => {
    const now = new Date('2026-11-26T03:40:00.000Z');
    expect(() => cookieConsentPurgeCutoff(now, 0)).toThrow(RangeError);
    expect(() => cookieConsentPurgeCutoff(now, -5)).toThrow(RangeError);
    expect(() => cookieConsentPurgeCutoff(now, 1.5)).toThrow(RangeError);
  });

  it('refuses an invalid now instead of computing a NaN cutoff', () => {
    expect(() => cookieConsentPurgeCutoff(new Date('nope'))).toThrow(RangeError);
  });

  it('the delete filter is strictly older than the cutoff on createdAt, and nothing else', () => {
    const cutoff = new Date('2026-01-01T00:00:00.000Z');
    expect(purgeableCookieConsentWhere(cutoff)).toEqual({ createdAt: { lt: cutoff } });
  });

  it('refuses an invalid cutoff: never a filterless delete', () => {
    expect(() => purgeableCookieConsentWhere(new Date('nope'))).toThrow(RangeError);
    expect(() => purgeableCookieConsentWhere(undefined as unknown as Date)).toThrow(RangeError);
  });
});
