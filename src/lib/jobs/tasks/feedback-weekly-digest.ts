import { defineJob } from '../define';
import { runFeedbackDigest } from '@/lib/feedback/digest-run';
import {
  FeedbackWeeklyDigestEventSchema,
  FeedbackWeeklyDigestOutputSchema,
  type FeedbackWeeklyDigestOutput,
} from '../events';

/**
 * E11.2 — weekly beta feedback digest, Mondays 06:00 UTC.
 *
 * A cron wrapper only: the reporting lives in src/lib/feedback/digest-run.ts so
 * it can be run and tested without a scheduler. Aggregation is cross-tenant on
 * purpose — the recipient is the platform admin running the beta programme.
 *
 * Delivery is best effort. With no recipient (or, outside production, no
 * SMTP_HOST) the job still runs, still returns the counts, and reports
 * emailStatus 'skipped', so the numbers show up in the worker log even
 * before email is wired. In production a missing SMTP_HOST is 'failed'.
 */
export const feedbackWeeklyDigestTask = defineJob(
  'feedback-weekly-digest',
  async ({ payload }): Promise<FeedbackWeeklyDigestOutput> => {
    // `sinceIso` / `to` only on a job added by hand; the cron sends neither.
    const data = FeedbackWeeklyDigestEventSchema.parse(payload);

    const result = await (async () => {
      const run = await runFeedbackDigest({
        ...(data.sinceIso ? { sinceIso: data.sinceIso } : {}),
        ...(data.to ? { to: data.to } : {}),
      });
      return {
        windowStart: run.summary.windowStart.toISOString(),
        windowEnd: run.summary.windowEnd.toISOString(),
        newCount: run.summary.newCount,
        openCount: run.summary.openCount,
        overdueCount: run.summary.overdueCount,
        byPriority: run.summary.byPriority,
        emailStatus: run.emailStatus,
        emailReason: run.emailReason,
      };
    })();

    // 'skipped' (no key or no recipient) is the documented best-effort case
    // above; 'failed' means the SMTP server refused the mail (or, in
    // production, SMTP is not configured) and is not a success.
    const output: FeedbackWeeklyDigestOutput = {
      success: result.emailStatus !== 'failed',
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      newCount: result.newCount,
      openCount: result.openCount,
      overdueCount: result.overdueCount,
      byPriority: result.byPriority,
      emailStatus: result.emailStatus,
    };
    if (result.emailReason) output.emailReason = result.emailReason;

    return FeedbackWeeklyDigestOutputSchema.parse(output);
  }
);
