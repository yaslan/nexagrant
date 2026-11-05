import { picBudgetClient } from '@/lib/db';
import { PIC_UNSOLICITED_LOOKUPS_PER_DAY } from '@/lib/pic';
import { recordAlert, type AlertDbClient } from '@/lib/observability/system-alert';

/**
 * FO-389 — the daily budget of PIC-ownership questions that unsolicited accounts share.
 *
 * The count is a row in `PicLookupBudget`, not a variable: a restart does not forget it and N
 * processes add to the same number. The spend is one atomic upsert whose `WHERE` is the ceiling, so
 * two requests at the last slot cannot both get it and the count never passes the ceiling.
 */

/** `YYYY-MM-DD` of `at` in UTC: the day the budget is counted in. */
export function budgetDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Whole seconds from `at` to the next UTC midnight, when the budget starts again. */
export function secondsUntilNextBudgetDay(at: Date): number {
  const next = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - at.getTime()) / 1000));
}

/**
 * Takes one question out of today's shared budget. Returns null when it may be asked, or the seconds
 * until the budget renews when today's is spent. A spent budget stays spent: a refused call does not
 * touch the row.
 *
 * Works on a small pool of its own (`picBudgetClient`), not on the transaction that asks and not on
 * the application pool. The table has no RLS and no tenant, so the spend commits even if the profile
 * transaction is later rolled back: an asker cannot get a free look by making the save fail. And the
 * caller holds a connection of the application pool while it waits here, so asking that pool for a
 * second one let ten simultaneous questions take every connection of the process (FO-389 review B-1).
 * A failure to reach the database is thrown, not answered: the ceiling is never skipped.
 */
export async function spendUnsolicitedPicLookup(
  now: Date = new Date(),
  ceiling: number = PIC_UNSOLICITED_LOOKUPS_PER_DAY
): Promise<number | null> {
  // A ceiling of nothing spends nothing; the first insert below would otherwise always succeed.
  if (ceiling < 1) return secondsUntilNextBudgetDay(now);
  const client = picBudgetClient();
  const rows = await client.$queryRaw<{ count: number }[]>`
    INSERT INTO "PicLookupBudget" ("day", "count", "updatedAt")
    VALUES (${budgetDay(now)}, 1, ${now})
    ON CONFLICT ("day") DO UPDATE
      SET "count" = "PicLookupBudget"."count" + 1, "updatedAt" = ${now}
      WHERE "PicLookupBudget"."count" < ${ceiling}
    RETURNING "count"`;
  if (rows.length > 0) return null;
  await reportBudgetSpent(client as unknown as AlertDbClient, budgetDay(now), ceiling);
  return secondsUntilNextBudgetDay(now);
}

/** The days this process has already raised the alert for. Small: one entry a day, old ones dropped. */
const alertedDays = new Set<string>();

/** Forgets which days were alerted. For tests that need the alert twice on one day. */
export function resetPicBudgetAlertMemo(): void {
  alertedDays.clear();
}

/**
 * FO-389 (review Ö-3): when the day's budget is spent, new accounts without an invitation cannot save
 * a PIC until UTC midnight, and nothing told anyone. One `SystemAlert` a day: the process remembers
 * the day it raised it, and the alert's dedupe key folds the other processes' (and a restart's) into
 * the same open row.
 *
 * The alert says only that the day's ceiling was reached. No PIC and no tenant or user id goes into it:
 * `SystemAlert` has no row-level security, and the refused ask is the very thing the budget keeps
 * private. It is written on the budget's own pool for the reason `spendUnsolicitedPicLookup` is.
 */
async function reportBudgetSpent(client: AlertDbClient, day: string, ceiling: number): Promise<void> {
  if (alertedDays.has(day)) return;
  alertedDays.add(day);
  if (alertedDays.size > 3) for (const old of alertedDays) if (old < day) alertedDays.delete(old);
  const result = await recordAlert(
    {
      level: 'warn',
      source: 'pic-budget',
      message:
        'The shared daily PIC question budget for accounts without an invitation, pilot or plan is spent. ' +
        'Until UTC midnight those accounts cannot save a PIC; invited, pilot and paying tenants are not affected.',
      meta: { day, ceiling },
      dedupeKey: `pic-budget-spent:${day}`,
    },
    { client }
  );
  // A write that failed is tried again by the next refused ask, not lost for the day.
  if (result.status === 'failed') alertedDays.delete(day);
}
