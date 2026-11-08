import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { invitationMailBaseUrl } from '@/lib/email/invitation-mail-policy';
import { verifyOptOutToken } from '@/lib/email/opt-out';
import { recordOptOut } from '@/lib/email/opt-out-store';
import { authSecret } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * NG-42 — the address in `List-Unsubscribe` and in the body of a first message.
 *
 * GET never changes anything: mail scanners and link previews follow every
 * link, so a GET that unsubscribed would opt recipients out without them ever
 * reading the mail. It only sends the browser to the confirmation page.
 *
 * POST does the work, for the two callers that can make one: the mail client's
 * one-click button (RFC 8058, body `List-Unsubscribe=One-Click`, no cookies) and
 * the confirmation page's form. No session and no CSRF token, because the signed
 * token is the authority and holding it only lets you opt that address out.
 */

function localeFrom(value: string | null | undefined): 'tr' | 'en' {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'tr';
}

function pageUrl(req: NextRequest, locale: string, query: string): URL {
  return new URL(`/${locale}/email-opt-out?${query}`, invitationMailBaseUrl() ?? req.nextUrl.origin);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') ?? '';
  const locale = localeFrom(req.headers.get('accept-language'));
  return NextResponse.redirect(pageUrl(req, locale, `t=${encodeURIComponent(token)}`), 303);
}

export async function POST(req: NextRequest) {
  try {
    const secret = authSecret();
    if (!secret) throw new Error('AUTH_SECRET is not set');
    const body = new URLSearchParams(await req.text());
    const oneClick = body.get('List-Unsubscribe') === 'One-Click';
    const confirmed = body.get('confirm') === '1';
    const payload = verifyOptOutToken(req.nextUrl.searchParams.get('t'), secret);
    if (!payload || (!oneClick && !confirmed)) {
      return NextResponse.json({ error: 'invalid_request', code: 'INVALID_OPT_OUT' }, { status: 400 });
    }
    await recordOptOut(payload);
    if (oneClick) return NextResponse.json({ ok: true });
    return NextResponse.redirect(pageUrl(req, localeFrom(body.get('locale')), `status=done&k=${payload.kind}`), 303);
  } catch (error) {
    logger.error('email opt-out failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'server' });
  }
}
