import { defineJob } from '../define';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { COOKIE_CONSENT_RETENTION_DAYS, purgeOldCookieConsents } from '@/lib/cookie-consent-retention';

/**
 * Cookie consent cleanup — nightly, 3:40 AM UTC (NG-366, NG-363 B-1).
 *
 * Deletes CookieConsentRecord rows older than COOKIE_CONSENT_RETENTION_DAYS
 * (1095, per row from its createdAt). Without this the anonymous, rate-limited
 * POST /api/cookie-consent endpoint could grow the table without bound. The
 * log line carries the count only, never a visitor id or choice.
 *
 * Nothing in the payload moves the window, not even the cron tick
 * (`_cron.ts`): the cutoff is always counted back from the real clock at run
 * time (NG-366 sec-gnd B-1). A tick is payload, and a hand-added job with a
 * tick in 2099 would otherwise reach every row written up to 2096. A late or
 * retried run therefore purges by the policy as it holds now, which is what a
 * retention rule means.
 *
 * A failure writes an `error` SystemAlert at once, because a retention promise
 * that silently stops being kept is what this job exists to prevent. The queue
 * then retries it (ADR-0008 §6.3).
 */
export const cookieConsentCleanupTask = defineJob('cookie-consent-cleanup', async () => {
  try {
    const result = await purgeOldCookieConsents();
    logger.info('[cookie-consent-cleanup] purged', {
      deletedCount: result.deletedCount,
      retentionDays: result.retentionDays,
      cutoff: result.cutoff,
    });
    return { success: true, ...result };
  } catch (error) {
    await recordAlert({
      level: 'error',
      source: 'cookie-consent-cleanup',
      message: `Cookie consent cleanup failed: ${errorMessage(error)}`,
      meta: { retentionDays: COOKIE_CONSENT_RETENTION_DAYS },
    });
    throw error;
  }
});
