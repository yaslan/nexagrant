/**
 * E11.2 — the weekly digest as a plain async function.
 *
 * The scheduled job (src/lib/jobs/tasks/feedback-weekly-digest.ts) is a thin cron wrapper around this; a script and a test can
 * run the same code against the real database. Keeping the logic out of the
 * scheduler is what makes "the digest works" a claim we can actually check.
 */

import { prisma } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { env } from '@/lib/env';
import { appUrl } from '@/lib/app-url';
import { logger } from '@/lib/logger';
import {
  summariseFeedback,
  renderDigestHtml,
  renderDigestSubject,
  type DigestRow,
  type DigestSummary,
} from './digest';
import type { FeedbackRecord, TenantNameRow } from './types';

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** `emailReason` when a recipient exists but SMTP_HOST is unset. */
export const NO_SMTP_CONFIG = 'no_smtp_config';
const OPEN_STATUSES = ['NEW', 'TRIAGED', 'IN_PROGRESS'];

export interface DigestRunOptions {
  sinceIso?: string;
  until?: Date;
  to?: string;
  /** false renders the email but does not send it. Default true. */
  send?: boolean;
  /** Injected in tests; defaults to the SMTP mailer built from env. */
  sender?: (message: { to: string; subject: string; html: string }) => Promise<void>;
}

export interface DigestRunResult {
  summary: DigestSummary;
  subject: string;
  html: string;
  recipient?: string;
  emailStatus: 'sent' | 'skipped' | 'failed';
  emailReason?: string;
}

/** Reads the window and everything still open, both cross-tenant. */
export async function collectDigestRows(
  windowStart: Date,
  windowEnd: Date
): Promise<{ windowRows: DigestRow[]; allOpen: DigestRow[] }> {
  // Both reads are cross-tenant by construction — this builds the PLATFORM's
  // beta digest, not a tenant's. One scope around the pair: same transaction,
  // same snapshot, one recorded escape instead of two.
  const [inWindow, open]: [FeedbackRecord[], FeedbackRecord[]] = await withSystemScope(
    'platform-aggregate',
    'feedback-digest.windowAndOpen',
    (tx) =>
      Promise.all([
        tx.feedback.findMany({
          where: { createdAt: { gte: windowStart, lte: windowEnd } },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        tx.feedback.findMany({
          where: { status: { in: OPEN_STATUSES as never } },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ])
  );

  const tenantIds = Array.from(
    new Set([...inWindow, ...open].map((r) => r.tenantId))
  );
  const tenants: TenantNameRow[] = tenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map<string, string>(tenants.map((t) => [t.id, t.name]));

  const toRow = (r: FeedbackRecord): DigestRow => ({
    id: r.id,
    title: r.title,
    category: r.category,
    priority: r.priority,
    status: r.status,
    tenantName: nameById.get(r.tenantId) ?? r.tenantId,
    createdAt: new Date(r.createdAt),
  });

  return { windowRows: inWindow.map(toRow), allOpen: open.map(toRow) };
}

/**
 * The SMTP sender, or null when SMTP is not configured. It throws when the
 * server refuses the mail, so a rejected digest never reports 'sent'
 * (TASK-MUMH6NZ128QZ1).
 */
async function defaultSender(): Promise<DigestRunOptions['sender'] | null> {
  const { smtpMailer } = await import('@/lib/email/mailer');
  return smtpMailer();
}

export async function runFeedbackDigest(
  options: DigestRunOptions = {}
): Promise<DigestRunResult> {
  const windowEnd = options.until ?? new Date();
  const windowStart = options.sinceIso
    ? new Date(options.sinceIso)
    : new Date(windowEnd.getTime() - WEEK_MS);

  const { windowRows, allOpen } = await collectDigestRows(windowStart, windowEnd);
  const summary = summariseFeedback(windowRows, allOpen, windowStart, windowEnd);
  const subject = renderDigestSubject(summary);
  const html = renderDigestHtml(summary, appUrl());

  const recipient = options.to || env.FEEDBACK_DIGEST_TO;
  const base: DigestRunResult = { summary, subject, html, emailStatus: 'skipped' };
  if (recipient) base.recipient = recipient;

  if (options.send === false) {
    return { ...base, emailReason: 'send_disabled' };
  }
  if (!recipient) {
    return { ...base, emailReason: 'no_recipient' };
  }

  const sender = options.sender ?? (await defaultSender());
  if (!sender) {
    // TASK-MUMLF57HOYFSB: a digest with a recipient but no SMTP is not sent,
    // and in production that is a failure (plus a SystemAlert), not a quiet
    // 'skipped' that looks the same as "nobody to mail".
    const { reportMailNotConfigured } = await import('@/lib/email/mailer');
    await reportMailNotConfigured('feedback-digest');
    return {
      ...base,
      emailStatus: env.NODE_ENV === 'production' ? 'failed' : 'skipped',
      emailReason: NO_SMTP_CONFIG,
    };
  }

  try {
    await sender({ to: recipient, subject, html });
    return { ...base, emailStatus: 'sent' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown_error';
    logger.error('feedback digest email failed', error);
    return { ...base, emailStatus: 'failed', emailReason: reason };
  }
}
