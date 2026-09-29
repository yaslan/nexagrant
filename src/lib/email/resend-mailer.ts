import { Resend } from 'resend';
import { env } from '@/lib/env';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends one message or throws. Resolving means the provider accepted it;
 * callers count a send only after this resolves.
 */
export type Mailer = (message: MailMessage) => Promise<void>;

/**
 * Thrown when Resend answers with `{ error }`. Carries only the provider's
 * error name and HTTP status, never its message: a validation message can
 * echo the recipient address back, and callers write this into
 * `SystemAlert`, which has no tenant isolation.
 */
export class MailSendError extends Error {
  constructor(
    readonly providerName: string,
    readonly statusCode: number | null
  ) {
    super(`resend:${providerName}${statusCode ? `:${statusCode}` : ''}`);
    this.name = 'MailSendError';
  }
}

let client: Resend | null = null;

/**
 * A Resend-backed `Mailer`, or null when no API key is configured. Callers
 * must treat null as "cannot send", NOT as "sent".
 *
 * TASK-MUMH6NZ128QZ1: `resend` v6 does not throw on an API failure. A 401,
 * a 422 or a 5xx comes back as a resolved `{ data: null, error }`, so a bare
 * `await client.emails.send(...)` counted a rejected mail as delivered. This
 * wrapper turns that `error` into a throw.
 */
export function resendMailer(): Mailer | null {
  if (!env.RESEND_API_KEY) return null;
  client ??= new Resend(env.RESEND_API_KEY);
  const resend = client;

  return async ({ to, subject, html }) => {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM || 'FonBridge <no-reply@fabrika.app>',
      to: [to],
      subject,
      html,
    });
    if (error) {
      const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : null;
      throw new MailSendError(error.name ?? 'unknown_error', statusCode);
    }
  };
}
