/**
 * E11.2 — the one path a beta report takes into the system.
 *
 * Order matters and is deliberate:
 *   1. triage (pure, cannot fail)
 *   2. persist the row  <- record of truth
 *   3. store the screenshot (best effort)
 *   4. raise a SystemAlert (best effort) and stamp the result back
 *
 * Steps 3 and 4 never fail the submission. A partner who hits "send" during an
 * object-storage outage still has their report, and the digest still counts it.
 *
 * Step 4 used to POST to a third-party error tracker. It now writes to the
 * SystemAlert table read by /[locale]/admin/alerts — same "amplifier, not record
 * of truth" contract, nothing leaving the deployment. SystemAlert has no tenant
 * column and no RLS policy, so the alert carries only non-identifying triage
 * facts plus the feedback id; the report's own text stays in the RLS-protected
 * Feedback row.
 */

import { withTenant } from '@/lib/db';
import { putObjectToR2 } from '@/lib/storage';
import { recordAlert, type AlertLevel } from '@/lib/observability/system-alert';
import { logger } from '@/lib/logger';
import {
  triageFeedback,
  PRIORITY_SLA_HOURS,
  type FeedbackCategoryValue,
  type FeedbackImpactValue,
  type FeedbackPriorityValue,
} from './triage';

/** The `source` every beta-report alert carries. Filterable in the admin console. */
export const FEEDBACK_ALERT_SOURCE = 'beta-feedback';

/** Raised separately when a screenshot was supplied but could not be stored. */
export const FEEDBACK_SCREENSHOT_ALERT_SOURCE = 'beta-feedback-screenshot';

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

/**
 * What happened to the attachment. `none` = none was offered. The reporter is
 * told when it is `not_stored`: R2 is now the only place a screenshot can live
 * (the old tracker took it as an attachment), so a failure there is a real loss
 * and must be visible rather than buried in a server log.
 */
export type ScreenshotOutcome = 'none' | 'stored' | 'not_stored';

export interface SubmitFeedbackResult {
  id: string;
  priority: string;
  triageReason: string;
  slaHours: number;
  screenshotStored: boolean;
  screenshotOutcome: ScreenshotOutcome;
  alertStatus: string;
  alertId?: string;
}

/**
 * SystemAlert.level accepts info|warn|error only — there is no `fatal`, so a P0
 * maps to `error` and is distinguished from a P1 by the priority in the message
 * and in `meta`, not by an invented level.
 */
export function feedbackAlertLevel(priority: FeedbackPriorityValue): AlertLevel {
  switch (priority) {
    case 'P0':
    case 'P1':
      return 'error';
    case 'P2':
      return 'warn';
    default:
      return 'info';
  }
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

  const created = await withTenant(input.tenantId, (tx) =>
    tx.feedback.create({
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
    })
  );

  let screenshotKey: string | null = null;
  let screenshotOutcome: ScreenshotOutcome = 'none';
  if (input.screenshot) {
    const key = screenshotObjectKey(input.tenantId, created.id, input.screenshot.contentType);
    const put = await putObjectToR2(key, input.screenshot.data, input.screenshot.contentType);
    if (put.stored) {
      screenshotKey = key;
      screenshotOutcome = 'stored';
    } else {
      // R2 is now the only home for the image. Losing it silently is not an
      // option: the reporter is told in the response, and an operator sees it
      // in the alert console.
      screenshotOutcome = 'not_stored';
      logger.warn('feedback screenshot not stored in R2', {
        feedbackId: created.id,
        reason: put.reason,
      });
      await recordAlert({
        level: 'warn',
        source: FEEDBACK_SCREENSHOT_ALERT_SOURCE,
        message: `Beta feedback screenshot could not be stored (${put.reason ?? 'unknown'}). The report itself was saved.`,
        meta: { feedbackId: created.id, reason: put.reason },
      });
    }
  }

  // Non-identifying by construction: priority, category and impact are closed
  // enumerations, `feedbackId` is an opaque handle into the RLS-protected
  // table. No title, body, page URL, reporter or tenant id — see the module
  // header in src/lib/observability/system-alert.ts.
  const alert = await recordAlert({
    level: feedbackAlertLevel(verdict.priority),
    source: FEEDBACK_ALERT_SOURCE,
    message: `Beta feedback ${verdict.priority} · ${input.category} · ${input.impact}`,
    meta: {
      feedbackId: created.id,
      priority: verdict.priority,
      category: input.category,
      impact: input.impact,
      locale: input.locale ?? 'tr',
      triageReason: verdict.reason,
      slaHours: PRIORITY_SLA_HOURS[verdict.priority],
      screenshot: screenshotOutcome,
    },
  });

  // Stamping the outcome back is bookkeeping, not the submission. The report is
  // already persisted and the alert already raised, so a failure here must not
  // turn a saved report into a user-visible error — the same promise steps 3 and
  // 4 make. (Observed for real: a stale client rejected the renamed columns and
  // the reporter was told their report had not been saved, when it had.)
  //
  // A second `withTenant` rather than one spanning the whole function: steps 3
  // and 4 above are network calls (R2, the alert writer), and holding a
  // database transaction open across them would trade a bookkeeping risk for a
  // connection-pool one. The documented order — persist, screenshot, alert,
  // stamp — is unchanged.
  //
  // Note this `where` carries only `id`, not `tenantId` (the id is one this
  // function just minted for this tenant, so it is not caller-supplied). The
  // scope opened here is what confines the update to the tenant's own rows;
  // see the task report §4.
  try {
    await withTenant(input.tenantId, (tx) =>
      tx.feedback.update({
        where: { id: created.id },
        data: {
          screenshotKey,
          alertStatus: alert.status,
          alertId: alert.id ?? null,
        },
      })
    );
  } catch (error) {
    logger.error('feedback outcome stamp failed; the report itself is saved', error, {
      feedbackId: created.id,
    });
    await recordAlert({
      level: 'warn',
      source: FEEDBACK_ALERT_SOURCE,
      message: 'Beta feedback row saved but its alert/screenshot outcome could not be stamped back.',
      meta: { feedbackId: created.id },
    });
  }

  const result: SubmitFeedbackResult = {
    id: created.id,
    priority: verdict.priority,
    triageReason: verdict.reason,
    slaHours: PRIORITY_SLA_HOURS[verdict.priority],
    screenshotStored: screenshotKey !== null,
    screenshotOutcome,
    alertStatus: alert.status,
  };
  if (alert.id) result.alertId = alert.id;
  return result;
}
