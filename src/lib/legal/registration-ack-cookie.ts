/**
 * Carrying the registration acknowledgement across an OAuth round trip.
 *
 * TASK-MTSWLANXSU0IG (A3). The credentials form can hand the acknowledgement
 * straight to `authorize` alongside the e-mail, so that path verifies it before
 * an account exists. Google and Microsoft cannot: the browser leaves for the
 * provider and comes back into NextAuth's own callback route, where the form
 * and everything the person ticked on it are gone.
 *
 * So the tick is parked in a short-lived, httpOnly cookie that only our own
 * server action sets, and only after a real click on a ticked form. It is not
 * as strong as the credentials path — a cookie proves the box was ticked in
 * this browser, not that a particular human read the text — but it is the
 * difference between recording something true and recording nothing at all,
 * and it is set server-side so a page script cannot forge it.
 *
 * Refusing a registration without it: since ADR-0006 (TASK-MUM676F010E9G)
 * the `signIn` callback does that, BEFORE the adapter creates anything — see
 * decideOAuthSignIn in src/lib/oauth-registration.ts. The SystemAlert in
 * `events.createUser` stays as the net for a record that still goes missing.
 *
 * An invite-code registration does not use this cookie: its acknowledgement
 * (which must name the agency addendum) travels inside the signed invite
 * cookie, src/lib/agency/registration-invite-cookie.ts.
 */
import { cookies } from 'next/headers';

import { registrationAcknowledgementToken } from './consent-documents';

/**
 * Not prefixed `__Host-`: the value is worthless to an attacker (it is a public
 * version string) and the prefix would need `secure`, which breaks plain-http
 * local development and the e2e run.
 */
export const REGISTRATION_ACK_COOKIE = 'fabrika_registration_ack';

/**
 * Long enough for a slow consent screen at the provider, short enough that a
 * shared machine does not carry a stale tick into somebody else's sign-up.
 */
const MAX_AGE_SECONDS = 15 * 60;

/** Called from the server action that starts the OAuth redirect. */
export async function setRegistrationAcknowledgementCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(REGISTRATION_ACK_COOKIE, registrationAcknowledgementToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Reads the parked acknowledgement, if the versions it names are still current.
 *
 * Returns false rather than throwing when there is no request context to read —
 * this is called from a NextAuth event, and an account bootstrap must not fail
 * because a cookie jar was unavailable.
 */
export async function readRegistrationAcknowledgement(): Promise<boolean> {
  try {
    const jar = await cookies();
    const value = jar.get(REGISTRATION_ACK_COOKIE)?.value;
    return value === registrationAcknowledgementToken();
  } catch {
    return false;
  }
}

/** Single use: cleared once the registration has recorded it. Best effort. */
export async function clearRegistrationAcknowledgementCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(REGISTRATION_ACK_COOKIE);
  } catch {
    // No request context: nothing to clear.
  }
}
