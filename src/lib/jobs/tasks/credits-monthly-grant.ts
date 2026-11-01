import { defineJob, monthOf } from '../define';
import { prisma, withTenant, type TenantTx } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { CreditsMonthlyGrantOutputSchema, type CreditsMonthlyGrantOutput } from '../events';
import type { TenantRunner } from './alerts-daily';

/**
 * The per-tenant grant loop, lifted out of the job handler so it can be
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
/** `YYYY-MM` (UTC) of the month a grant run belongs to. */
export function creditGrantPeriod(at: Date = new Date()): string {
  return at.toISOString().slice(0, 7);
}

/**
 * A grant the old (Inngest) job wrote for `period`: `monthly_grant`, no
 * `refId`, no `grantPeriod`, created in that UTC month. The refId-less shape is
 * what separates it from the iyzico / Stripe activation grants, which also use
 * `monthly_grant` but always carry the payment or subscription id and must not
 * stand in for the scheduled grant.
 */
async function hasLegacyGrant(
  tx: TenantTx,
  tenantId: string,
  period: string
): Promise<boolean> {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const row = await tx.creditLedger.findFirst({
    where: {
      tenantId,
      reason: 'monthly_grant',
      refId: null,
      grantPeriod: null,
      createdAt: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * One grant per tenant per `period`, however often this runs (ADR-0008 §6.2,
 * TASK-MUMT3PGX5OK8P). The row carries `grantPeriod` and the table has
 * `@@unique([tenantId, grantPeriod])`, so the insert is ON CONFLICT DO NOTHING:
 * a retry, a manual re-run or two new workers on the same tick add no second
 * grant. It used to add one per run. A tenant that already has this month's
 * grant counts as `alreadyGrantedCount`, not as granted.
 *
 * The key does not see rows the old Inngest job wrote: those have no
 * `grantPeriod` (NULL, distinct to Postgres). credit-ledger-grant-period.sql
 * backfills the ones that existed when it ran; `hasLegacyGrant` covers one the
 * old job wrote after that (İNCELEME-38 B-1). What stays open is the old job
 * running AFTER this one in the same month: it cannot see this row, so the
 * deployment order in ADR-0008 §9.2 still applies to this job too.
 */
export async function grantCreditsToTenants(
  tenants: Array<{ id: string }>,
  runTenant: TenantRunner = withTenant,
  period: string = creditGrantPeriod()
): Promise<CreditsMonthlyGrantOutput> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error(`credits-monthly-grant: period must be YYYY-MM, got ${JSON.stringify(period)}`);
  }
  let grantedCount = 0;
  let alreadyGrantedCount = 0;
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
          if (await hasLegacyGrant(tx, tenantId, period)) {
            alreadyGrantedCount++;
            return;
          }
          const { count } = await tx.creditLedger.createMany({
            data: [
              {
                tenantId,
                delta: creditsToGrant,
                reason: 'monthly_grant',
                refId: `monthly_grant:${period}`,
                grantPeriod: period,
              },
            ],
            skipDuplicates: true,
          });
          if (count === 0) {
            alreadyGrantedCount++;
          } else {
            grantedCount++;
            totalCredits += creditsToGrant;
          }
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
    period,
    grantedCount,
    alreadyGrantedCount,
    failedCount,
    totalCreditsGranted: totalCredits,
  };

  if (errors.length > 0) {
    output.errors = errors;
  }

  return CreditsMonthlyGrantOutputSchema.parse(output);
}

/**
 * The tenants a monthly run grants to. A soft-deleted tenant (in its hold
 * before the purge) gets no grant, like the other fan-outs (topic-match,
 * embeddings, stale-reminder); a tenant restored mid-month is picked up by a
 * rerun with `payload.period` (TASK-MUO4GO5ARDY2W). Exported so the live test
 * runs these exact arguments against the database.
 */
export const GRANTABLE_TENANTS_QUERY = {
  where: { deletedAt: null },
  select: { id: true },
} as const;

/**
 * Credits Monthly Grant — 1st of month, 6 AM UTC.
 * Grants AI credits to active tenants based on their plan entitlements, for
 * the tick's month (`payload.period` on a job added by hand). A second run for
 * the same month grants nothing (see grantCreditsToTenants).
 */
export const creditsMonthlyGrantTask = defineJob(
  'credits-monthly-grant',
  async ({ payload, tick }): Promise<CreditsMonthlyGrantOutput> => {
    const period = typeof payload.period === 'string' ? payload.period : monthOf(tick);
    // Deliberately NOT tenant-scoped: this is the fan-out that discovers which
    // tenants exist, so no tenant id is known yet — the same intentional
    // exception as `fetch-saved-searches` in alerts-daily.ts. `Tenant` is the
    // table the scope is derived *from*; every query below it is scoped.
    const tenants = await prisma.tenant.findMany(GRANTABLE_TENANTS_QUERY);
    return grantCreditsToTenants(tenants, withTenant, period);
  }
);
