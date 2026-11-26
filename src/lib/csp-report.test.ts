import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';
import {
  GLOBAL_LIMIT,
  MAX_REPORT_BYTES,
  PER_CLIENT_LIMIT,
  ReportLimiter,
  WINDOW_MS,
  handleCspReport,
  parseCspReports,
} from './csp-report';

const legacy = {
  'csp-report': {
    'document-uri': 'https://fonbridge.example/tr/accept-invite?token=SECRET-TOKEN',
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://evil.example/x.js?session=abc',
    'script-sample': 'alert(document.cookie)',
    disposition: 'report',
  },
};

const reportingApi = [
  {
    type: 'csp-violation',
    url: 'https://fonbridge.example/en/main/dashboard?q=1',
    body: {
      documentURL: 'https://fonbridge.example/en/main/dashboard?q=1',
      effectiveDirective: 'script-src-elem',
      blockedURL: 'inline',
      disposition: 'enforce',
      sample: 'console.log(1)',
    },
  },
  { type: 'deprecation', body: { id: 'x' } },
];

function post(body: string, type = 'application/csp-report', extra: Record<string, string> = {}) {
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': type, ...extra },
    body,
  });
}

afterEach(() => vi.restoreAllMocks());

describe('parseCspReports', () => {
  it('legacy report-uri body: directive, blocked origin, page path only — no query, no sample', () => {
    expect(parseCspReports(legacy)).toEqual([
      { directive: 'script-src-elem', blocked: 'https://evil.example', page: '/tr/accept-invite', disposition: 'report' },
    ]);
  });

  it('Reporting API array: csp-violation entries only', () => {
    expect(parseCspReports(reportingApi)).toEqual([
      { directive: 'script-src-elem', blocked: 'inline', page: '/en/main/dashboard', disposition: 'enforce' },
    ]);
  });

  it('anything else yields nothing', () => {
    for (const junk of [null, 1, 'x', {}, { 'csp-report': 'x' }, [1, 2], [{ type: 'csp-violation' }]]) {
      expect(parseCspReports(junk)).toEqual([]);
    }
  });

  it('control characters and overlong values cannot reach the log line', () => {
    const [v] = parseCspReports({
      'csp-report': { 'effective-directive': `script-src\n[ERROR] forged ${'a'.repeat(500)}`, 'document-uri': 'not a url' },
    });
    expect(v!.directive).not.toMatch(/[\n\r]/);
    expect(v!.directive.length).toBeLessThanOrEqual(200);
    expect(v!.page).toBe('');
  });
});

describe('ReportLimiter', () => {
  it('per client: the (limit+1)th request in a window is refused, the next window is fresh', () => {
    const l = new ReportLimiter(3, 100, 1000);
    expect([1, 2, 3, 4].map(() => l.take('a', 0))).toEqual([true, true, true, false]);
    expect(l.take('b', 10)).toBe(true);
    expect(l.take('a', 1000)).toBe(true);
  });

  it('global: rotating clients cannot lift the total', () => {
    const l = new ReportLimiter(100, 5, 1000);
    const seen = Array.from({ length: 7 }, (_, i) => l.take(`c${i}`, 0));
    expect(seen).toEqual([true, true, true, true, true, false, false]);
    expect(l.take(null, 1)).toBe(false);
  });

  it('NG-367 Ö-1: a client over its own limit does not use up the global window', () => {
    const l = new ReportLimiter(3, 10, 1000);
    // One client hammers far past both limits.
    const flood = Array.from({ length: 50 }, () => l.take('flood', 0));
    expect(flood.filter(Boolean)).toHaveLength(3);
    // Only its 3 admitted requests count: 7 other clients still get in, the 8th does not.
    const others = Array.from({ length: 8 }, (_, i) => l.take(`other-${i}`, 1));
    expect(others).toEqual([true, true, true, true, true, true, true, false]);
  });

  it('NG-367 Ö-1: a request refused by the global window still counts against its client', () => {
    const l = new ReportLimiter(2, 1, 1000);
    expect(l.take('a', 0)).toBe(true);
    expect(l.take('a', 0)).toBe(false); // global full
    expect(l.take('a', 0)).toBe(false); // client full too: 3 > 2
    expect(l.take('a', 1000)).toBe(true); // next window
  });

  it('NG-367 B-1: once the global window is full, new clients are refused without growing the client map', () => {
    const l = new ReportLimiter(20, 300, 60_000);
    // 10,000 distinct clients (e.g. rotating IPv6 /64s) inside one window.
    const admitted = Array.from({ length: 10_000 }, (_, i) => l.take(`c${i}`, 0)).filter(Boolean);
    expect(admitted).toHaveLength(300);
    // Only clients that were admitted against the global window are tracked.
    expect(l.trackedClients).toBe(300);
    // A tracked client hammering past its own limit adds no entries either.
    for (let i = 0; i < 100; i++) l.take('c0', 1);
    expect(l.trackedClients).toBe(300);
    // The next window starts empty.
    expect(l.take('fresh', 60_000)).toBe(true);
    expect(l.trackedClients).toBe(1);
  });

  it('defaults are the documented ones', () => {
    expect([PER_CLIENT_LIMIT, GLOBAL_LIMIT, WINDOW_MS, MAX_REPORT_BYTES]).toEqual([20, 300, 60_000, 8192]);
  });
});

describe('handleCspReport', () => {
  it('logs one trimmed line per violation and answers 204 with no body', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const res = await handleCspReport(post(JSON.stringify(legacy)), new ReportLimiter());
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(warn.mock.calls[0]);
    expect(line).not.toContain('SECRET-TOKEN');
    expect(line).not.toContain('document.cookie');
    expect(line).not.toContain('session=abc');
  });

  it('accepts the Reporting API content type', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const res = await handleCspReport(post(JSON.stringify(reportingApi), 'application/reports+json'), new ReportLimiter());
    expect(res.status).toBe(204);
  });

  it('415 for a form or text post, nothing logged', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    for (const t of ['text/plain', 'application/x-www-form-urlencoded', '']) {
      expect((await handleCspReport(post(JSON.stringify(legacy), t), new ReportLimiter())).status).toBe(415);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('413 for a body over the cap — by declared length and by actual bytes', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const big = JSON.stringify({ 'csp-report': { 'effective-directive': 'x'.repeat(MAX_REPORT_BYTES) } });
    expect((await handleCspReport(post(big), new ReportLimiter())).status).toBe(413);
    // A lying Content-Length: the stream is still cut off at the cap.
    const lying = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report', 'content-length': '10' },
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(big));
          c.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    expect((await handleCspReport(lying, new ReportLimiter())).status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it('400 for malformed JSON, 429 once the limiter says no', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect((await handleCspReport(post('{nope'), new ReportLimiter())).status).toBe(400);
    const l = new ReportLimiter(1, 100, 60_000);
    const xff = { 'x-forwarded-for': '198.51.100.7' };
    expect((await handleCspReport(post(JSON.stringify(legacy), undefined, xff), l)).status).toBe(204);
    expect((await handleCspReport(post(JSON.stringify(legacy), undefined, xff), l)).status).toBe(429);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
