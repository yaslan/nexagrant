import { prisma } from '@/lib/db';
import { PIC_UNSOLICITED_LOOKUPS_PER_DAY } from '@/lib/pic';

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
 * Works on the app's own connection (the table has no RLS and no tenant), so the spend commits even
 * if the profile transaction that asked for it is later rolled back: an asker cannot get a free
 * look by making the save fail.
 */
export async function spendUnsolicitedPicLookup(
  now: Date = new Date(),
  ceiling: number = PIC_UNSOLICITED_LOOKUPS_PER_DAY
): Promise<number | null> {
  // A ceiling of nothing spends nothing; the first insert below would otherwise always succeed.
  if (ceiling < 1) return secondsUntilNextBudgetDay(now);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "PicLookupBudget" ("day", "count", "updatedAt")
    VALUES (${budgetDay(now)}, 1, ${now})
    ON CONFLICT ("day") DO UPDATE
      SET "count" = "PicLookupBudget"."count" + 1, "updatedAt" = ${now}
      WHERE "PicLookupBudget"."count" < ${ceiling}
    RETURNING "count"`;
  return rows.length > 0 ? null : secondsUntilNextBudgetDay(now);
}
