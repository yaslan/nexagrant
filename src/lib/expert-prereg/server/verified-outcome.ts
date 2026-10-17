/**
 * FO-29 (TASK-MVC328LPDUWMM) — the result the verify redirect carries to the
 * "verified" page, signed.
 *
 * The redirect used to carry `?n=<founderNumber|yok>` or `?error=…` in the
 * clear, and the page showed whatever it was given: anyone could open
 * `/tr/uzman/dogrulandi?n=1` and screenshot a "Founding Expert #1" screen. Now
 * the redirect carries one `?r=` value, `<base64url(json)>.<base64url(hmac)>`,
 * and the page says "verified" only for an intact, unexpired one.
 *
 * The key is derived from AUTH_SECRET with a label of its own (same pattern as
 * src/lib/agency/registration-invite-cookie.ts), so a value signed for another
 * use of the secret is refused here. The body holds only the outcome, the
 * number and the expiry: never the token, the e-mail or the row id.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { VERIFIED_OUTCOME_TTL_SECONDS } from './constants';

/** Separates this value's key from every other use of AUTH_SECRET. */
const KEY_LABEL = 'fonbridge:expert-prereg-verified:v1';

export type VerifiedOutcome =
  | { outcome: 'ok'; founderNumber: number | null }
  | { outcome: 'expired' | 'invalid'; founderNumber: null };

interface Payload {
  v: 1;
  o: 'ok' | 'expired' | 'invalid';
  n: number | null;
  /** Expiry, unix seconds. */
  exp: number;
}

export interface VerifiedOutcomeOptions {
  secret: string;
  /** ms since epoch. */
  now?: number;
}

function mac(body: string, secret: string): Buffer {
  const key = createHmac('sha256', secret).update(KEY_LABEL).digest();
  return createHmac('sha256', key).update(body).digest();
}

/** Pure: `<base64url(json)>.<base64url(hmac)>`, valid for {@link VERIFIED_OUTCOME_TTL_SECONDS}. */
export function encodeVerifiedOutcome(result: VerifiedOutcome, { secret, now = Date.now() }: VerifiedOutcomeOptions): string {
  const payload: Payload = {
    v: 1,
    o: result.outcome,
    n: result.outcome === 'ok' ? result.founderNumber : null,
    exp: Math.floor(now / 1000) + VERIFIED_OUTCOME_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

/** Pure. Anything but an intact, unexpired value of the right shape is `null`. */
export function decodeVerifiedOutcome(raw: unknown, { secret, now = Date.now() }: VerifiedOutcomeOptions): VerifiedOutcome | null {
  if (typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1), 'base64url');
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let p: unknown;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object') return null;
  const { v, o, n, exp } = p as Record<string, unknown>;
  if (v !== 1 || typeof exp !== 'number' || !(exp > Math.floor(now / 1000))) return null;
  if (o === 'expired' || o === 'invalid') return n === null ? { outcome: o, founderNumber: null } : null;
  if (o !== 'ok') return null;
  if (n === null) return { outcome: 'ok', founderNumber: null };
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? { outcome: 'ok', founderNumber: n } : null;
}

/** Where the verify link lands, by UI language: the result travels only as a signed `?r=`. */
export function verifiedRedirectPath(locale: string, result: VerifiedOutcome, options: VerifiedOutcomeOptions): string {
  const base = locale === 'en' ? '/en/experts/verified' : '/tr/uzman/dogrulandi';
  return `${base}?r=${encodeVerifiedOutcome(result, options)}`;
}
