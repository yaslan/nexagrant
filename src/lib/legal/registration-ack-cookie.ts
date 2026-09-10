/**
 * Carrying the registration acknowledgement across an OAuth round trip.
 *
 * TASK-MTSWLANXSU0IG (A3). The credentials form can hand the acknowledgement
 * straight to `authorize` alongside the e-mail, so that path verifies it before
 * an account exists. Google and Microsoft cannot: the browser leaves for the
 * provider and comes back into NextAuth's own callback route, and by the time
 * any of our own code runs, the adapter has already created the `User` row.
 *
 * So the tick is parked in a short-lived, httpOnly cookie that only our own
 * server action sets, and only after a real click on a ticked form. It is not
 * as strong as the credentials path — a cookie proves the box was ticked in
 * this browser, not that a particular human read the text — but it is the
 * difference between recording something true and recording nothing at all,
 * and it is set server-side so a page script cannot forge it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: refuse the sign-in when the cookie is
 * missing. The refusal would have to happen after the account already exists,
 * so it would mean deleting a freshly created user mid-flow — a way to lock
 * people out of registering, on a path that cannot be exercised end to end
 * against real Google/Microsoft credentials in this repo. The missing record is
 * raised as a SystemAlert instead (CLAUDE.md rule 6: alert, do not break the
 * flow), which leaves it visible and fixable rather than silent.
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
