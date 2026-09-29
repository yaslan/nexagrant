'use server';

import { requirePlatformAdmin } from '@/lib/tenant';
import { reportMailNotConfigured, smtpMailer } from '@/lib/email/mailer';
import { PRODUCT_NAME } from '@/lib/brand';

export type SmtpTestResult = { ok: true } | { ok: false; error: 'invalid_address' | 'not_configured' | string };

/**
 * Sends one real test mail through the configured SMTP server
 * (TASK-MUMLF57HOYFSB). It used to be a timer that always reported success.
 *
 * A server action is its own HTTP entry point, so the platform-admin check is
 * made here and not left to the admin layout. The error handed back is the SMTP
 * codes only (MailSendError), never the server's reply text.
 */
export async function sendSmtpTestEmail(to: string): Promise<SmtpTestResult> {
  await requirePlatformAdmin();

  const address = typeof to === 'string' ? to.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: 'invalid_address' };

  const mailer = smtpMailer();
  if (!mailer) {
    await reportMailNotConfigured('admin-smtp-test');
    return { ok: false, error: 'not_configured' };
  }

  try {
    await mailer({
      to: address,
      subject: `${PRODUCT_NAME} SMTP test`,
      html: `<p>${PRODUCT_NAME} SMTP yapılandırması çalışıyor. / The ${PRODUCT_NAME} SMTP configuration works.</p>`,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unknown_error' };
  }
}
