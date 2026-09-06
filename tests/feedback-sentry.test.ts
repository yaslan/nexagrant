import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  parseSentryDsn,
  sentryEnvelopeUrl,
  buildEnvelope,
  captureToSentry,
} from '@/lib/observability/sentry';

describe('sentry DSN parsing', () => {
  it('parses a standard DSN into key, host and project id', () => {
    const dsn = parseSentryDsn('https://abc123def@o4507.ingest.sentry.io/4509876');
    expect(dsn).toEqual({
      publicKey: 'abc123def',
      host: 'o4507.ingest.sentry.io',
      projectId: '4509876',
      protocol: 'https',
      path: '',
    });
  });

  it('keeps a path prefix for a self-hosted Sentry', () => {
    const dsn = parseSentryDsn('https://key@sentry.example.org/sub/path/42');
    expect(dsn?.projectId).toBe('42');
    expect(dsn?.path).toBe('/sub/path');
    expect(sentryEnvelopeUrl(dsn!)).toBe('https://sentry.example.org/sub/path/api/42/envelope/');
  });

  it('treats blank, missing and malformed DSNs as unset rather than throwing', () => {
    expect(parseSentryDsn(undefined)).toBeNull();
    expect(parseSentryDsn('')).toBeNull();
    expect(parseSentryDsn('   ')).toBeNull();
    expect(parseSentryDsn('not-a-url')).toBeNull();
    expect(parseSentryDsn('https://no-key-host.example.com/')).toBeNull();
  });
});

describe('sentry envelope format', () => {
  const sentAt = new Date('2026-09-06T10:00:00.000Z');

  it('emits header, item header and payload as three newline-delimited lines', () => {
    const raw = buildEnvelope(
      { message: '[P0] Veri kaybı', tags: { priority: 'P0' } },
      'aaaabbbbccccddddeeeeffff00001111',
      sentAt
    ).toString('utf-8');

    const lines = raw.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);

    expect(JSON.parse(lines[0]!)).toEqual({
      event_id: 'aaaabbbbccccddddeeeeffff00001111',
      sent_at: '2026-09-06T10:00:00.000Z',
    });
    expect(JSON.parse(lines[1]!).type).toBe('event');

    const event = JSON.parse(lines[2]!);
    expect(event.event_id).toBe('aaaabbbbccccddddeeeeffff00001111');
    expect(event.message.formatted).toBe('[P0] Veri kaybı');
    expect(event.tags.priority).toBe('P0');
  });

  it('drops undefined tags rather than sending nulls', () => {
    const raw = buildEnvelope(
      { message: 'x', tags: { kept: 'yes', dropped: undefined } },
      'id1',
      sentAt
    ).toString('utf-8');
    const event = JSON.parse(raw.split('\n')[2]!);
    expect(event.tags).toEqual({ kept: 'yes' });
  });

  it('appends a length-prefixed attachment item for a screenshot', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a, 0x00, 0x0a, 0xff]);
    const envelope = buildEnvelope(
      {
        message: 'with shot',
        attachment: { filename: 'shot.png', contentType: 'image/png', data: png },
      },
      'id2',
      sentAt
    );

    const text = envelope.toString('binary');
    const headerIndex = text.indexOf('{"type":"attachment"');
    expect(headerIndex).toBeGreaterThan(0);

    const headerEnd = text.indexOf('\n', headerIndex);
    const header = JSON.parse(text.slice(headerIndex, headerEnd));
    expect(header).toMatchObject({
      type: 'attachment',
      length: png.length,
      filename: 'shot.png',
      content_type: 'image/png',
    });

    // The declared length must match the bytes that follow, or Sentry rejects
    // the whole envelope — including the event.
    const payload = envelope.subarray(headerEnd + 1, headerEnd + 1 + png.length);
    expect(Buffer.compare(payload, png)).toBe(0);
  });
});

describe('captureToSentry transport', () => {
  const servers: http.Server[] = [];

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  });

  async function startCaptureServer(
    handler: (req: http.IncomingMessage, body: Buffer, res: http.ServerResponse) => void
  ): Promise<string> {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => handler(req, Buffer.concat(chunks), res));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return `http://testkey@127.0.0.1:${port}/7`;
  }

  it('skips silently when no DSN is configured', async () => {
    const result = await captureToSentry({ message: 'nothing to see' }, { dsnOverride: '' });
    expect(result).toEqual({ status: 'skipped', reason: 'no_dsn' });
  });

  it('posts a valid envelope to the project endpoint and returns the event id', async () => {
    let captured: { url?: string; auth?: string; contentType?: string; body?: string } = {};

    const dsn = await startCaptureServer((req, body, res) => {
      captured = {
        url: req.url,
        auth: req.headers['x-sentry-auth'] as string,
        contentType: req.headers['content-type'] as string,
        body: body.toString('utf-8'),
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"id":"server-side-id"}');
    });

    const result = await captureToSentry(
      {
        message: '[P0] Kaydettiğim teklif kayboldu',
        level: 'fatal',
        fingerprint: ['beta-feedback', 'BUG', 'P0'],
        tags: { source: 'beta-feedback', priority: 'P0' },
        extra: { feedbackId: 'fb_test_1' },
        user: { id: 'user_1', email: 'partner@example.org' },
      },
      { dsnOverride: dsn }
    );

    expect(result.status).toBe('sent');
    expect(result.eventId).toMatch(/^[0-9a-f]{32}$/);

    expect(captured.url).toBe('/api/7/envelope/');
    expect(captured.contentType).toBe('application/x-sentry-envelope');
    expect(captured.auth).toContain('sentry_version=7');
    expect(captured.auth).toContain('sentry_key=testkey');

    const lines = captured.body!.split('\n').filter(Boolean);
    const event = JSON.parse(lines[2]!);
    expect(event.event_id).toBe(result.eventId);
    expect(event.level).toBe('fatal');
    expect(event.fingerprint).toEqual(['beta-feedback', 'BUG', 'P0']);
    expect(event.extra.feedbackId).toBe('fb_test_1');
    expect(event.user.email).toBe('partner@example.org');
  });

  it('reports a non-2xx as failed with the status only — never the response body', async () => {
    const dsn = await startCaptureServer((_req, _body, res) => {
      res.writeHead(403, { 'content-type': 'application/json' });
      // A real Sentry 403 echoes the DSN key back; it must not reach the caller.
      res.end('{"detail":"invalid key: testkey"}');
    });

    const result = await captureToSentry({ message: 'rejected' }, { dsnOverride: dsn });
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('sentry_http_403');
    expect(JSON.stringify(result)).not.toContain('testkey');
  });

  it('reports a timeout as failed instead of hanging the caller', async () => {
    const dsn = await startCaptureServer(() => {
      /* never responds */
    });

    const result = await captureToSentry(
      { message: 'slow' },
      { dsnOverride: dsn, timeoutMs: 120 }
    );
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('transport_');
  });
});
