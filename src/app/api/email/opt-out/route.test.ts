import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * NG-42 — what the anonymous opt-out POST does before it reaches the database.
 * The record itself runs for real in tests/email-opt-out.live.test.ts.
 */

const SECRET = 'opt-out-secret-at-least-thirty-two-characters';
const SESSION_SECRET = 'session-secret-at-least-thirty-two-characters';

const recordOptOut = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/email/opt-out-store', () => ({ recordOptOut }));
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  authSecret: () => SESSION_SECRET,
  emailOptOutSecret: () => SECRET,
}));

const { emailOptOutHash, signOptOutToken } = await import('@/lib/email/opt-out');

const payload = { kind: 'unsubscribe', hash: emailOptOutHash('a@example.invalid'), source: 'invitation', tenantId: 't1' } as const;
const valid = signOptOutToken(payload, SECRET);

/** A distinct recipient (and so a distinct token) per index. */
function tokenFor(i: number): string {
  return signOptOutToken({ ...payload, hash: emailOptOutHash(`r${i}@example.invalid`) }, SECRET);
}

type Handler = typeof import('./route').POST;
let POST: Handler;

function request(token: string, body: BodyInit = 'List-Unsubscribe=One-Click', ip = '198.51.100.7', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/email/opt-out?t=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip, ...headers },
    body,
    duplex: 'half',
  } as ConstructorParameters<typeof NextRequest>[1]);
}

beforeEach(async () => {
  recordOptOut.mockClear();
  vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
  // The limiter lives in the module: a fresh import is a fresh window.
  vi.resetModules();
  ({ POST } = await import('./route'));
});

describe('POST /api/email/opt-out', () => {
  it('records a valid one-click', async () => {
    const res = await POST(request(valid));
    expect(res.status).toBe(200);
    expect(recordOptOut).toHaveBeenCalledTimes(1);
  });

  it('checks the token before it reads the body', async () => {
    const req = request('not-a-token');
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(req.bodyUsed).toBe(false);
    expect(recordOptOut).not.toHaveBeenCalled();
  });

  it('refuses a token signed with the session key', async () => {
    const req = request(signOptOutToken(payload, SESSION_SECRET));
    expect((await POST(req)).status).toBe(400);
    expect(req.bodyUsed).toBe(false);
    expect(recordOptOut).not.toHaveBeenCalled();
  });

  it('refuses a declared body over the cap without reading it', async () => {
    const req = request(valid, 'List-Unsubscribe=One-Click', undefined, { 'content-length': '1025' });
    expect((await POST(req)).status).toBe(413);
    expect(req.bodyUsed).toBe(false);
    expect(recordOptOut).not.toHaveBeenCalled();
  });

  it('cuts off a body over the cap that declares no length', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(600));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    expect((await POST(request(valid, stream))).status).toBe(413);
    expect(sent).toBeLessThan(5);
    expect(recordOptOut).not.toHaveBeenCalled();
  });

  it('still accepts a body at the cap', async () => {
    const body = `List-Unsubscribe=One-Click&p=${'x'.repeat(1024 - 'List-Unsubscribe=One-Click&p='.length)}`;
    expect(body).toHaveLength(1024);
    expect((await POST(request(valid, body))).status).toBe(200);
  });

  it('stops one recipient token at 20 a minute, whatever address sends it', async () => {
    for (let i = 0; i < 20; i += 1) expect((await POST(request(valid))).status).toBe(200);
    expect((await POST(request(valid, undefined, '198.51.100.8'))).status).toBe(429);
    expect(recordOptOut).toHaveBeenCalledTimes(20);
    expect((await POST(request(tokenFor(999)))).status).toBe(200);
  });

  it('lets a mail provider send 21 one-clicks for 21 recipients from one address', async () => {
    // The provider posts every one-click from its own few addresses: an IP
    // limit of 20 would fail the 21st real unsubscribe (NG-104 Ö-1).
    for (let i = 0; i < 21; i += 1) {
      expect((await POST(request(tokenFor(i), undefined, '192.0.2.10'))).status).toBe(200);
    }
    expect(recordOptOut).toHaveBeenCalledTimes(21);
  });

  it('keeps the process ceiling at 300 a minute across many recipients and addresses', async () => {
    for (let i = 0; i < 300; i += 1) {
      expect((await POST(request(tokenFor(i), undefined, `10.0.${Math.floor(i / 250)}.${i % 250}`))).status).toBe(200);
    }
    expect((await POST(request(tokenFor(300), undefined, '203.0.113.200'))).status).toBe(429);
    expect(recordOptOut).toHaveBeenCalledTimes(300);
  });

  it('keeps the 20 a minute per address limit on the confirmation form', async () => {
    const form = 'confirm=1&locale=tr';
    for (let i = 0; i < 20; i += 1) expect((await POST(request(tokenFor(i), form))).status).toBe(303);
    expect((await POST(request(tokenFor(20), form))).status).toBe(429);
    expect((await POST(request(tokenFor(21), form, '198.51.100.8'))).status).toBe(303);
  });

  it('does not let forged tokens spend the limit of real unsubscribes', async () => {
    for (let i = 0; i < 25; i += 1) expect((await POST(request('forged.token'))).status).toBe(400);
    expect((await POST(request(valid))).status).toBe(200);
  });
});
