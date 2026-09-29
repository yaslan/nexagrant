/**
 * TASK-MULQMKP4YOM04 — optional Sentry forwarding of error-level SystemAlert rows.
 *
 * Asserts the privacy-relevant contract: off without a DSN, only a *new*
 * error row is forwarded, and the envelope carries no user/request/IP and no
 * e-mail address. Delivery runs against a real local HTTP server, not a mock
 * of fetch, so the wire format is what Sentry would receive.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
  buildEnvelope,
  buildSentryEvent,
  captureAlertToSentry,
  parseSentryDsn,
  sentryEnvelopeUrl,
} from '@/lib/observability/sentry';
import { recordAlert, type AlertDbClient } from '@/lib/observability/system-alert';

interface Received {
  url: string;
  auth: string;
  body: string;
}

async function captureServer(): Promise<{ server: Server; port: number; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ url: req.url ?? '', auth: String(req.headers['x-sentry-auth'] ?? ''), body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, received };
}

function fakeDb(): AlertDbClient {
  return { systemAlert: { create: async () => ({ id: 'alert_1' }) } };
}

let open: Server | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
  vi.unstubAllEnvs();
});

describe('parseSentryDsn', () => {
  it('parses a DSN and builds the envelope URL', () => {
    const dsn = parseSentryDsn('https://abc123@o1.ingest.de.sentry.io/4507');
    expect(dsn).not.toBeNull();
    expect(sentryEnvelopeUrl(dsn!)).toBe('https://o1.ingest.de.sentry.io/api/4507/envelope/');
  });

  it.each([undefined, '', '   ', 'not a url', 'https://host/42', 'https://key@host/'])(
    'treats %j as off',
    (value) => expect(parseSentryDsn(value)).toBeNull()
  );
});

describe('buildSentryEvent', () => {
  it('sends only the fields it names — no user, request, server_name, IP', () => {
    const event = buildSentryEvent(
      { level: 'error', source: 'k2', message: 'failed for ayse@example.org', meta: { note: 'x b@c.io y', n: 3 } },
      'e1',
      new Date('2026-09-29T00:00:00Z')
    );
    expect(Object.keys(event).sort()).toEqual(
      ['environment', 'event_id', 'extra', 'fingerprint', 'level', 'logger', 'message', 'platform', 'tags', 'timestamp'].sort()
    );
    const wire = JSON.stringify(event);
    expect(wire).not.toContain('@example.org');
    expect(wire).not.toContain('b@c.io');
    expect(event.message.formatted).toBe('failed for [email]');
    expect(event.extra).toEqual({ note: 'x [email] y', n: 3 });
  });

  it('frames a valid envelope (header, item header with byte length, payload)', () => {
    const [, itemLine = '', payload = ''] = buildEnvelope(
      { level: 'error', source: 's', message: 'ığüşöç' },
      'e1',
      new Date()
    ).split('\n');
    const item = JSON.parse(itemLine);
    expect(item.type).toBe('event');
    expect(item.length).toBe(Buffer.byteLength(payload, 'utf-8'));
  });
});

describe('captureAlertToSentry', () => {
  it('is skipped without a DSN and opens no connection', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.stubEnv('SENTRY_DSN', '');
    expect(await captureAlertToSentry({ level: 'error', source: 's', message: 'm' })).toEqual({
      status: 'skipped',
      reason: 'no_dsn',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('delivers to the envelope endpoint with the public key only', async () => {
    const cap = await captureServer();
    open = cap.server;
    const result = await captureAlertToSentry(
      { level: 'error', source: 'test', message: 'boom' },
      { dsnOverride: `http://pubkey@127.0.0.1:${cap.port}/7` }
    );
    expect(result.status).toBe('sent');
    expect(cap.received).toHaveLength(1);
    expect(cap.received[0]?.url).toBe('/api/7/envelope/');
    expect(cap.received[0]?.auth).toContain('sentry_key=pubkey');
  });

  it('reports a failure instead of throwing when the endpoint is down', async () => {
    const result = await captureAlertToSentry(
      { level: 'error', source: 's', message: 'm' },
      { dsnOverride: 'http://k@127.0.0.1:1/1', timeoutMs: 500 }
    );
    expect(result.status).toBe('failed');
  });
});

describe('recordAlert → Sentry', () => {
  it('forwards a new error row, carrying the alert id, with meta already sanitized', async () => {
    const cap = await captureServer();
    open = cap.server;
    vi.stubEnv('SENTRY_DSN', `http://pubkey@127.0.0.1:${cap.port}/7`);

    const result = await recordAlert(
      { level: 'error', source: 'k2', message: 'dump parse failed', meta: { userEmail: 'a@b.co', rows: 0 } },
      { client: fakeDb() }
    );
    expect(result.status).toBe('recorded');
    expect(cap.received).toHaveLength(1);
    const body = cap.received[0]?.body ?? '';
    const event = JSON.parse(body.split('\n')[2] ?? '{}');
    expect(event.tags).toEqual({ source: 'k2', alert_id: 'alert_1' });
    expect(event.extra).toEqual({ rows: 0, redactedKeys: ['userEmail'] });
    expect(body).not.toContain('a@b.co');
  });

  it('does not forward warn/info rows', async () => {
    const cap = await captureServer();
    open = cap.server;
    vi.stubEnv('SENTRY_DSN', `http://pubkey@127.0.0.1:${cap.port}/7`);
    await recordAlert({ level: 'warn', source: 's', message: 'm' }, { client: fakeDb() });
    await recordAlert({ level: 'info', source: 's', message: 'm' }, { client: fakeDb() });
    expect(cap.received).toHaveLength(0);
  });
});
