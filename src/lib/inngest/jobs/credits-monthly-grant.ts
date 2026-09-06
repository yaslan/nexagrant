import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { CreditsMonthlyGrantOutputSchema, type CreditsMonthlyGrantOutput } from '../events';

/**
 * Credits Monthly Grant — 1st of month, 6 AM UTC
 * Grants AI credits to active tenants based on their plan entitlements
 */
export const creditsMonthlyGrant = inngest.createFunction(
  { id: 'credits-monthly-grant', triggers: [{ cron: '0 6 1 * *' }] },
  async ({ step }): Promise<CreditsMonthlyGrantOutput> => {
    const tenants = await step.run('fetch-active-tenants', async () => {
      return await prisma.tenant.findMany({
        select: { id: true },
      });
    });

    const result = await step.run('grant-credits', async () => {
      let grantedCount = 0;
      let failedCount = 0;
      let totalCredits = 0;
      const errors: Array<{ tenantId: string; message: string }> = [];

      for (const tenant of tenants) {
        try {
          const entitlements = await getEntitlements(tenant.id);
          const creditsToGrant = entitlements.aiCreditsMonthly || 0;

          if (creditsToGrant > 0) {
            await prisma.creditLedger.create({
              data: {
                tenantId: tenant.id,
                delta: creditsToGrant,
                reason: 'monthly_grant',
              },
            });
            grantedCount++;
            totalCredits += creditsToGrant;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`Failed to grant credits for tenant ${tenant.id}:`, error);
          failedCount++;
          errors.push({ tenantId: tenant.id, message: msg });
        }
      }

      const output: CreditsMonthlyGrantOutput = {
        success: true,
        totalTenants: tenants.length,
        grantedCount,
        failedCount,
        totalCreditsGranted: totalCredits,
      };

      if (errors.length > 0) {
        output.errors = errors;
      }

      return CreditsMonthlyGrantOutputSchema.parse(output);
    });

    return result;
  }
);
