/**
 * E11.2 — the one path a beta report takes into the system.
 *
 * Order matters and is deliberate:
 *   1. triage (pure, cannot fail)
 *   2. persist the row  <- record of truth
 *   3. store the screenshot (best effort)
 *   4. forward to Sentry (best effort) and stamp the result back
 *
 * Steps 3 and 4 never fail the submission. A partner who hits "send" during a
 * Sentry or R2 outage still has their report, and the digest still counts it.
 */

import { prisma } from '@/lib/db';
import { putObjectToR2 } from '@/lib/storage';
import { captureToSentry } from '@/lib/observability/sentry';
import { logger } from '@/lib/logger';
import {
  triageFeedback,
  PRIORITY_SLA_HOURS,
  type FeedbackCategoryValue,
  type FeedbackImpactValue,
} from './triage';

export interface FeedbackScreenshot {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface SubmitFeedbackInput {
  tenantId: string;
  userId?: string | null;
  userEmail?: string | null;
  workspaceSlug?: string | null;
  category: FeedbackCategoryValue;
  impact: FeedbackImpactValue;
  title: string;
  body: string;
  pageUrl?: string | null;
  userAgent?: string | null;
  locale?: string;
  appVersion?: string | null;
  screenshot?: FeedbackScreenshot | null;
}

export interface SubmitFeedbackResult {
  id: string;
  priority: string;
  triageReason: string;
  slaHours: number;
  screenshotStored: boolean;
  sentryStatus: string;
  sentryEventId?: string;
}

/** `feedback/<tenantId>/<yyyy>/<id>.<ext>` — tenant-prefixed like every other key. */
export function screenshotObjectKey(
  tenantId: string,
  feedbackId: string,
  contentType: string
): string {
  const ext = contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
  return `feedback/${tenantId}/${new Date().getFullYear()}/${feedbackId}.${ext}`;
}

export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<SubmitFeedbackResult> {
  const verdict = triageFeedback({
    category: input.category,
    impact: input.impact,
    title: input.title,
    body: input.body,
  });

  const created = await prisma.feedback.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      workspaceSlug: input.workspaceSlug ?? null,
      category: input.category as never,
      impact: input.impact as never,
      priority: verdict.priority as never,
      autoPriority: verdict.priority as never,
      status: 'NEW' as never,
      title: input.title,
      body: input.body,
      triageReason: verdict.reason,
      pageUrl: input.pageUrl ?? null,
      userAgent: input.userAgent ?? null,
      appVersion: input.appVersion ?? null,
      locale: input.locale ?? 'tr',
    },
    select: { id: true },
  });

  let screenshotKey: string | null = null;
  if (input.screenshot) {
    const key = screenshotObjectKey(input.tenantId, created.id, input.screenshot.contentType);
    const put = await putObjectToR2(key, input.screenshot.data, input.screenshot.contentType);
    if (put.stored) {
      screenshotKey = key;
    } else {
      // Not an error the partner should see: the image still rides along to
      // Sentry as an attachment below.
      logger.warn('feedback screenshot not stored in R2', {
        feedbackId: created.id,
        reason: put.reason,
      });
    }
  }

  const delivery = await captureToSentry({
    message: `[${verdict.priority}] ${input.title}`,
    level: verdict.priority === 'P0' ? 'fatal' : verdict.priority === 'P1' ? 'error' : 'warning',
    // Group by category+priority so the beta does not open 200 unrelated issues.
    fingerprint: ['beta-feedback', input.category, verdict.priority],
    tags: {
      source: 'beta-feedback',
      category: input.category,
      impact: input.impact,
      priority: verdict.priority,
      tenant_id: input.tenantId,
      locale: input.locale ?? 'tr',
    },
    extra: {
      feedbackId: created.id,
      body: input.body,
      pageUrl: input.pageUrl ?? undefined,
      userAgent: input.userAgent ?? undefined,
      triageReason: verdict.reason,
      slaHours: PRIORITY_SLA_HOURS[verdict.priority],
      screenshotKey: screenshotKey ?? undefined,
    },
    user: {
      id: input.userId ?? undefined,
      email: input.userEmail ?? undefined,
    },
    attachment: input.screenshot
      ? {
          filename: input.screenshot.filename,
          contentType: input.screenshot.contentType,
          data: input.screenshot.data,
        }
      : undefined,
  });

  await prisma.feedback.update({
    where: { id: created.id },
    data: {
      screenshotKey,
      sentryStatus: delivery.status,
      sentryEventId: delivery.eventId ?? null,
    },
  });

  const result: SubmitFeedbackResult = {
    id: created.id,
    priority: verdict.priority,
    triageReason: verdict.reason,
    slaHours: PRIORITY_SLA_HOURS[verdict.priority],
    screenshotStored: screenshotKey !== null,
    sentryStatus: delivery.status,
  };
  if (delivery.eventId) result.sentryEventId = delivery.eventId;
  return result;
}
