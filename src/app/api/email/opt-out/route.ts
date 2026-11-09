import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { readCapped, ReportLimiter } from '@/lib/csp-report';
import { invitationMailBaseUrl } from '@/lib/email/invitation-mail-policy';
import { verifyOptOutToken } from '@/lib/email/opt-out';
import { recordOptOut } from '@/lib/email/opt-out-store';
import { emailOptOutSecret } from '@/lib/env';
import { clientIpFrom, ipBucket } from '@/lib/leads/public-lead';
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
 *
 * The token is checked first, before the body is read, so a request without a
 * valid one costs one HMAC and spends none of the limit below: forged tokens
 * cannot use up the budget of real unsubscribes. A valid token then faces the
 * csp-report limits (20 a minute, 300 per process), because replaying one opens
 * a database transaction each time.
 *
 * The 20 a minute is per client, and the client depends on the caller. One-click
 * POSTs come from the mail provider's few addresses for every recipient, so an
 * address limit would refuse real unsubscribes (NG-104 Ö-1): they are counted
 * per recipient token instead. The confirmation form comes from one browser, so
 * it stays per address (IPv6 by /64). The 300 per process still applies to both.
 */

/** `List-Unsubscribe=One-Click` or `confirm=1&locale=tr`; nothing near this long. */
const MAX_BODY_BYTES = 1024;
const limiter = new ReportLimiter();

function localeFrom(value: string | null | undefined): 'tr' | 'en' {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'tr';
}

function pageUrl(req: NextRequest, locale: string, query: string): URL {
  return new URL(`/${locale}/email-opt-out?${query}`, invitationMailBaseUrl() ?? req.nextUrl.origin);
}

function invalidRequest(): NextResponse {
  return NextResponse.json({ error: 'invalid_request', code: 'INVALID_OPT_OUT' }, { status: 400 });
}

function bodyTooLarge(): NextResponse {
  return NextResponse.json({ error: 'payload_too_large', code: 'OPT_OUT_BODY_TOO_LARGE' }, { status: 413 });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') ?? '';
  const locale = localeFrom(req.headers.get('accept-language'));
  return NextResponse.redirect(pageUrl(req, locale, `t=${encodeURIComponent(token)}`), 303);
}

export async function POST(req: NextRequest) {
  try {
    const secret = emailOptOutSecret();
    if (!secret) throw new Error('EMAIL_OPTOUT_SECRET and AUTH_SECRET are not set');
    const payload = verifyOptOutToken(req.nextUrl.searchParams.get('t'), secret);
    if (!payload) return invalidRequest();

    const declared = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bodyTooLarge();

    const text = await readCapped(req.body, MAX_BODY_BYTES);
    if (text === null) return bodyTooLarge();
    const body = new URLSearchParams(text);
    const oneClick = body.get('List-Unsubscribe') === 'One-Click';
    const confirmed = body.get('confirm') === '1';
    if (!oneClick && !confirmed) return invalidRequest();

    const ip = clientIpFrom(req.headers);
    const client = oneClick ? `token:${payload.hash}` : ip ? ipBucket(ip) : null;
    if (!limiter.take(client)) {
      return NextResponse.json({ error: 'too_many_requests', code: 'OPT_OUT_RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60' } });
    }

    await recordOptOut(payload);
    if (oneClick) return NextResponse.json({ ok: true });
    return NextResponse.redirect(pageUrl(req, localeFrom(body.get('locale')), `status=done&k=${payload.kind}`), 303);
  } catch (error) {
    logger.error('email opt-out failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'server' });
  }
}
