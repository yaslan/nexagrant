import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import { recordCookieConsent } from '@/lib/cookie-consent-record';

/**
 * NG-9 — POST /api/cookie-consent. Public, no session: the cookie banner records a saved
 * choice here (src/lib/cookie-consent.ts saveConsent). 201 `{ok:true}` · 400 · 429 · 500.
 * Reads the JSON body only; no IP, header or cookie is stored.
 */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  try {
    const result = await recordCookieConsent(body);
    if (result.kind === 'created') return NextResponse.json({ ok: true }, { status: 201 });
    if (result.kind === 'invalid') return NextResponse.json({ error: 'invalid' }, { status: 400 });
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  } catch (error) {
    logger.error('cookie consent record failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'server' });
  }
}
