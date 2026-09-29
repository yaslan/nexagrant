/**
 * Carrying the scorecard result (FB KAMU B6, TASK-MULRR8P7HIII4) across an OAuth
 * sign-up — the same problem and answer as registration-province-cookie.ts.
 *
 * The cookie is written only when the person ticked "add my result to my
 * account" and cleared on every other OAuth start, so a result chosen in one
 * sign-up on a shared machine cannot land on the next person's organisation.
 * What is read back goes through toReadinessCode: a hand-made cookie can only
 * ever be a valid result, stored on the new user's own tenant.
 */
import { cookies } from 'next/headers';

import { toReadinessCode } from './readiness/account';

export const REGISTRATION_READINESS_COOKIE = 'fabrika_registration_readiness';

/** As the acknowledgement cookie: long enough for a slow consent screen. */
const MAX_AGE_SECONDS = 15 * 60;

/** Called from the server action that starts the OAuth redirect. */
export async function setRegistrationReadinessCookie(code: string | null | undefined): Promise<void> {
  const jar = await cookies();
  const value = toReadinessCode(code);
  if (!value) {
    jar.delete(REGISTRATION_READINESS_COOKIE);
    return;
  }
  jar.set(REGISTRATION_READINESS_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Null when there is none, it does not decode, or there is no request context. */
export async function readRegistrationReadiness(): Promise<string | null> {
  try {
    const jar = await cookies();
    return toReadinessCode(jar.get(REGISTRATION_READINESS_COOKIE)?.value);
  } catch {
    return null;
  }
}

/**
 * Single use (İNCELEME-12 Ö-1, TASK-MUM74FUB1DRCM): called by `createUser` right
 * after the value is read. Left in place, a scorecard result parked for a sign-up that was
 * abandoned at the consent screen landed on the next registration in the same
 * browser within 15 minutes.
 */
export async function clearRegistrationReadinessCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(REGISTRATION_READINESS_COOKIE);
  } catch {
    // No request context: nothing to clear.
  }
}
