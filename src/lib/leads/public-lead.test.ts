import { describe, expect, it } from 'vitest';
import {
  PUBLIC_LEAD_CONSENT,
  PUBLIC_LEAD_RETENTION_DAYS,
  clientIpFrom,
  hashClientIp,
  publicLeadDeletionDate,
  publicLeadInputSchema,
  publicLeadPurgeCutoff,
  publicLeadRetentionMonths,
  purgeablePublicLeadWhere,
  submitPublicLead,
} from './public-lead';

// The write, the limits and the purge run against Postgres in tests/public-lead.live.test.ts;
// here only the rules that need no database.
const headers = (map: Record<string, string>) => ({ get: (k: string) => map[k.toLowerCase()] ?? null });

const valid = {
  name: 'Ayşe Yılmaz',
  email: 'Ayse@Example.org',
  organisation: 'İlkadım Belediyesi',
  consent: true,
  consentVersion: PUBLIC_LEAD_CONSENT.version,
  source: 'fon-hazirlik',
  locale: 'tr',
};

describe('retention rule', () => {
  it('proposes 12 months, stated once', () => {
    expect(PUBLIC_LEAD_RETENTION_DAYS).toBe(365);
    expect(publicLeadRetentionMonths()).toBe(12);
  });

  it('cuts off exactly the window before now, and the deletion date is the mirror of it', () => {
    const now = new Date('2027-09-30T03:45:00Z');
    expect(publicLeadPurgeCutoff(now).toISOString()).toBe('2026-09-30T03:45:00.000Z');
    expect(publicLeadDeletionDate(new Date('2026-09-30T03:45:00Z')).toISOString()).toBe(now.toISOString());
  });

  it('refuses a window or a moment that could reach new rows or drop the filter', () => {
    for (const days of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => publicLeadPurgeCutoff(new Date(), days)).toThrow(RangeError);
    }
    expect(() => publicLeadPurgeCutoff(new Date('nope'))).toThrow(RangeError);
    expect(() => purgeablePublicLeadWhere(new Date('nope'))).toThrow(RangeError);
    expect(() => purgeablePublicLeadWhere(undefined as unknown as Date)).toThrow(RangeError);
  });

  it('deletes by one strict date filter', () => {
    const cutoff = new Date('2026-01-01T00:00:00Z');
    expect(purgeablePublicLeadWhere(cutoff)).toEqual({ createdAt: { lt: cutoff } });
  });
});

describe('input', () => {
  it('normalises the address and blanks optional fields', () => {
    const parsed = publicLeadInputSchema.parse({ ...valid, email: '  Ayse@Example.org ', province: '', district: '  ' });
    expect(parsed).toMatchObject({ email: 'ayse@example.org', province: null, district: null, readinessCode: null });
  });

  it('accepts only a known province and a decodable result code', () => {
    expect(publicLeadInputSchema.safeParse({ ...valid, province: 'Samsun' }).success).toBe(true);
    expect(publicLeadInputSchema.safeParse({ ...valid, province: 'Atlantis' }).success).toBe(false);
    expect(publicLeadInputSchema.parse({ ...valid, readinessCode: 'municipality.000000000000000' }).readinessCode).toBe(
      'municipality.000000000000000'
    );
    expect(publicLeadInputSchema.parse({ ...valid, readinessCode: 'municipality.3' }).readinessCode).toBeNull();
  });

  it('refuses before any database call when consent is missing or outdated, or the honeypot is filled', async () => {
    // No `db` is passed and none is reachable from here: each of these returns before the write.
    expect(await submitPublicLead({ ...valid, consent: undefined })).toEqual({ ok: false, error: 'consent_required' });
    expect(await submitPublicLead({ ...valid, consentVersion: 'old' })).toEqual({ ok: false, error: 'consent_outdated' });
    expect(await submitPublicLead({ ...valid, website: 'x' })).toEqual({ ok: true });
    expect(await submitPublicLead(null)).toEqual({ ok: false, error: 'consent_required' });
    expect(await submitPublicLead({ ...valid, email: 'nope' })).toEqual({ ok: false, error: 'invalid', fields: ['email'] });
  });
});

describe('client IP', () => {
  it('takes the first X-Forwarded-For hop, then X-Real-IP', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }))).toBe('203.0.113.1');
    expect(clientIpFrom(headers({ 'x-real-ip': ' 198.51.100.2 ' }))).toBe('198.51.100.2');
    expect(clientIpFrom(headers({}))).toBeNull();
  });

  it('is stored only as a keyed hash, and not at all without a key', () => {
    const a = hashClientIp('203.0.113.1', 'secret-a');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashClientIp('203.0.113.1', 'secret-a'));
    expect(a).not.toBe(hashClientIp('203.0.113.1', 'secret-b'));
    expect(a).not.toBe(hashClientIp('203.0.113.2', 'secret-a'));
    expect(hashClientIp('203.0.113.1', null)).toBeNull();
    expect(hashClientIp(null, 'secret-a')).toBeNull();
  });
});
