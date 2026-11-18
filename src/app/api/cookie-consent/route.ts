import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import { recordCookieConsent } from '@/lib/cookie-consent-record';
import { ReportLimiter } from '@/lib/csp-report';
import { clientIpFrom, ipBucket } from '@/lib/leads/public-lead';
import { readCappedBytes } from '@/lib/read-capped';

/**
 * NG-9 — POST /api/cookie-consent. Public, no session: the cookie banner records a saved
 * choice here (src/lib/cookie-consent.ts saveConsent). 201 `{ok:true}` · 400 · 413 · 429 · 500.
 * Reads the JSON body only; no IP, header or cookie is stored.
 *
 * The per-visitor count in recordCookieConsent does not stop a client that mints a new
 * visitor id per request, so this endpoint has its own limits, the csp-report pattern
 * (İnceleme B-1): an in-process window per client address and one for the whole process,
 * and a body cap read as bytes arrive. The address is counted in memory only.
 */

/** A valid save is about 200 bytes; anything past 1 KB is not a consent. */
const MAX_BODY_BYTES = 1024;
const WINDOW_MS = 60_000;
/** Saves per client address per minute. Shared offices sit behind one address. */
const PER_CLIENT_LIMIT = 20;
/** Saves per process per minute, whatever the addresses. */
const PROCESS_LIMIT = 300;

const limiter = new ReportLimiter(PER_CLIENT_LIMIT, PROCESS_LIMIT, WINDOW_MS);

/** Malformed JSON is `null`, which recordCookieConsent answers with 400, as before. */
function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  const ip = clientIpFrom(req.headers);
  if (!limiter.take(ip ? ipBucket(ip) : null)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const bytes = await readCappedBytes(req.body, MAX_BODY_BYTES);
  if (bytes === null) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const body: unknown = parseJson(bytes);
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
