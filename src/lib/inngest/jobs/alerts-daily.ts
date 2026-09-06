import { inngest } from '../client';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';
import { Resend } from 'resend';
import { AlertsDailyOutputSchema, type AlertsDailyOutput } from '../events';

let resend: Resend | null = null;
function getResend(): Resend | null {
  if (!resend && env.RESEND_API_KEY) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Alerts Daily — 8 AM UTC
 * Sends saved search alerts to subscribed users
 * Email delivery is async; failures are logged but don't block the job
 */
export const alertsDaily = inngest.createFunction(
  { id: 'alerts-daily', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }): Promise<AlertsDailyOutput> => {
    const savedSearches = await step.run('fetch-saved-searches', async () => {
      return await prisma.savedSearch.findMany({
        where: { notify: true },
        include: {
          tenant: true,
        },
      });
    });

    let emailsSent = 0;
    let emailsFailed = 0;
    const errors: Array<{ searchId: string; reason: string }> = [];

    for (const search of savedSearches) {
      await step.run(`send-alert-${search.id}`, async () => {
        try {
          const tenantMemberships = await prisma.membership.findMany({
            where: { tenantId: search.tenantId, role: 'TENANT_OWNER' },
            include: { user: true },
          });

          const ownerEmail = tenantMemberships[0]?.user?.email;
          if (!ownerEmail) {
            emailsFailed++;
            errors.push({ searchId: search.id, reason: 'no_owner_email' });
            return;
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
          const msg = error instanceof Error ? error.message : 'Unknown error';
          emailsFailed++;
          errors.push({ searchId: search.id, reason: msg });
        }
      });
    }

    const output: AlertsDailyOutput = {
      success: true,
      totalSearches: savedSearches.length,
      emailsSent,
      emailsFailed,
    };

    if (errors.length > 0) {
      output.errors = errors;
    }

    return AlertsDailyOutputSchema.parse(output);
  }
);
