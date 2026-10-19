import { NextResponse, type NextRequest } from 'next/server';

import {
  INVITATION_ACCEPT_COOKIE,
  encodeParkedInvitation,
  invitationAcceptCookieOptions,
  parseInvitationToken,
} from '@/lib/invitations/accept-cookie';
import { publicUrl } from '@/lib/public-url';

/**
 * The link in the invitation e-mail: `/<locale>/accept-invite?token=<raw>`
 * (src/app/api/invitations/route.ts). TASK-MUN2793A57Z9I, se-fb (d).
 *
 * Does one thing: moves the token out of the URL. It is parked in an httpOnly
 * cookie and the browser is sent on to `/<locale>/accept-invite/continue`,
 * which has no token in it — so the token is not left in the address bar, the
 * history, a Referer sent by the next page, or a screenshot. Nothing is
 * decided and nothing is written here: a mail scanner that "clicks" every link
 * gets a cookie it throws away.
 *
 * Not a page (a server component cannot set a cookie). Nothing here logs the
 * URL. `Referrer-Policy: no-referrer` and `no-store` on the redirect itself as
 * well as on the pages under it (next.config.ts).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: requested } = await params;
  const locale = requested === 'en' ? 'en' : 'tr';
  const raw = req.nextUrl.searchParams.get('token');
  const token = parseInvitationToken(raw);

  const res = NextResponse.redirect(new URL(`/${locale}/accept-invite/continue`, publicUrl(req)), 303);
  if (token) {
    res.cookies.set(INVITATION_ACCEPT_COOKIE, encodeParkedInvitation({ token, locale }), invitationAcceptCookieOptions());
  } else if (raw !== null) {
    // A link with a broken token must not show an invitation parked earlier.
    res.cookies.delete(INVITATION_ACCEPT_COOKIE);
  }
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
