import { inngest } from '../client';
import { prisma, withTenant } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { CreditsMonthlyGrantOutputSchema, type CreditsMonthlyGrantOutput } from '../events';
import type { TenantRunner } from './alerts-daily';

/**
 * The per-tenant grant loop, lifted out of the inngest handler so it can be
 * run against a real two-tenant fixture — the seam `sweepOrphanTenantAlerts`
 * (alerts-sweep.ts) already established in this directory.
 *
 * TASK-MTVR8KK92G0GA: the `creditLedger.create` below used to go through the
 * bare `prisma` singleton. `CreditLedger` carries a `tenant_isolation` policy
 * whose WITH CHECK is `"tenantId" = current_setting('app.tenant_id', true)`,
 * so under the production `fabrika_app` role (NOBYPASSRLS) an unscoped insert
 * is refused outright and every tenant lands in `errors` — on the 1st of the
 * month, at 6 AM, in a job with no human watching it. Locally the role is
 * SUPERUSER + BYPASSRLS, which is why it looked fine.
 */
export async function grantCreditsToTenants(
  tenants: Array<{ id: string }>,
  runTenant: TenantRunner = withTenant
): Promise<CreditsMonthlyGrantOutput> {
  let grantedCount = 0;
  let failedCount = 0;
  let totalCredits = 0;
  const errors: Array<{ tenantId: string; message: string }> = [];

  for (const tenant of tenants) {
    // Bound per iteration: the scope this row is written under and the
    // `tenantId` written into the row must be the same value, and both must
    // belong to THIS iteration. Reaching for an outer-scope id would not throw
    // — with RLS off it files one tenant's credits under another's.
    const tenantId = tenant.id;

    try {
      await runTenant(tenantId, async (tx) => {
        const entitlements = await getEntitlements(tenantId, tx);
        const creditsToGrant = entitlements.aiCreditsMonthly || 0;

        if (creditsToGrant > 0) {
          await tx.creditLedger.create({
            data: {
              tenantId,
              delta: creditsToGrant,
              reason: 'monthly_grant',
            },
          });
          grantedCount++;
          totalCredits += creditsToGrant;
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Failed to grant credits for tenant ${tenantId}:`, error);
      failedCount++;
      errors.push({ tenantId, message: msg });
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
}

/**
 * Credits Monthly Grant — 1st of month, 6 AM UTC
 * Grants AI credits to active tenants based on their plan entitlements
 */
export const creditsMonthlyGrant = inngest.createFunction(
  { id: 'credits-monthly-grant', triggers: [{ cron: '0 6 1 * *' }] },
  async ({ step }): Promise<CreditsMonthlyGrantOutput> => {
    // Deliberately NOT tenant-scoped: this is the fan-out that discovers which
    // tenants exist, so no tenant id is known yet — the same intentional
    // exception as `fetch-saved-searches` in alerts-daily.ts. `Tenant` is the
    // table the scope is derived *from*; every query below it is scoped.
    const tenants = await step.run('fetch-active-tenants', async () => {
      return await prisma.tenant.findMany({
        select: { id: true },
      });
    });

    return await step.run('grant-credits', async () => grantCreditsToTenants(tenants));
  }
);
