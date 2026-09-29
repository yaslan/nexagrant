/**
 * Optional Sentry amplifier for error-level SystemAlert rows (TASK-MULQMKP4YOM04).
 *
 * OFF BY DEFAULT. With `SENTRY_DSN` unset or blank nothing leaves the
 * deployment, which is the standing product decision of 2026-09-07
 * (TASK-MTQUN8VV6DK8C, docs/legal/processing-register.md §19): errors live in
 * `SystemAlert` and /[locale]/admin/alerts. Setting a DSN makes Sentry a
 * sub-processor — do it only together with the register/DPA update that says so.
 *
 * Why no @sentry/nextjs: the SDK installs global handlers that ship request
 * URLs, headers, breadcrumbs and stack locals, which is exactly the tenant
 * content this app must not export. Here the payload is built field by field
 * from a row `buildAlertRow` has already sanitized: level, source, message and
 * meta. No `user`, no `request`, no `server_name`, no IP. The envelope endpoint
 * is a documented HTTP contract; fetch covers it with no new dependency.
 *
 * Contract (same as `recordAlert`):
 *   - No / malformed DSN -> { status: 'skipped' }. Never throws.
 *   - Transport failure -> { status: 'failed', reason }. The SystemAlert row is
 *     the record of truth; Sentry is an amplifier.
 *   - The DSN is a credential: never returned, never logged.
 */

import { randomUUID } from 'crypto';

export type SentryDeliveryStatus = 'sent' | 'skipped' | 'failed';

export interface SentryDelivery {
  status: SentryDeliveryStatus;
  eventId?: string;
  reason?: string;
}

export interface SentryAlertInput {
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  meta?: Record<string, unknown>;
  /** `SystemAlert.id`, so the Sentry issue points back at the row an admin can open. */
  alertId?: string;
}

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
  path: string;
}

/**
 * Parse `https://<publicKey>@<host>/<path><projectId>`. Null rather than a
 * throw: a malformed DSN degrades to "skipped".
 */
export function parseSentryDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn || dsn.trim() === '') return null;
  try {
    const url = new URL(dsn.trim());
    const publicKey = url.username;
    const segments = url.pathname.split('/').filter(Boolean);
    const projectId = segments.pop();
    if (!publicKey || !projectId) return null;
    return {
      publicKey,
      host: url.host,
      projectId,
      protocol: url.protocol.replace(':', ''),
      path: segments.length > 0 ? `/${segments.join('/')}` : '',
    };
  } catch {
    return null;
  }
}

export function sentryEnvelopeUrl(dsn: ParsedDsn): string {
  return `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/`;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Second line of defence behind `sanitizeMeta`'s key deny-list: an e-mail
 * address that slipped into a free-text value (an error message quoting its
 * input, say) is masked before it leaves the process.
 */
export function scrubText(value: string): string {
  return value.replace(EMAIL_PATTERN, '[email]');
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value).slice(0, 500);
  if (value === null || typeof value !== 'object' || depth > 3) {
    return typeof value === 'object' && value !== null ? '[depth]' : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrubValue(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubValue(v, depth + 1)])
  );
}

const SENTRY_LEVEL = { info: 'info', warn: 'warning', error: 'error' } as const;

/**
 * The event object — exported so a test can assert exactly which fields leave
 * the process. Anything not assigned here is not sent.
 */
export function buildSentryEvent(input: SentryAlertInput, eventId: string, sentAt: Date) {
  return {
    event_id: eventId,
    timestamp: sentAt.toISOString(),
    platform: 'node',
    level: SENTRY_LEVEL[input.level],
    logger: input.source.slice(0, 100),
    message: { formatted: scrubText(input.message).slice(0, 500) },
    // One issue per (source, message) — the same grouping SystemAlert dedup uses.
    fingerprint: [input.source, scrubText(input.message).slice(0, 200)],
    tags: { source: input.source.slice(0, 100), ...(input.alertId ? { alert_id: input.alertId } : {}) },
    extra: (scrubValue(input.meta ?? {}) as Record<string, unknown>),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  };
}

export function buildEnvelope(input: SentryAlertInput, eventId: string, sentAt: Date): string {
  const event = JSON.stringify(buildSentryEvent(input, eventId, sentAt));
  const header = JSON.stringify({ event_id: eventId, sent_at: sentAt.toISOString() });
  const itemHeader = JSON.stringify({ type: 'event', length: Buffer.byteLength(event, 'utf-8') });
  return `${header}\n${itemHeader}\n${event}\n`;
}

/** Whether a DSN is configured — lets callers skip building the input at all. */
export function isSentryEnabled(dsnOverride?: string): boolean {
  return parseSentryDsn(dsnOverride ?? process.env.SENTRY_DSN) !== null;
}

/**
 * Send one event. `dsnOverride` exists so a test can point at a local capture
 * server; production reads `SENTRY_DSN`.
 */
export async function captureAlertToSentry(
  input: SentryAlertInput,
  options: { dsnOverride?: string; timeoutMs?: number } = {}
): Promise<SentryDelivery> {
  const dsn = parseSentryDsn(options.dsnOverride ?? process.env.SENTRY_DSN);
  if (!dsn) return { status: 'skipped', reason: 'no_dsn' };

  const eventId = randomUUID().replace(/-/g, '');
  const controller = new AbortController();
  // Short: this runs on an error path that is already slow.
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2000);

  try {
    const res = await fetch(sentryEnvelopeUrl(dsn), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=fonbridge-alerts/1.0, sentry_key=${dsn.publicKey}`,
      },
      body: buildEnvelope(input, eventId, new Date()),
      signal: controller.signal,
    });
    // Status only — a response body can echo the DSN back.
    if (!res.ok) return { status: 'failed', reason: `sentry_http_${res.status}` };
    return { status: 'sent', eventId };
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown_error';
    return { status: 'failed', reason: `transport_${reason}` };
  } finally {
    clearTimeout(timeout);
  }
}
