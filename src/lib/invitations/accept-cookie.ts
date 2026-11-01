/**
 * Carrying an invitation link's token from the e-mail to the accept screen and
 * across the Google round trip (TASK-MUN2793A57Z9I).
 *
 * The e-mail link is `/<locale>/accept-invite?token=<raw>`. The GET handler at
 * that path (src/app/[locale]/(public)/accept-invite/route.ts) moves the token into this
 * cookie and redirects to a URL without it, so the token does not stay in the
 * address bar, the history, a Referer header or a screenshot (İNCELEME-28,
 * se-fb (d)). Everything after that — the accept screen, the signIn callback,
 * the adapter's `createUser` and the accept action — reads it from here.
 *
 * Not signed, unlike the agency invite cookie: the value is itself the bearer
 * secret, and it is checked against `Invitation.tokenHash` on every read. A
 * planted cookie can only ever name an invitation the planter holds a link to,
 * and that invitation is accepted only by an account whose e-mail is the
 * invited one (src/lib/invitations/accept.ts), after that person clicks.
 *
 * httpOnly + SameSite=Lax: Google's redirect back to `/api/auth/callback/google`
 * is a top-level GET, which Lax sends. 30 minutes is a slow consent screen at
 * the provider plus reading the page; after that the person clicks the link in
 * the e-mail again, which stays valid for the invitation's 7 days.
 */
import { cookies } from 'next/headers';

export const INVITATION_ACCEPT_COOKIE = 'fabrika_invitation_accept';
export const INVITATION_ACCEPT_COOKIE_MAX_AGE_SECONDS = 30 * 60;

/** What `generateSecretToken` produces: 32 bytes as 64 lowercase hex characters. */
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

export type InvitationLocale = 'tr' | 'en';

export interface ParkedInvitation {
  token: string;
  /** The language of the link that was opened — where a refusal sends the person back to. */
  locale: InvitationLocale;
}

/** Pure: the token if it has the shape of one, else null. Nothing else is accepted. */
export function parseInvitationToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim().toLowerCase();
  return TOKEN_SHAPE.test(token) ? token : null;
}

/** Pure: `<locale>.<token>`, the cookie value. */
export function encodeParkedInvitation(parked: ParkedInvitation): string {
  return `${parked.locale}.${parked.token}`;
}

/** Pure: the inverse of {@link encodeParkedInvitation}; anything else is null. */
export function decodeParkedInvitation(value: string | undefined): ParkedInvitation | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  const locale = value.slice(0, dot);
  if (locale !== 'tr' && locale !== 'en') return null;
  const token = parseInvitationToken(value.slice(dot + 1));
  return token ? { token, locale } : null;
}

/** The options the GET handler sets the cookie with (it writes on its own response). */
export function invitationAcceptCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INVITATION_ACCEPT_COOKIE_MAX_AGE_SECONDS,
  };
}

/** The parked invitation, or null when there is none or it is malformed. */
export async function readParkedInvitation(): Promise<ParkedInvitation | null> {
  try {
    const jar = await cookies();
    return decodeParkedInvitation(jar.get(INVITATION_ACCEPT_COOKIE)?.value);
  } catch {
    // No request context (a job, a script): no invitation in flight.
    return null;
  }
}

/** Spent once the invitation is accepted, and on every other OAuth start. Best effort. */
export async function clearInvitationAcceptCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(INVITATION_ACCEPT_COOKIE);
  } catch {
    // No request context, or a server component (read-only jar): nothing to clear.
  }
}
