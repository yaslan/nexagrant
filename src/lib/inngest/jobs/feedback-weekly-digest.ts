import { inngest } from '../client';
import { runFeedbackDigest } from '@/lib/feedback/digest-run';
import {
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
 * Delivery is best effort. With no RESEND_API_KEY or no recipient the job still
 * runs, still returns the counts, and reports emailStatus 'skipped', so the
 * numbers show up in the Inngest run history even before email is wired.
 */
export const feedbackWeeklyDigest = inngest.createFunction(
  { id: 'feedback-weekly-digest', triggers: [{ cron: '0 6 * * 1' }] },
  async ({ event, step }): Promise<FeedbackWeeklyDigestOutput> => {
    const data = (event?.data ?? {}) as { sinceIso?: string; to?: string };

    const result = await step.run('build-and-send-digest', async () => {
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
    });

    // 'skipped' (no key or no recipient) is the documented best-effort case
    // above; 'failed' means Resend refused the mail and is not a success.
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
