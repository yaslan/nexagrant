import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_NAME } from '@/lib/brand';
import { logger } from '@/lib/logger';
import {
  PUBLIC_LEAD_CONSENT,
  PUBLIC_LEAD_RETENTION_DAYS,
  MAX_TRUSTED_PROXY_HOPS,
  clientIpFrom,
  hashClientIp,
  ipBucket,
  publicLeadDeletionDate,
  publicLeadInputSchema,
  publicLeadPurgeCutoff,
  publicLeadRetentionMonths,
  purgeablePublicLeadWhere,
  submitPublicLead,
  trustedProxyHops,
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
  it('keeps 12 months (owner decision 29.09.2026), stated once', () => {
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
  // İNCELEME-50 B-1: nginx's $proxy_add_x_forwarded_for keeps what the client sent
  // and appends the real peer, so the chain reaching the app is "<forged…>, <real>".
  it('takes the hop our proxy appended, never the one the client wrote', () => {
    const forged = headers({ 'x-forwarded-for': '10.9.3.1, 198.51.100.77' });
    expect(clientIpFrom(forged, 1)).toBe('198.51.100.77');
    expect(clientIpFrom(headers({ 'x-forwarded-for': ' 1.1.1.1 , 2.2.2.2,198.51.100.77 ' }), 1)).toBe('198.51.100.77');
    expect(clientIpFrom(headers({ 'x-forwarded-for': '198.51.100.77' }), 1)).toBe('198.51.100.77');
    // Two proxies of ours (e.g. CDN → nginx): the second from the right.
    expect(clientIpFrom(headers({ 'x-forwarded-for': '10.9.3.1, 198.51.100.77, 172.16.0.5' }), 2)).toBe('198.51.100.77');
    // Fewer entries than proxies: all were appended by us, the leftmost is the client.
    expect(clientIpFrom(headers({ 'x-forwarded-for': '198.51.100.77' }), 2)).toBe('198.51.100.77');
  });

  // FO-51: the live host is one LiteSpeed in front of Passenger (no CDN), so the value
  // that goes into the deploy template must read the entry that one proxy appended.
  it('with the live value (one proxy) ignores a forged X-Forwarded-For prefix', () => {
    const live = trustedProxyHops('1');
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.9, 198.51.100.77' }), live)).toBe('198.51.100.77');
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.9, 203.0.113.10, 198.51.100.77' }), live)).toBe('198.51.100.77');
    expect(clientIpFrom(headers({ 'x-forwarded-for': '198.51.100.77' }), live)).toBe('198.51.100.77');
    expect(readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')).toMatch(/^TRUSTED_PROXY_HOPS=1$/m);
  });

  it('never reads X-Real-IP, and trusts nothing with no proxy of ours or no header', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '198.51.100.2' }), 1)).toBeNull();
    expect(clientIpFrom(headers({ 'x-forwarded-for': '198.51.100.77', 'x-real-ip': '10.0.0.1' }), 1)).toBe('198.51.100.77');
    expect(clientIpFrom(headers({ 'x-forwarded-for': '10.9.3.1, 198.51.100.77' }), 0)).toBeNull();
    expect(clientIpFrom(headers({ 'x-forwarded-for': ' , ' }), 1)).toBeNull();
    expect(clientIpFrom(headers({}), 1)).toBeNull();
  });

  it('reads the proxy count from TRUSTED_PROXY_HOPS, 1 when unset or unusable', () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops('')).toBe(1);
    expect(trustedProxyHops('0')).toBe(0);
    expect(trustedProxyHops(' 2 ')).toBe(2);
    for (const bad of ['-1', '1.5', 'two', 'NaN']) expect(trustedProxyHops(bad)).toBe(1);
  });

  // İNCELEME-61 Ö-2: an unusable value is logged, and no topology of ours has more than a few proxies.
  it('accepts only a plain 0..5 and says so once when it falls back', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      expect(trustedProxyHops(String(MAX_TRUSTED_PROXY_HOPS))).toBe(MAX_TRUSTED_PROXY_HOPS);
      for (const bad of ['6', '99', '0x2', '1e0', '2abc', 'Infinity', '-0']) expect(trustedProxyHops(bad)).toBe(1);
      expect(warn).toHaveBeenCalledTimes(7);
      expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('TRUSTED_PROXY_HOPS'), { value: '-0' });
      trustedProxyHops('-0');
      expect(warn).toHaveBeenCalledTimes(7);
      trustedProxyHops('1');
      expect(warn).toHaveBeenCalledTimes(7);
    } finally {
      warn.mockRestore();
    }
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

  // İNCELEME-61 B-1: one IPv6 host holds a /64; counting full addresses let it rotate the limit away.
  it('counts an IPv6 address by its /64 and an IPv4-mapped one as the IPv4 address', () => {
    expect(ipBucket('2001:db8:1:2::b1')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:0DB8:0001:0002:ffff:1:2:3')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('[2001:db8:1:2::9]')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('64:ff9b::198.51.100.7')).toBe('64:ff9b:0:0::/64');
    expect(ipBucket('::ffff:198.51.100.77')).toBe('198.51.100.77');
    expect(ipBucket('::FFFF:c633:644d')).toBe('198.51.100.77');
    expect(ipBucket('198.51.100.77')).toBe('198.51.100.77');
    expect(ipBucket('198.51.100.77:4711')).toBe('198.51.100.77:4711');
    expect(ipBucket('not-an-ip')).toBe('not-an-ip');

    const h = (ip: string) => hashClientIp(ip, 'secret-a');
    expect(h('fd61:61:61:61::b1')).toBe(h('fd61:61:61:61::bc'));
    expect(h('fd61:61:61:61::b1')).toBe(h('fd61:61:61:61:dead:beef:1:2'));
    expect(h('fd61:61:61:61::b1')).not.toBe(h('fd61:61:61:62::b1'));
    expect(h('::ffff:198.51.100.77')).toBe(h('198.51.100.77'));
    expect(h('198.51.100.77')).not.toBe(h('198.51.100.78'));
  });
});

// İNCELEME-50 Y-3: the consent text is rendered from messages/*.json with the
// retention constant in it, so a new wording OR a new period is a new text. Each
// version is pinned to the digest of what tr and en visitors actually read; change
// either without bumping PUBLIC_LEAD_CONSENT.version (and adding its line here)
// and this goes red, so no stored row claims consent to a text nobody saw.
// `withdraw` is the line under the box (İNCELEME-61 Ö-3): same text, same version rule.
const CONSENT_TEXT_SHA256: Record<string, { tr: string; en: string; withdraw: { tr: string; en: string } }> = {
  '2026-09-30.1': {
    tr: '1ab76e5d9281016fd15b92ee62adb70433abc34fe11b542e8c59c93b11d0fa56',
    en: '8bea0d1379b565f4223dab439d9aad557b34bb635eeddeffe55e7aecaa7b65cf',
    withdraw: {
      tr: 'c0375312f72af7b54ac1f6f780e741f7e209bb1f71f76bca9af859e8cf38887e',
      en: 'b5b7c72ea5dbd7c9080a4204c11934736a73c35a78269718cee9fa757228a6f7',
    },
  },
  // FO-275: the product name inside the consent box changed (FonBridge -> NexaGrant), so this is
  // a new text and a new version. The withdraw line names no product, hence its digest is unchanged.
  '2026-10-31.1': {
    tr: 'b13dca9e9a0eeab4976e43446c71ee58d07734146ccdd93aaa3e48d67b367245',
    en: '34da689f508e31556c67dc936e07982500dbb7594ab059d4499d317efae5cf96',
    withdraw: {
      tr: 'c0375312f72af7b54ac1f6f780e741f7e209bb1f71f76bca9af859e8cf38887e',
      en: 'b5b7c72ea5dbd7c9080a4204c11934736a73c35a78269718cee9fa757228a6f7',
    },
  },
};

function renderedConsent(locale: 'tr' | 'en', messageKey: string = PUBLIC_LEAD_CONSENT.messageKey): string {
  const messages = JSON.parse(readFileSync(resolve(process.cwd(), `messages/${locale}.json`), 'utf8'));
  const template = messageKey.split('.').reduce((node, key) => node?.[key], messages) as unknown;
  if (typeof template !== 'string') throw new Error(`${locale}: ${messageKey} is missing`);
  // Same arguments as fon-hazirlik/lead-form.tsx passes to t('consent_label', …).
  const args: Record<string, string> = { months: String(publicLeadRetentionMonths()), brand: PRODUCT_NAME };
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (!(name in args)) throw new Error(`${locale}: consent text has an unknown placeholder ${whole}`);
    return args[name]!;
  });
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('consent text version', () => {
  it('pins the current version to the exact tr/en text a visitor reads', () => {
    const pinned = CONSENT_TEXT_SHA256[PUBLIC_LEAD_CONSENT.version];
    expect(pinned, `no digest for consent version ${PUBLIC_LEAD_CONSENT.version}: add one here`).toBeDefined();
    const withdraw = PUBLIC_LEAD_CONSENT.withdrawKey;
    expect({
      tr: sha256(renderedConsent('tr')),
      en: sha256(renderedConsent('en')),
      withdraw: { tr: sha256(renderedConsent('tr', withdraw)), en: sha256(renderedConsent('en', withdraw)) },
    }).toEqual(pinned);
  });

  it('states the retention period the purge applies', () => {
    const months = String(publicLeadRetentionMonths());
    expect(renderedConsent('tr')).toContain(`${months} ay`);
    expect(renderedConsent('en')).toContain(`${months} months`);
  });

  it('never re-uses a digest for a different version', () => {
    // The consent-box text is what a version stands for: a new version must carry new tr/en text.
    const boxes = Object.values(CONSENT_TEXT_SHA256).flatMap((d) => [d.tr, d.en]);
    expect(new Set(boxes).size).toBe(boxes.length);
    // The withdraw line may stay as it was when only the box changed (FO-275 renamed the product,
    // which the line never names), but no two versions may be the same text in every part.
    const whole = Object.values(CONSENT_TEXT_SHA256).map((d) => [d.tr, d.en, d.withdraw.tr, d.withdraw.en].join('|'));
    expect(new Set(whole).size).toBe(whole.length);
  });
});
