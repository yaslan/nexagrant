/**
 * NG-9 (FE-1.5, İnceleme B-1) — POST /api/cookie-consent is public and sessionless.
 * Its per-visitor count does not stop a client that mints a fresh visitor id per
 * request, so the endpoint needs its own limits: a per-client-address window and a
 * process-wide window (the csp-report pattern), plus a body cap read as bytes arrive.
 * No database: the record write is mocked; each test loads a fresh route module so
 * the in-process windows start empty.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const recordCookieConsent = vi.fn(async () => ({ kind: 'created' as const }));
vi.mock('@/lib/cookie-consent-record', () => ({ recordCookieConsent }));

const VALID = {
  choice: 'accept_all',
  analytics: true,
  marketing: true,
  policyVersion: 'v1',
  locale: 'tr',
};

function consentRequest(body: string, ip?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (ip) headers['x-forwarded-for'] = ip;
  return new NextRequest('http://localhost/api/cookie-consent', { method: 'POST', body, headers });
}

/** A valid save from a visitor who has never been seen before — a fresh UUID per call. */
const freshVisitor = (ip?: string) => consentRequest(JSON.stringify({ ...VALID, visitorId: crypto.randomUUID() }), ip);

async function loadPost() {
  vi.resetModules();
  const route = await import('@/app/api/cookie-consent/route');
  return route.POST;
}

describe('POST /api/cookie-consent — endpoint limits (NG-9 B-1)', () => {
  const originalHops = process.env.TRUSTED_PROXY_HOPS;

  beforeEach(() => {
    recordCookieConsent.mockClear();
    process.env.TRUSTED_PROXY_HOPS = '1';
  });

  afterEach(() => {
    if (originalHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = originalHops;
  });

  it('answers 429 once one client address exceeds its window, even with a fresh visitor id each time', async () => {
    const POST = await loadPost();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await POST(freshVisitor('203.0.113.7'))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
    // The 21st request never reaches the record write.
    expect(recordCookieConsent).toHaveBeenCalledTimes(20);
  });

  it('answers 429 once the whole process exceeds its window, whatever the client addresses', async () => {
    const POST = await loadPost();
    let last = 0;
    let count = 0;
    while (last !== 429 && count < 1000) {
      count += 1;
      // A different address each time: rotating addresses must not lift the process limit.
      last = (await POST(freshVisitor(`198.51.100.${(count % 250) + 1}`))).status;
    }
    expect(last).toBe(429);
    expect(count).toBeLessThanOrEqual(301);
  });

  it('NG-367 Ö-1: one address flooding past every limit cannot block another visitor', async () => {
    const POST = await loadPost();
    const flood: number[] = [];
    for (let i = 0; i < 400; i++) flood.push((await POST(freshVisitor('203.0.113.66'))).status);
    expect(flood.filter((s) => s === 201)).toHaveLength(20);
    expect(flood.slice(20).every((s) => s === 429)).toBe(true);
    // Before NG-367 the 380 refused requests still filled the 300-per-process window.
    const other = await POST(freshVisitor('198.51.100.9'));
    expect(other.status).toBe(201);
  });

  it('answers 413 for a body over about 1 KB and never writes it', async () => {
    const POST = await loadPost();
    const padded = JSON.stringify({ ...VALID, visitorId: crypto.randomUUID(), pad: 'x'.repeat(4096) });
    const res = await POST(consentRequest(padded));
    expect(res.status).toBe(413);
    expect(recordCookieConsent).not.toHaveBeenCalled();
  });

  it('still accepts an ordinary valid save', async () => {
    const POST = await loadPost();
    const res = await POST(freshVisitor());
    expect(res.status).toBe(201);
    expect(recordCookieConsent).toHaveBeenCalledTimes(1);
  });
});
