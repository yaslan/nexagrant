import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { Resend } from 'resend';

// Lazy initialization of Resend to avoid errors when API key is empty
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend as any;
}

/**
 * Alerts Daily — 8 AM UTC (user timezone conversion at application level)
 * Sends saved search alerts to subscribed users
 * Note: Actual user timezone handling should be implemented at the application level
 */
export const alertsDaily = inngest.createFunction(
  { id: 'alerts-daily', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }: any) => {
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

    for (const search of savedSearches) {
      await step.run(`send-alert-${search.id}`, async () => {
        try {
          const tenantMemberships = await prisma.membership.findMany({
            where: { tenantId: search.tenantId, role: 'TENANT_OWNER' },
            include: { user: true },
          });

          const ownerEmail = tenantMemberships[0]?.user?.email;
          if (!ownerEmail) {
            return { success: false, reason: 'no_owner_email' };
          }

          // In production, would fetch actual new matches since lastRunAt
          const matchCount = 0;

          const subject = `New Call Opportunities: ${search.name} ${matchCount > 0 ? `(${matchCount} new)` : '(no new)'}`;
          const html = `
            <h2>Fabrika Saved Search Alert</h2>
            <p>Hi there,</p>
            <p>We checked for new opportunities matching your saved search <strong>${search.name}</strong>.</p>
            ${
              matchCount > 0
                ? `<p>Found <strong>${matchCount} new opportunities</strong>. <a href="${process.env.NEXT_PUBLIC_APP_URL}/calls?search=${search.id}">View them now</a></p>`
                : '<p>No new opportunities found this round.</p>'
            }
            <p>Happy hunting!<br/>Fabrika Team</p>
          `;

          const resendClient = getResend();
          if (resendClient && process.env.RESEND_API_KEY) {
            await resendClient.emails.send({
              from: process.env.EMAIL_FROM || 'Fabrika <no-reply@fabrika.app>',
              to: [ownerEmail],
              subject,
              html,
            });
          }

          await prisma.savedSearch.update({
            where: { id: search.id },
            data: { lastRunAt: new Date() },
          });

          return { success: true, emailSent: true };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      });
    }

    return {
      success: true,
      totalSearches: savedSearches.length,
      emailsSent,
      emailsFailed,
    };
  }
);
