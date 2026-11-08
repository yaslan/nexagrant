import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { escapeHtml } from '@/lib/feedback/digest';
import type { MailMessage } from './mailer';
import trMessages from '../../../messages/tr.json';
import enMessages from '../../../messages/en.json';

/**
 * The opt-out of a first message (NG-42): the `List-Unsubscribe` header and the
 * two links in the body. "First message" is a mail the recipient did not ask
 * for and has no account behind, so nothing here can hang off a user row; the
 * recipient is known by a hash of the address alone.
 *
 * Two different things a recipient can say:
 *   - `unsubscribe`: no more first messages from this platform, from anyone;
 *   - `decline`: not from this organisation; another one may still write.
 *
 * The link is a stateless signed token, so issuing one writes nothing. It does
 * not expire: an opt-out link in an old mail still has to work.
 *
 * Pure (no database), so the mail renderers and scripts can use it. The record
 * itself: src/lib/email/opt-out-store.ts.
 */

export type OptOutKind = 'unsubscribe' | 'decline';
/** Which mail carried the link. A fixed identifier, never free text. */
export type OptOutSource = 'invitation' | 'beta-invite';

export interface OptOutPayload {
  kind: OptOutKind;
  /** {@link emailOptOutHash} of the recipient. */
  hash: string;
  source: OptOutSource;
  /** The organisation the mail was sent for. */
  tenantId: string;
}

interface WireBody {
  v: 1;
  k: 'u' | 'd';
  h: string;
  s: OptOutSource;
  t: string;
}

/** Separates this token's key from every other use of AUTH_SECRET. */
const KEY_LABEL = 'fonbridge:email-opt-out:v1';
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** An HMAC-SHA256 digest is 32 bytes = 43 base64url characters. */
const SIG_LENGTH = 43;
const MAX_TOKEN_LENGTH = 600;
const SOURCES: readonly OptOutSource[] = ['invitation', 'beta-invite'];

/**
 * SHA-256 of the normalised address, as `AuditEvent.target`. Keyless on
 * purpose: a keyed hash would make every recorded opt-out unreachable the day
 * AUTH_SECRET rotates, and an opt-out has to outlive a key.
 */
export function emailOptOutHash(email: string): string {
  return createHash('sha256').update(`${KEY_LABEL}:${email.trim().toLowerCase()}`, 'utf8').digest('hex');
}

function mac(body: string, secret: string): Buffer {
  const key = createHmac('sha256', secret).update(KEY_LABEL).digest();
  return createHmac('sha256', key).update(body).digest();
}

export function signOptOutToken(payload: OptOutPayload, secret: string): string {
  const wire: WireBody = {
    v: 1,
    k: payload.kind === 'decline' ? 'd' : 'u',
    h: payload.hash,
    s: payload.source,
    t: payload.tenantId,
  };
  const body = Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

/** Anything but an intact token of the right shape is `null`. */
export function verifyOptOutToken(raw: unknown, secret: string): OptOutPayload | null {
  if (typeof raw !== 'string' || raw.length > MAX_TOKEN_LENGTH) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  // Shape first: Node's base64url decoder skips stray characters.
  if (!BASE64URL.test(body) || sig.length !== SIG_LENGTH || !BASE64URL.test(sig)) return null;
  const given = Buffer.from(sig, 'base64url');
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let wire: Partial<WireBody>;
  try {
    wire = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<WireBody>;
  } catch {
    return null;
  }
  if (wire.v !== 1 || (wire.k !== 'u' && wire.k !== 'd')) return null;
  if (typeof wire.h !== 'string' || !/^[0-9a-f]{64}$/.test(wire.h)) return null;
  if (typeof wire.t !== 'string' || wire.t === '') return null;
  if (typeof wire.s !== 'string' || !SOURCES.includes(wire.s)) return null;
  return { kind: wire.k === 'd' ? 'decline' : 'unsubscribe', hash: wire.h, source: wire.s, tenantId: wire.t };
}

function optOutUrl(baseUrl: string, payload: OptOutPayload, secret: string): string {
  return `${baseUrl}/api/email/opt-out?t=${encodeURIComponent(signOptOutToken(payload, secret))}`;
}

/**
 * `message` with the opt-out added: the header for the mail client's own
 * button, and a decline and an unsubscribe link in both bodies. Turkish first,
 * English below, like the invitation it goes on: the recipient has no locale
 * on record.
 */
export function withOptOut(
  message: MailMessage,
  options: { baseUrl: string; secret: string; source: OptOutSource; tenantId: string }
): MailMessage {
  const { baseUrl, secret, source, tenantId } = options;
  const hash = emailOptOutHash(message.to);
  const unsubscribe = optOutUrl(baseUrl, { kind: 'unsubscribe', hash, source, tenantId }, secret);
  const decline = optOutUrl(baseUrl, { kind: 'decline', hash, source, tenantId }, secret);
  const tr = trMessages.EmailOptOut.footer;
  const en = enMessages.EmailOptOut.footer;

  const text = [
    `${tr.decline} / ${en.decline}: ${decline}`,
    `${tr.unsubscribe} / ${en.unsubscribe}: ${unsubscribe}`,
  ].join('\n');
  const link = (href: string, label: string) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;

  return {
    ...message,
    listUnsubscribe: unsubscribe,
    text: `${message.text ? `${message.text}\n\n` : ''}${text}`,
    html: `${message.html}
<hr/>
<p style="font-size:12px;color:#666">${link(decline, tr.decline)} · ${link(unsubscribe, tr.unsubscribe)}</p>
<p style="font-size:12px;color:#666">${link(decline, en.decline)} · ${link(unsubscribe, en.unsubscribe)}</p>
`,
  };
}
