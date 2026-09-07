import { inngest } from '../client';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';
import { Resend } from 'resend';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';
import { AlertsDailyOutputSchema, type AlertsDailyOutput } from '../events';

let resend: Resend | null = null;
function getResend(): Resend | null {
  if (!resend && env.RESEND_API_KEY) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * `SavedSearch` carries a bare `tenantId` scalar and declares no `tenant`
 * relation (prisma/schema.prisma). This job used to ask for
 * `include: { tenant: true }`, which Prisma rejects before it ever reaches the
 * database, so every 8 AM run died with a PrismaClientValidationError and not
 * one alert e-mail was ever sent. Nothing read `search.tenant` anyway.
 *
 * Exported so the unit test can hand these exact arguments to the real Prisma
 * client and prove the schema still accepts them — a mocked client cannot
 * catch this class of bug, which is why it survived.
 */
export const SAVED_SEARCH_ALERT_QUERY = {
  where: { notify: true },
  select: { id: true, tenantId: true, name: true },
} as const;

/**
 * The owner lookup, keyed by the scalar `tenantId` — the same "separate query
 * by scalar id" shape M2 uses where no relation exists. Only the address is
 * selected; the job has no use for the rest of the user row.
 */
export function ownerEmailQuery(tenantId: string) {
  return {
    where: { tenantId, role: 'TENANT_OWNER' },
    select: { user: { select: { email: true } } },
  } as const;
}

/**
 * Alerts Daily — 8 AM UTC
 * Sends saved search alerts to subscribed users.
 *
 * Per-search e-mail failures do not stop the run, but they are no longer
 * swallowed: the run ends by writing a `SystemAlert` naming the failed
 * searches (CLAUDE.md rule 6). A failure to read the searches at all is
 * alerted and then re-thrown — reporting `totalSearches: 0` for a query that
 * never ran would be a false success.
 */
export const alertsDaily = inngest.createFunction(
  { id: 'alerts-daily', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }): Promise<AlertsDailyOutput> => {
    const savedSearches = await step.run('fetch-saved-searches', async () => {
      try {
        return await prisma.savedSearch.findMany(SAVED_SEARCH_ALERT_QUERY);
      } catch (error) {
        await recordAlert({
          level: 'error',
          source: 'alerts-daily',
          message: `Saved-search fetch failed: ${errorMessage(error)}`,
        });
        throw error;
      }
    });

    // One step for the whole loop, as in credits-monthly-grant: counters
    // mutated across many memoized steps would replay back to zero.
    const result = await step.run('send-alerts', async () => {
      let emailsSent = 0;
      let emailsFailed = 0;
      const errors: Array<{ searchId: string; reason: string }> = [];

      for (const search of savedSearches) {
        try {
          const owners = await prisma.membership.findMany(ownerEmailQuery(search.tenantId));

          const ownerEmail = owners[0]?.user?.email;
          if (!ownerEmail) {
            emailsFailed++;
            errors.push({ searchId: search.id, reason: 'no_owner_email' });
            continue;
          }

          const matchCount = 0; // TODO: fetch actual new matches since lastRunAt

          const subject = `New Call Opportunities: ${search.name} ${matchCount > 0 ? `(${matchCount} new)` : '(no new)'}`;
          const appUrl = env.NEXT_PUBLIC_APP_URL || 'https://app.fabrika.io';
          const html = `
            <h2>Fabrika Saved Search Alert</h2>
            <p>Hi there,</p>
            <p>We checked for new opportunities matching your saved search <strong>${search.name}</strong>.</p>
            ${
              matchCount > 0
                ? `<p>Found <strong>${matchCount} new opportunities</strong>. <a href="${appUrl}/calls?search=${search.id}">View them now</a></p>`
                : '<p>No new opportunities found this round.</p>'
            }
            <p>Happy hunting!<br/>Fabrika Team</p>
          `;

          const resendClient = getResend();
          if (resendClient && env.RESEND_API_KEY) {
            await resendClient.emails.send({
              from: env.EMAIL_FROM || 'Fabrika <no-reply@fabrika.app>',
              to: [ownerEmail],
              subject,
              html,
            });
          }

          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { lastRunAt: new Date() },
          });

          emailsSent++;
        } catch (error) {
          emailsFailed++;
          errors.push({ searchId: search.id, reason: errorMessage(error) });
        }
      }

      return { emailsSent, emailsFailed, errors };
    });

    if (result.errors.length > 0) {
      // `SystemAlert` has no tenant isolation (see system-alert.ts): row ids
      // only, never the tenant id or the address the mail was going to.
      await step.run('record-failure-alert', async () => {
        await recordAlert({
          level: 'warn',
          source: 'alerts-daily',
          message: `${result.emailsFailed} of ${savedSearches.length} saved-search alerts failed`,
          meta: {
            emailsSent: result.emailsSent,
            emailsFailed: result.emailsFailed,
            failures: result.errors,
          },
        });
      });
    }

    const output: AlertsDailyOutput = {
      success: true,
      totalSearches: savedSearches.length,
      emailsSent: result.emailsSent,
      emailsFailed: result.emailsFailed,
    };

    if (result.errors.length > 0) {
      output.errors = result.errors;
    }

    return AlertsDailyOutputSchema.parse(output);
  }
);
