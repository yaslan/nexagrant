/**
 * Carrying the optional province (TASK-MULV3JXS1AW5X) across an OAuth sign-up.
 *
 * Same problem and same answer as src/lib/legal/registration-ack-cookie.ts: the
 * browser leaves for Google and the tenant is created in NextAuth's
 * `createUser` event, where the form is gone. The choice is parked in a
 * short-lived httpOnly cookie set by our own server action.
 *
 * The action always writes or clears it, so a province chosen in one sign-up on
 * a shared machine cannot end up on the next person's organisation. Whatever is
 * read back goes through toTenantProvince, so a hand-made cookie can only ever
 * set one of the 81 names, on the new user's own tenant.
 */
import { cookies } from 'next/headers';

import { toTenantProvince } from './province';
import type { TrProvince } from './readiness/provinces';

export const REGISTRATION_PROVINCE_COOKIE = 'fabrika_registration_province';

/** As the acknowledgement cookie: long enough for a slow consent screen. */
const MAX_AGE_SECONDS = 15 * 60;

/** Called from the server action that starts the OAuth redirect. */
export async function setRegistrationProvinceCookie(province: string | null | undefined): Promise<void> {
  const jar = await cookies();
  const value = toTenantProvince(province);
  if (!value) {
    jar.delete(REGISTRATION_PROVINCE_COOKIE);
    return;
  }
  jar.set(REGISTRATION_PROVINCE_COOKIE, encodeURIComponent(value), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Null when there is none, it is not a province, or there is no request context. */
export async function readRegistrationProvince(): Promise<TrProvince | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(REGISTRATION_PROVINCE_COOKIE)?.value;
    return raw ? toTenantProvince(decodeURIComponent(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Single use (İNCELEME-12 Ö-1, TASK-MUM74FUB1DRCM): called by `createUser` right
 * after the value is read. Left in place, a province parked for a sign-up that was
 * abandoned at the consent screen landed on the next registration in the same
 * browser within 15 minutes.
 */
export async function clearRegistrationProvinceCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(REGISTRATION_PROVINCE_COOKIE);
  } catch {
    // No request context: nothing to clear.
  }
}
