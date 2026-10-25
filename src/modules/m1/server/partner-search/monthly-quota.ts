import { withTenant, type TenantTx } from '@/lib/db';

/**
 * FO-41 — the monthly partner-search allowance of a limited M1 (Discover,
 * Basic, TTO Edition: `ModuleLimits.partnerSearchPerMonth` in
 * src/lib/billing/catalog.ts). Counted in `PartnerSearchQuotaUsage`, one row
 * per tenant per UTC month, inside `withTenant` so RLS scopes the row.
 */

/** The counter's month key, `YYYY-MM` in UTC — the column's documented form. */
export function quotaMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export interface PartnerSearchQuota {
  /** False when the search was refused because the month is used up. */
  allowed: boolean;
  /** Searches counted this month, including this one when it was allowed. */
  used: number;
  limit: number;
}

/**
 * Counts one search against the month, or refuses it when `limit` is reached.
 *
 * One statement, so two concurrent searches cannot both take the last slot:
 * the conflict branch only increments while `count < limit`, and returns no
 * row when it does not. The refused search is not counted.
 */
export async function consumePartnerSearch(
  tenantId: string,
  limit: number,
  now: Date = new Date()
): Promise<PartnerSearchQuota> {
  const month = quotaMonth(now);
  return withTenant(tenantId, async (tx) => {
    if (limit <= 0) {
      return { allowed: false, used: await usedThisMonth(tx, tenantId, month), limit };
    }
    const rows = await tx.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "PartnerSearchQuotaUsage" ("id", "tenantId", "month", "count", "updatedAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${month}, 1, now())
      ON CONFLICT ("tenantId", "month")
      DO UPDATE SET "count" = "PartnerSearchQuotaUsage"."count" + 1, "updatedAt" = now()
      WHERE "PartnerSearchQuotaUsage"."count" < ${limit}
      RETURNING "count"`;
    const counted = rows[0];
    if (counted) return { allowed: true, used: Number(counted.count), limit };
    return { allowed: false, used: await usedThisMonth(tx, tenantId, month), limit };
  });
}

async function usedThisMonth(
  tx: TenantTx,
  tenantId: string,
  month: string
): Promise<number> {
  const row = await tx.partnerSearchQuotaUsage.findUnique({
    where: { tenantId_month: { tenantId, month } },
    select: { count: true },
  });
  return row?.count ?? 0;
}
