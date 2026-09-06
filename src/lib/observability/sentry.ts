/**
 * Minimal Sentry forwarder — writes one event to Sentry's envelope endpoint.
 *
 * Why not @sentry/nextjs: this repo needs exactly one thing from Sentry — post
 * a structured beta report so it lands as an issue. The SDK brings a build
 * plugin, source-map upload and a global error handler we have not signed up
 * for. The envelope endpoint is a documented HTTP contract; ~80 lines of fetch
 * covers it, adds no dependency to the build, and stays inert when SENTRY_DSN
 * is blank.
 *
 * Contract:
 *   - No DSN -> { status: 'skipped' }. Never throws, never logs a secret.
 *   - Transport failure -> { status: 'failed', reason }. The caller has already
 *     persisted the report; Sentry is an amplifier, not the record of truth.
 *   - Success -> { status: 'sent', eventId }.
 *
 * The DSN is a credential. It is read from env, never returned, never logged;
 * only the host and project id ever appear in an error string.
 */

import { randomUUID } from 'crypto';
import { env } from '@/lib/env';

export type SentryDeliveryStatus = 'sent' | 'skipped' | 'failed';

export interface SentryDelivery {
  status: SentryDeliveryStatus;
  eventId?: string;
  reason?: string;
}

export interface SentryEventInput {
  message: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  /** Groups issues in the Sentry UI. Reports with the same fingerprint merge. */
  fingerprint?: string[];
  tags?: Record<string, string | undefined>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string };
  environment?: string;
  release?: string;
  /**
   * Optional binary attachment (a screenshot). Sent as a second envelope item
   * so the image survives even when object storage is not configured.
   */
  attachment?: { filename: string; contentType: string; data: Buffer };
}

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
  path: string;
}

/**
 * Parse `https://<publicKey>@<host>/<path><projectId>`.
 * Returns null rather than throwing: a malformed DSN must degrade to "skipped",
 * not take down the endpoint that writes feedback to the database.
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

/** Drop undefined tag values so Sentry does not receive `"tag": null`. */
function cleanTags(tags: Record<string, string | undefined> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

/**
 * Build the newline-delimited envelope body. Exported so a test can assert the
 * exact wire format without opening a socket. Returns a Buffer because an
 * attachment item carries raw bytes, not text.
 */
export function buildEnvelope(
  input: SentryEventInput,
  eventId: string,
  sentAt: Date
): Buffer {
  const event = {
    event_id: eventId,
    timestamp: sentAt.toISOString(),
    platform: 'javascript',
    level: input.level ?? 'error',
    logger: 'fabrika.feedback',
    message: { formatted: input.message },
    fingerprint: input.fingerprint,
    tags: cleanTags(input.tags),
    extra: input.extra ?? {},
    user: input.user,
    environment: input.environment ?? env.NODE_ENV,
    release: input.release,
  };

  const header = JSON.stringify({ event_id: eventId, sent_at: sentAt.toISOString() });
  const eventPayload = Buffer.from(JSON.stringify(event), 'utf-8');
  const eventItemHeader = JSON.stringify({ type: 'event', length: eventPayload.length });

  const parts: Buffer[] = [
    Buffer.from(`${header}\n${eventItemHeader}\n`, 'utf-8'),
    eventPayload,
    Buffer.from('\n', 'utf-8'),
  ];

  if (input.attachment) {
    // `length` is mandatory on a binary item: the parser cannot rely on a
    // newline terminator inside arbitrary bytes.
    const attachmentHeader = JSON.stringify({
      type: 'attachment',
      length: input.attachment.data.length,
      filename: input.attachment.filename,
      content_type: input.attachment.contentType,
      attachment_type: 'event.attachment',
    });
    parts.push(
      Buffer.from(`${attachmentHeader}\n`, 'utf-8'),
      input.attachment.data,
      Buffer.from('\n', 'utf-8')
    );
  }

  return Buffer.concat(parts);
}

function authHeader(dsn: ParsedDsn): string {
  return [
    'Sentry sentry_version=7',
    'sentry_client=fabrika-feedback/1.0',
    `sentry_key=${dsn.publicKey}`,
  ].join(', ');
}

/**
 * Send one event. `dsnOverride` exists so a test can point at a local capture
 * server; production always reads env.SENTRY_DSN.
 */
export async function captureToSentry(
  input: SentryEventInput,
  options: { dsnOverride?: string; timeoutMs?: number } = {}
): Promise<SentryDelivery> {
  const dsn = parseSentryDsn(options.dsnOverride ?? env.SENTRY_DSN);
  if (!dsn) return { status: 'skipped', reason: 'no_dsn' };

  const eventId = randomUUID().replace(/-/g, '');
  const envelope = buildEnvelope(input, eventId, new Date());
  // fetch's BodyInit wants an ArrayBuffer-backed view; Buffer is typed over the
  // wider ArrayBufferLike (it may sit on a SharedArrayBuffer), so copy once into
  // a plain Uint8Array. The payload is a few KB — the copy is free.
  const body = new Uint8Array(envelope.byteLength);
  body.set(envelope);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  try {
    const res = await fetch(sentryEnvelopeUrl(dsn), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': authHeader(dsn),
      },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      // Status only — the response body can echo the DSN back.
      return { status: 'failed', reason: `sentry_http_${res.status}` };
    }
    return { status: 'sent', eventId };
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown_error';
    return { status: 'failed', reason: `transport_${reason}` };
  } finally {
    clearTimeout(timeout);
  }
}
