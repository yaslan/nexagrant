import { defineJob } from '../define';
import { appUrl } from '@/lib/app-url';
import { env } from '@/lib/env';
import { smtpMailer } from '@/lib/email/mailer';
import { recordAlert } from '@/lib/observability/system-alert';
import { sendStaleRelationshipReminders } from '@/lib/relationships/stale-reminder';
import { M4StaleRelationshipsOutputSchema, type M4StaleRelationshipsOutput } from '../events';

/**
 * M4 stale relationships — 07:00 UTC (10:00 Istanbul), daily. One digest per
 * focal point of the relationships they have not contacted for 60 days
 * (src/lib/relationships/stale-reminder.ts). Runs on the tick's time, so a
 * backfilled or retried run draws the same 60-day line.
 *
 * Without SMTP_HOST nothing is sent and nothing is stamped; the output says
 * `no_mail_provider`. That is an outage only in production, so only there it
 * becomes an `error` SystemAlert. A failed digest or tenant is a `warn` with
 * counts only.
 */
export const m4StaleRelationshipsTask = defineJob(
  'm4-stale-relationships',
  async ({ tick }): Promise<M4StaleRelationshipsOutput> => {
    const now = tick ?? new Date();
    const r = await sendStaleRelationshipReminders({ mailer: smtpMailer(), appUrl: appUrl(), now });

    if (r.reason === 'no_mail_provider' && env.NODE_ENV === 'production') {
      await recordAlert({
        level: 'error',
        source: 'm4-stale-relationships',
        message: `No mail provider (SMTP_HOST unset): ${r.relationshipsDue} stale-relationship reminders not sent`,
        meta: { due: r.relationshipsDue },
        dedupeKey: 'm4-stale-relationships:no-mail-provider',
      });
    }
    const failed = r.digestsFailed + r.tenantsFailed + r.errors.filter((e) => e.scope === 'stamp').length;
    if (failed > 0) {
      await recordAlert({
        level: 'warn',
        source: 'm4-stale-relationships',
        message: `${r.digestsFailed} digests, ${r.tenantsFailed} tenants and ${failed - r.digestsFailed - r.tenantsFailed} stamps failed`,
        meta: { digestsFailed: r.digestsFailed, tenantsFailed: r.tenantsFailed, sent: r.digestsSent },
        dedupeKey: 'm4-stale-relationships:failed',
      });
    }

    // The schema strips `errors`: failure messages stay out of the job log's summary.
    return M4StaleRelationshipsOutputSchema.parse({
      ...r,
      success: failed === 0 && r.reason === undefined,
      reason: r.reason ?? (failed > 0 ? 'send_failed' : undefined),
    });
  }
);
