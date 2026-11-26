import { logger } from '@/lib/logger';
import { clientIpFrom, ipBucket } from '@/lib/leads/public-lead';
import { readCappedBytes } from '@/lib/read-capped';

/**
 * CSP violation reports (İNCELEME-57 Ö-1, TASK-MUNRAZC9Q758W).
 *
 * The browser POSTs here whenever the page policy (src/lib/security-headers.ts)
 * blocks — or, under `CSP_MODE=report-only`, would block — something. The
 * endpoint has no session and no database: it logs one trimmed line per
 * violation and answers 204, so anyone may call it and gains nothing but a line
 * in our log. What keeps that line from being a log-flooding or data-leak tool:
 *
 * - The body is capped at {@link MAX_REPORT_BYTES}, read incrementally, so a large
 *   upload is cut off rather than buffered.
 * - Two in-process fixed windows: {@link PER_CLIENT_LIMIT} per client address
 *   (IPv6 by /64) and {@link GLOBAL_LIMIT} for the whole process, so rotating
 *   addresses cannot lift the volume. Over either: 429 and nothing logged. Per
 *   process on purpose — a lost report is harmless, so no shared store is needed.
 * - Only four fields are logged, each cut to {@link MAX_FIELD} characters: the
 *   directive, the blocked resource reduced to its origin (or a keyword such as
 *   `inline`), the page PATH (the query is dropped — the invitation link carries
 *   a token there) and the disposition. No IP, no user agent, no sample text.
 */

export const MAX_REPORT_BYTES = 8 * 1024;
export const PER_CLIENT_LIMIT = 20;
export const GLOBAL_LIMIT = 300;
export const WINDOW_MS = 60_000;
const MAX_FIELD = 200;
const MAX_REPORTS_PER_BODY = 10;

export const CSP_REPORT_CONTENT_TYPES = [
  'application/csp-report',
  'application/reports+json',
  'application/json',
] as const;

export type CspViolation = {
  directive: string;
  blocked: string;
  page: string;
  disposition: string;
};

/** Printable ASCII only, trimmed and cut: nothing a log viewer can be tricked by. */
function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7e]/g, '?').trim().slice(0, MAX_FIELD);
}

/** `https://cdn.example/x.js?t=1` → `https://cdn.example`; keywords (`inline`, `eval`) stay. */
function blockedOrigin(value: unknown): string {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : `${url.protocol}`;
  } catch {
    return raw.split(/[/?#]/)[0] ?? '';
  }
}

/** The path of the page the violation happened on, without query or fragment. */
function pagePath(value: unknown): string {
  const raw = clean(value);
  if (!raw) return '';
  try {
    return new URL(raw).pathname.slice(0, MAX_FIELD);
  } catch {
    return '';
  }
}

function fromLegacy(r: Record<string, unknown>): CspViolation {
  return {
    directive: clean(r['effective-directive'] ?? r['violated-directive']),
    blocked: blockedOrigin(r['blocked-uri']),
    page: pagePath(r['document-uri']),
    disposition: clean(r['disposition']) || 'enforce',
  };
}

function fromReportingApi(body: Record<string, unknown>): CspViolation {
  return {
    directive: clean(body.effectiveDirective),
    blocked: blockedOrigin(body.blockedURL),
    page: pagePath(body.documentURL),
    disposition: clean(body.disposition) || 'enforce',
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Both wire formats: the legacy `report-uri` body `{"csp-report": {...}}` and the
 * Reporting API's array of `{type: "csp-violation", body: {...}}`. Anything else
 * yields no violations.
 */
export function parseCspReports(payload: unknown): CspViolation[] {
  if (isObject(payload) && isObject(payload['csp-report'])) {
    return [fromLegacy(payload['csp-report'])];
  }
  if (Array.isArray(payload)) {
    return payload
      .slice(0, MAX_REPORTS_PER_BODY)
      .filter((r): r is Record<string, unknown> => isObject(r) && r.type === 'csp-violation' && isObject(r.body))
      .map((r) => fromReportingApi(r.body as Record<string, unknown>));
  }
  return [];
}

/** Fixed-window counters. `now` is injectable for tests. */
export class ReportLimiter {
  private windowStart = 0;
  private total = 0;
  private perClient = new Map<string, number>();

  constructor(
    private readonly perClientLimit = PER_CLIENT_LIMIT,
    private readonly globalLimit = GLOBAL_LIMIT,
    private readonly windowMs = WINDOW_MS,
  ) {}

  /** How many clients the current window tracks (bounded by the global limit). */
  get trackedClients(): number {
    return this.perClient.size;
  }

  /**
   * True when this request may be logged. It always counts against its client; it counts
   * against the global window only once the client is within its own limit (NG-367 Ö-1,
   * SEC NG-363): before, the global counter went up first, so one address sending 300
   * requests a minute filled the window and every other client got 429.
   *
   * A client not yet seen in this window is only tracked while the global window has
   * room (NG-367 B-1): otherwise every new address (rotating IPv6 /64s) added a map entry
   * that was refused anyway, so the map grew without bound. Each new entry is admitted
   * against the global window, so the map never holds more than `globalLimit` clients.
   */
  take(client: string | null, now = Date.now()): boolean {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.total = 0;
      this.perClient.clear();
    }
    if (client) {
      const seen = this.perClient.get(client);
      if (seen === undefined && this.total >= this.globalLimit) return false;
      const n = (seen ?? 0) + 1;
      this.perClient.set(client, n);
      if (n > this.perClientLimit) return false;
    }
    this.total += 1;
    return this.total <= this.globalLimit;
  }
}

/** Reads at most `limit` bytes; null when the body is longer. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string | null> {
  const bytes = await readCappedBytes(body, limit);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

const limiter = new ReportLimiter();

/** The whole endpoint, minus Next's route wrapper. */
export async function handleCspReport(request: Request, rateLimiter: ReportLimiter = limiter): Promise<Response> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!(CSP_REPORT_CONTENT_TYPES as readonly string[]).includes(type)) {
    return new Response(null, { status: 415 });
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  const ip = clientIpFrom(request.headers);
  if (!rateLimiter.take(ip ? ipBucket(ip) : null)) {
    return new Response(null, { status: 429 });
  }

  const text = await readCapped(request.body, MAX_REPORT_BYTES);
  if (text === null) return new Response(null, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  for (const violation of parseCspReports(payload)) {
    logger.warn('csp violation', violation);
  }
  return new Response(null, { status: 204 });
}
