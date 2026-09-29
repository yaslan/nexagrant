/**
 * Carrying an agency invite code, and the acknowledgement that came with it,
 * across a Google/Microsoft round trip (TASK-MUM676F010E9G, ADR-0006).
 *
 * Until ADR-0006 a code travelled only with the demo e-mail form (B1 decision
 * S2-a), because the OAuth round trip dropped it. Production has no e-mail
 * form, so in production nobody could register with a code at all. The code is
 * now parked here by the server action that starts the redirect, read back in
 * the `signIn` callback (to refuse a bad code before any row exists) and in
 * `createUser` (to use it in the registration transaction), and deleted after.
 *
 * Unlike the acknowledgement and province cookies, this one is SIGNED (HMAC
 * with a key derived from AUTH_SECRET) and carries its own expiry:
 *
 * - The code is a bearer secret that links a new organisation to an agency. An
 *   unsigned cookie could be planted by anything able to set a cookie for the
 *   host (a sibling subdomain, a proxy on plain http) and would link somebody
 *   else's registration to the planter's agency.
 * - `maxAge` is the browser's promise; `exp` inside the signed value is ours.
 *   A cookie replayed after 15 minutes is refused whatever the jar says.
 *
 * httpOnly + SameSite=Lax: the provider's redirect back to
 * `/api/auth/callback/<provider>` is a top-level GET, which Lax sends.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const REGISTRATION_INVITE_COOKIE = 'fabrika_registration_invite';

/** Same window as the other registration cookies: a slow consent screen at the provider. */
export const INVITE_COOKIE_MAX_AGE_SECONDS = 15 * 60;

/** Separates this cookie's key from every other use of AUTH_SECRET. */
const KEY_LABEL = 'fabrika/registration-invite/v1';

export interface RegistrationInvite {
  /** As typed. Only `redeemInviteCode` judges it. */
  code: string;
  /** The acknowledgement token that was checked when the redirect started. */
  acknowledgement: string;
  /** Where to send the person back to if the sign-in is refused. */
  locale: string;
}

export type RegistrationInviteRead =
  | { status: 'none' }
  /** Present but tampered with, unreadable or past `exp`. Treated as a bad code. */
  | { status: 'invalid' }
  | { status: 'ok'; invite: RegistrationInvite };

interface Payload extends RegistrationInvite {
  /** Expiry, ms since epoch. */
  exp: number;
}

function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(KEY_LABEL).digest();
}

function mac(body: string, secret: string): Buffer {
  return createHmac('sha256', signingKey(secret)).update(body).digest();
}

/** Pure: `<base64url(json)>.<base64url(hmac)>`. */
export function encodeRegistrationInvite(
  invite: RegistrationInvite,
  secret: string,
  now: number = Date.now()
): string {
  const payload: Payload = { ...invite, exp: now + INVITE_COOKIE_MAX_AGE_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

/** Pure. Anything but an intact, unexpired value of the right shape is `invalid`. */
export function decodeRegistrationInvite(
  value: string | undefined,
  secret: string,
  now: number = Date.now()
): RegistrationInviteRead {
  if (!value) return { status: 'none' };
  const dot = value.indexOf('.');
  if (dot <= 0) return { status: 'invalid' };
  const body = value.slice(0, dot);
  let given: Buffer;
  try {
    given = Buffer.from(value.slice(dot + 1), 'base64url');
  } catch {
    return { status: 'invalid' };
  }
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { status: 'invalid' };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { status: 'invalid' };
  }
  if (!payload || typeof payload !== 'object') return { status: 'invalid' };
  const p = payload as Record<string, unknown>;
  if (
    typeof p.code !== 'string' ||
    typeof p.acknowledgement !== 'string' ||
    typeof p.locale !== 'string' ||
    typeof p.exp !== 'number' ||
    !(p.exp > now)
  ) {
    return { status: 'invalid' };
  }
  return {
    status: 'ok',
    invite: { code: p.code, acknowledgement: p.acknowledgement, locale: p.locale },
  };
}

/**
 * The same secret NextAuth signs sessions with. Startup refuses to run without
 * it (src/instrumentation.ts), so a missing one here is a broken process; a
 * cookie that cannot be signed is not set and cannot be read.
 */
function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

/** Called from the server action that starts the OAuth redirect. */
export async function setRegistrationInviteCookie(invite: RegistrationInvite | null): Promise<void> {
  const jar = await cookies();
  const key = secret();
  if (!invite || !key) {
    jar.delete(REGISTRATION_INVITE_COOKIE);
    return;
  }
  jar.set(REGISTRATION_INVITE_COOKIE, encodeRegistrationInvite(invite, key), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INVITE_COOKIE_MAX_AGE_SECONDS,
  });
}

/** `none` when there is no request context either: a bootstrap must not throw on a missing jar. */
export async function readRegistrationInvite(): Promise<RegistrationInviteRead> {
  const key = secret();
  try {
    const jar = await cookies();
    const value = jar.get(REGISTRATION_INVITE_COOKIE)?.value;
    if (!key) return value ? { status: 'invalid' } : { status: 'none' };
    return decodeRegistrationInvite(value, key);
  } catch {
    return { status: 'none' };
  }
}

/** Single use: deleted once a sign-in has decided what to do with it. Best effort. */
export async function clearRegistrationInviteCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(REGISTRATION_INVITE_COOKIE);
  } catch {
    // No request context (a job, a test): nothing to clear.
  }
}
