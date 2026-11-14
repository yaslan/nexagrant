import { createTranslator } from 'next-intl';
import { smtpMailer, reportMailNotConfigured, type Mailer } from '@/lib/email/mailer';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { sendNotificationEmails, type EmailMode, type SendEmailsResult } from './email-outbox';
import type { NotificationTranslator } from './render';
import trMessages from '../../../messages/tr.json';
import enMessages from '../../../messages/en.json';

/**
 * The scheduled run of the notification e-mail outbox (NG-131, NG-43 Ö-1).
 *
 * A thin wrapper over `sendNotificationEmails`: it picks the SMTP mailer and the
 * recipient-locale translator, and turns a bad run into a SystemAlert.
 *   - failures > 0 (a send or a mark failed; the rows stay queued): `warn` alert,
 *     counts only (no address, no tenant id: SystemAlert has no tenant isolation);
 *   - an exception (the run itself broke): `error` alert, then rethrown so the
 *     queue retries it (ADR-0008 §6.3);
 *   - SMTP not configured: reported loudly (reportMailNotConfigured), nothing is
 *     claimed, so the queue stays as it is for the day SMTP is set.
 * Overlapping runs are safe: see the claim in ./email-outbox.ts.
 */
const MESSAGES = { tr: trMessages, en: enMessages } as const;

export function notificationTranslatorFor(locale: string): NotificationTranslator {
  const l = locale === 'en' ? 'en' : 'tr';
  return createTranslator({ locale: l, messages: MESSAGES[l], namespace: 'Notifications' }) as unknown as NotificationTranslator;
}

export interface RunEmailOutboxOptions {
  mode: EmailMode;
  now?: Date;
  /** Test seam; default the SMTP mailer. */
  mailer?: Mailer | null;
  /** Test seam; default the real outbox. */
  send?: typeof sendNotificationEmails;
}

export type RunEmailOutboxResult = SendEmailsResult | { mode: EmailMode; skipped: 'smtp-not-configured' };

export async function runNotificationEmailOutbox(options: RunEmailOutboxOptions): Promise<RunEmailOutboxResult> {
  const source = `notification-email-${options.mode.toLowerCase()}`;
  const mailer = options.mailer === undefined ? smtpMailer() : options.mailer;
  if (!mailer) {
    await reportMailNotConfigured(source);
    return { mode: options.mode, skipped: 'smtp-not-configured' };
  }
  const send = options.send ?? sendNotificationEmails;
  let result: SendEmailsResult;
  try {
    result = await send({
      mode: options.mode,
      mailer,
      translatorFor: notificationTranslatorFor,
      ...(options.now ? { now: options.now } : {}),
    });
  } catch (error) {
    await recordAlert({
      level: 'error',
      source,
      message: `Notification e-mail run failed: ${errorMessage(error)}`,
      meta: { mode: options.mode },
    });
    throw error;
  }
  if (result.failures > 0) {
    await recordAlert({
      level: 'warn',
      source,
      message: `${result.failures} notification e-mail send(s) failed; the items stay queued for the next run`,
      meta: { mode: options.mode, failures: result.failures, recipients: result.recipients, mailsSent: result.mailsSent },
      dedupeKey: `${source}:failed`,
    });
  }
  return result;
}
