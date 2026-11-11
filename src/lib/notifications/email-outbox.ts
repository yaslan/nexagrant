import type { NotificationType } from '@prisma/client';
import { withTenant, type TenantTx } from '@/lib/db';
import { withSystemScope, type SystemTx } from '@/lib/system-scope';
import { keepLiveTenantRows } from '@/lib/tenant-liveness';
import type { Mailer } from '@/lib/email/mailer';
import { escapeHtml } from '@/lib/feedback/digest';
import { renderNotification, type NotificationTranslator } from './render';

/**
 * Sends the notification centre's e-mail outbox (spec §13, NG-43).
 *
 * `dispatchNotification` (./preferences.ts) queues a `NotificationEmailItem`
 * with the frequency the user chose. This file sends them:
 *   - mode 'INSTANT': one mail per queued item;
 *   - mode 'WEEKLY':  every WEEKLY item of a user in a tenant, in ONE digest
 *                     mail ("haftalık özet"). A user of two tenants gets two.
 * A mail's items are marked `sentAt` right after the SMTP server accepts it and
 * kept: the (tenant, user, dedupeKey) unique index is the e-mail channel's only
 * dedupe, so deleting the row would let a producer that re-runs the same key
 * (evidence-expiring, daily) queue and mail it again (NG-43 review B-1).
 * notifications-retention deletes sent rows after the retention window.
 * A failed send leaves its items unsent, so the next run sends them again: at
 * least once, never silently dropped. A failed MARK after an accepted send is
 * counted in `failures` and the run goes on; that mail goes again next run
 * (the same at-least-once). An item whose recipient is no longer a live member
 * of the tenant is deleted unsent (an address of a person who left must not
 * keep getting mail).
 *
 * The text is rendered here, in the recipient's locale, with the same
 * `renderNotification` the bell uses: the outbox stores type + payload only.
 */

export type EmailMode = 'INSTANT' | 'WEEKLY';

export interface OutboxItem {
  id: string;
  type: NotificationType;
  payload: unknown;
  createdAt: Date;
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

/** Strips CR/LF (header injection) from a subject made of rendered user text. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** One instant mail: the notification's own title and description. */
export function renderInstantMail(item: OutboxItem, t: NotificationTranslator): RenderedMail {
  const { title, description } = renderNotification(item.type, item.payload, t);
  return {
    subject: headerSafe(title),
    html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>`,
    text: `${title}\n\n${description}`,
  };
}

/** The weekly digest: every item as one line, oldest first. */
export function renderDigestMail(items: readonly OutboxItem[], t: NotificationTranslator): RenderedMail {
  const sorted = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lines = sorted.map((item) => renderNotification(item.type, item.payload, t));
  const subject = headerSafe(t('emailDigestSubject', { count: sorted.length }));
  const intro = t('emailDigestIntro', { count: sorted.length });
  return {
    subject,
    html:
      `<h2>${escapeHtml(subject)}</h2><p>${escapeHtml(intro)}</p><ul>` +
      lines.map((l) => `<li><strong>${escapeHtml(l.title)}</strong>: ${escapeHtml(l.description)}</li>`).join('') +
      '</ul>',
    text: [subject, '', intro, '', ...lines.map((l) => `- ${l.title}: ${l.description}`)].join('\n'),
  };
}

export interface SendEmailsResult {
  mode: EmailMode;
  recipients: number;
  mailsSent: number;
  itemsSent: number;
  itemsDropped: number;
  failures: number;
}

export interface SendEmailsOptions {
  mode: EmailMode;
  mailer: Mailer;
  /** The `Notifications` namespace in `locale` (createTranslator in production). */
  translatorFor: (locale: string) => NotificationTranslator;
  /** WEEKLY: items queued up to this moment. Default now. */
  now?: Date;
  /** Seam for the live test: run on the test's own clients. Default withSystemScope / withTenant. */
  systemScope?: <T>(callback: (tx: SystemTx) => Promise<T>) => Promise<T>;
  runTenant?: <T>(tenantId: string, callback: (tx: TenantTx) => Promise<T>) => Promise<T>;
}

/** Who has items of this mode waiting: (tenant, user) pairs, live tenants only. */
async function pendingRecipients(tx: SystemTx, mode: EmailMode, now: Date) {
  const rows = await tx.notificationEmailItem.findMany({
    where: { frequency: mode, sentAt: null, createdAt: { lte: now } },
    distinct: ['tenantId', 'userId'],
    select: { tenantId: true, userId: true },
  });
  return keepLiveTenantRows(tx, rows);
}

export async function sendNotificationEmails(options: SendEmailsOptions): Promise<SendEmailsResult> {
  const now = options.now ?? new Date();
  const systemScope =
    options.systemScope ??
    (<T>(cb: (tx: SystemTx) => Promise<T>) => withSystemScope('cross-tenant-job', 'notification-email-outbox.pending', cb));
  const runTenant = options.runTenant ?? withTenant;
  const result: SendEmailsResult = {
    mode: options.mode,
    recipients: 0,
    mailsSent: 0,
    itemsSent: 0,
    itemsDropped: 0,
    failures: 0,
  };

  const recipients = await systemScope((tx) => pendingRecipients(tx, options.mode, now));
  for (const { tenantId, userId } of recipients) {
    result.recipients++;
    // Read in one transaction, send outside any: an SMTP round trip must not
    // hold a database transaction open.
    const { items, member } = await runTenant(tenantId, async (tx) => ({
      items: await tx.notificationEmailItem.findMany({
        where: { tenantId, userId, frequency: options.mode, sentAt: null, createdAt: { lte: now } },
        select: { id: true, type: true, payload: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      member: await tx.membership.findFirst({
        where: { tenantId, userId, user: { deletedAt: null, deletionRequestedAt: null } },
        select: { user: { select: { email: true, locale: true } } },
      }),
    }));
    if (items.length === 0) continue;
    if (!member) {
      const ids = items.map((i) => i.id);
      const dropped = await runTenant(tenantId, (tx) =>
        tx.notificationEmailItem.deleteMany({ where: { tenantId, userId, id: { in: ids } } })
      );
      result.itemsDropped += dropped.count;
      continue;
    }
    const t = options.translatorFor(member.user.locale);
    const batches: OutboxItem[][] = options.mode === 'WEEKLY' ? [items] : items.map((i) => [i]);
    for (const batch of batches) {
      const mail = options.mode === 'WEEKLY' ? renderDigestMail(batch, t) : renderInstantMail(batch[0]!, t);
      try {
        await options.mailer({ to: member.user.email, ...mail });
      } catch (error) {
        // Counted, not thrown: one bad address must not stop the rest. The
        // batch stays queued for the next run. Never the error text: it may
        // echo the address (src/lib/email/mailer.ts MailSendError).
        result.failures++;
        console.error('[notifications][email-outbox]', options.mode, error instanceof Error ? error.name : 'error');
        continue;
      }
      result.mailsSent++;
      result.itemsSent += batch.length;
      const ids = batch.map((i) => i.id);
      try {
        await runTenant(tenantId, (tx) =>
          tx.notificationEmailItem.updateMany({
            where: { tenantId, userId, id: { in: ids }, sentAt: null },
            data: { sentAt: new Date() },
          })
        );
      } catch (error) {
        // The mail went; only the mark failed. Counted, not thrown, so the other
        // recipients still get theirs; this batch is sent again next run.
        result.failures++;
        console.error('[notifications][email-outbox]', options.mode, 'mark', error instanceof Error ? error.name : 'error');
      }
    }
  }
  return result;
}
