import nodemailer, { type SendMailOptions } from 'nodemailer';
import { env } from '@/lib/env';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * Outgoing mail over our own SMTP server (decision of 2026-09-29: no Resend,
 * mail goes out through the organisation's mail account). TASK-MUMLF57HOYFSB.
 *
 * The only source of SMTP settings is the environment (SMTP_* in
 * src/lib/env.ts). The admin settings page shows them read-only; it does not
 * store an override, so there is nothing to prefer over env.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Optional: most callers only render HTML. */
  text?: string;
  /** Overrides SMTP_FROM for this message (the beta scripts' own sender). */
  from?: string;
  attachments?: Array<{ filename: string; content: string | Buffer; contentType?: string }>;
  /**
   * https URL for `List-Unsubscribe`, with the RFC 8058 one-click header beside
   * it. Set by `withOptOut` (./opt-out.ts); nodemailer does the header framing.
   */
  listUnsubscribe?: string;
}

/** What the SMTP server's acceptance gives us; not proof of delivery to a mailbox. */
export interface MailReceipt {
  messageId: string;
}

/**
 * Sends one message or throws. Resolving means the SMTP server accepted it;
 * callers count a send only after this resolves.
 */
export type Mailer = (message: MailMessage) => Promise<MailReceipt | void>;

/**
 * Thrown when the SMTP server refuses the message or cannot be reached.
 * Carries only nodemailer's error code and the SMTP reply code, never the
 * server's reply text: a "550 5.1.1 <a@b>: user unknown" echoes the recipient
 * address, and callers write this into `SystemAlert`, which has no tenant
 * isolation.
 */
export class MailSendError extends Error {
  constructor(
    readonly code: string,
    readonly responseCode: number | null
  ) {
    super(`smtp:${code}${responseCode ? `:${responseCode}` : ''}`);
    this.name = 'MailSendError';
  }
}

/**
 * The code-only text of a `MailSendError` (`smtp:EAUTH:535`), or `null` for
 * any other thrown value, whose message may quote the server or the config.
 */
export function mailFailureCode(error: unknown): string | null {
  return error instanceof MailSendError ? error.message : null;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS (port 465). false = plain connect, upgraded with STARTTLS. */
  secure: boolean;
  auth: { user: string; pass: string } | null;
  from: string;
}

type SmtpEnv = Pick<
  typeof env,
  'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS' | 'SMTP_FROM' | 'NEXT_PUBLIC_SMTP_FROM_ADDRESS'
>;

/** The SMTP settings from env, or null when SMTP_HOST is unset ("cannot send"). */
export function smtpConfigFromEnv(source: SmtpEnv = env): SmtpConfig | null {
  if (!source.SMTP_HOST) return null;
  const port = source.SMTP_PORT ? Number(source.SMTP_PORT) : 587;
  return {
    host: source.SMTP_HOST,
    port,
    secure: source.SMTP_SECURE ? source.SMTP_SECURE === 'true' : port === 465,
    auth: source.SMTP_USER && source.SMTP_PASS ? { user: source.SMTP_USER, pass: source.SMTP_PASS } : null,
    from: source.SMTP_FROM || `${PRODUCT_NAME} <${source.NEXT_PUBLIC_SMTP_FROM_ADDRESS}>`,
  };
}

/** The slice of a nodemailer transport this module uses; tests pass a fake. */
export interface MailTransport {
  sendMail(message: SendMailOptions): Promise<{ messageId: string; rejected?: unknown[] }>;
}

export function createSmtpTransport(config: SmtpConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.auth ? { auth: config.auth } : {}),
    // With credentials, never send them over an unencrypted connection: fail
    // instead of falling back to plain AUTH when the server offers no STARTTLS.
    // A local catcher (mailpit) takes no credentials and stays reachable.
    requireTLS: !config.secure && config.auth !== null,
    // nodemailer waits up to 2 minutes to connect and 10 minutes on a socket by
    // default; a cron run or a request must not hang that long on a dead host.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

/**
 * Sends through `transport` and returns the server's message id, or throws
 * `MailSendError`. For callers that need the id (the beta scripts' receipts);
 * the app uses the `Mailer` from {@link smtpMailer}.
 */
export async function sendMail(
  transport: MailTransport,
  config: SmtpConfig,
  message: MailMessage
): Promise<{ messageId: string }> {
  let info: { messageId: string; rejected?: unknown[] };
  try {
    info = await transport.sendMail({
      from: message.from || config.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
      ...(message.attachments ? { attachments: message.attachments } : {}),
      ...(message.listUnsubscribe
        ? {
            list: { unsubscribe: message.listUnsubscribe },
            headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          }
        : {}),
    });
  } catch (error) {
    const e = error as { code?: unknown; responseCode?: unknown };
    throw new MailSendError(
      typeof e.code === 'string' ? e.code : 'unknown_error',
      typeof e.responseCode === 'number' ? e.responseCode : null
    );
  }
  // With one recipient a refusal normally throws EENVELOPE, but a server may
  // also accept the DATA and list the address as rejected. Not delivered.
  if (info.rejected && info.rejected.length > 0) throw new MailSendError('EENVELOPE', null);
  return { messageId: info.messageId };
}

let cached: { transport: MailTransport; config: SmtpConfig } | null = null;

/**
 * An SMTP-backed `Mailer`, or null when SMTP is not configured. Callers must
 * treat null as "cannot send", NOT as "sent" — and report it
 * ({@link reportMailNotConfigured}).
 */
export function smtpMailer(): Mailer | null {
  const config = smtpConfigFromEnv();
  if (!config) return null;
  cached ??= { transport: createSmtpTransport(config), config };
  const { transport } = cached;
  return (message) => sendMail(transport, config, message);
}

/** SystemAlert source for every "mail cannot go out" alert. */
export const MAIL_ALERT_SOURCE = 'mail';

/**
 * What is missing when mail cannot go out: `smtp` (no SMTP_HOST) or `app_url`
 * (no usable NEXT_PUBLIC_APP_URL, so the link the mail carries cannot be built;
 * see `appBaseUrl()`). One log line used to name SMTP for both, which sent the
 * FO-131 investigation after SMTP while the app URL was the gap.
 */
export type MailNotConfiguredReason = 'smtp' | 'app_url';

const MAIL_NOT_CONFIGURED: Record<MailNotConfiguredReason, { what: string; dedupe: string }> = {
  smtp: { what: 'SMTP is not configured (SMTP_HOST unset)', dedupe: 'smtp-not-configured' },
  app_url: {
    what: 'NEXT_PUBLIC_APP_URL is not usable (unset, or in production loopback, http:// or more than an origin)',
    dedupe: 'app-url-not-configured',
  },
};

/**
 * Makes "mail cannot go out" loud instead of a silently skipped send: an
 * error on the console everywhere, and in production an error-level
 * `SystemAlert` (one open row per caller and reason, deduplicated). Never throws.
 *
 * `caller` is a fixed identifier such as `invitations`; never an address.
 * `reason` says which setting is missing; SMTP unless the caller says otherwise.
 */
export async function reportMailNotConfigured(caller: string, reason: MailNotConfiguredReason = 'smtp'): Promise<void> {
  const { what, dedupe } = MAIL_NOT_CONFIGURED[reason];
  console.error(`[mail] ${caller}: ${what} — mail not sent`);
  if (env.NODE_ENV !== 'production') return;
  // Imported here, not at the top: system-alert pulls in the database client,
  // and this module is imported by code that must stay light (see
  // src/app/api/saved-searches/route.ts).
  const { recordAlert } = await import('@/lib/observability/system-alert');
  await recordAlert({
    level: 'error',
    source: MAIL_ALERT_SOURCE,
    message: `${what}: ${caller} mail is not being sent`,
    meta: { caller },
    dedupeKey: `${dedupe}:${caller}`,
  });
}
