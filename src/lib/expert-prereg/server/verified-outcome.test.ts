import { describe, expect, it } from 'vitest';
import { encodeRegistrationInvite } from '@/lib/agency/registration-invite-cookie';
import { VERIFIED_OUTCOME_TTL_SECONDS } from './constants';
import { decodeVerifiedOutcome, encodeVerifiedOutcome, verifiedRedirectPath } from './verified-outcome';

/**
 * FO-29 (TASK-MVC328LPDUWMM) — the verified page trusts only a result the
 * verify route signed: a typed `?n=1`, a changed byte, an old value or one
 * signed for another use of AUTH_SECRET all read as "no result".
 */

const SECRET = 'test-secret-'.padEnd(44, 'x');
const NOW = Date.UTC(2026, 9, 17, 10, 0, 0);
const opts = { secret: SECRET, now: NOW };

describe('verified outcome signature', () => {
  it('round-trips each outcome', () => {
    for (const result of [
      { outcome: 'ok', founderNumber: 7 },
      { outcome: 'ok', founderNumber: null },
      { outcome: 'expired', founderNumber: null },
      { outcome: 'invalid', founderNumber: null },
    ] as const) {
      expect(decodeVerifiedOutcome(encodeVerifiedOutcome(result, opts), opts)).toEqual(result);
    }
  });

  it('a single changed byte in the signature or the body is refused', () => {
    const value = encodeVerifiedOutcome({ outcome: 'ok', founderNumber: 1 }, opts);
    const dot = value.indexOf('.');
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    expect(decodeVerifiedOutcome(flip(value, value.length - 2), opts)).toBeNull();
    expect(decodeVerifiedOutcome(flip(value, dot - 2), opts)).toBeNull();
    expect(decodeVerifiedOutcome(value, { ...opts, secret: `${SECRET}y` })).toBeNull();
  });

  it('a value past its expiry is refused', () => {
    const value = encodeVerifiedOutcome({ outcome: 'ok', founderNumber: 1 }, opts);
    const ttlMs = VERIFIED_OUTCOME_TTL_SECONDS * 1000;
    expect(decodeVerifiedOutcome(value, { ...opts, now: NOW + ttlMs - 1000 })).not.toBeNull();
    expect(decodeVerifiedOutcome(value, { ...opts, now: NOW + ttlMs })).toBeNull();
  });

  it('a value signed with the registration-invite label is refused', () => {
    const other = encodeRegistrationInvite({ code: 'c', acknowledgement: 'a', locale: 'tr' }, SECRET, NOW);
    expect(decodeVerifiedOutcome(other, opts)).toBeNull();
  });

  it('missing, array, malformed or wrongly shaped input is refused', () => {
    for (const raw of [undefined, '', '1', ['x.y'], '.abc', 'abc.', '!!!.***', 'e30.e30']) {
      expect(decodeVerifiedOutcome(raw, opts)).toBeNull();
    }
    const valid = encodeVerifiedOutcome({ outcome: 'ok', founderNumber: 2 }, opts);
    expect(decodeVerifiedOutcome([valid], opts)).toBeNull();
  });

  it('the body carries only outcome, number and expiry', () => {
    const value = encodeVerifiedOutcome({ outcome: 'ok', founderNumber: 3 }, opts);
    const body = JSON.parse(Buffer.from(value.split('.')[0]!, 'base64url').toString('utf8'));
    expect(body).toEqual({ v: 1, o: 'ok', n: 3, exp: NOW / 1000 + VERIFIED_OUTCOME_TTL_SECONDS });
  });
});

describe('verifiedRedirectPath', () => {
  it('carries only a signed r, never n or error', () => {
    for (const [locale, base] of [
      ['tr', '/tr/uzman/dogrulandi'],
      ['en', '/en/experts/verified'],
    ] as const) {
      for (const result of [
        { outcome: 'ok', founderNumber: 5 },
        { outcome: 'expired', founderNumber: null },
      ] as const) {
        const url = new URL(verifiedRedirectPath(locale, result, opts), 'https://x.test');
        expect(url.pathname).toBe(base);
        expect([...url.searchParams.keys()]).toEqual(['r']);
        expect(url.search).not.toMatch(/[?&](n|error)=/);
        expect(decodeVerifiedOutcome(url.searchParams.get('r'), opts)).toEqual(result);
      }
    }
  });
});
