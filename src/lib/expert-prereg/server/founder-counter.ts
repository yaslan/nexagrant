import type { Prisma } from '@prisma/client';

/**
 * The founder numbers handed out so far (FO-50, K-568932 = A): the one row of
 * ExpertFounderCounter. The next number is this plus one and the seat count is
 * `FOUNDER_SEAT_LIMIT` minus this, so a pre-registration deleted by the one-year
 * purge never frees its number.
 *
 * The rows themselves still count: a founder number present on a row but missing
 * from the counter (a database built by `prisma db push` before the migration's
 * start value, or a row written by hand) is never handed out again either. The
 * caller holds a system scope; the writers hold EXPERT_PREREG_LOCK_KEY too.
 */
export async function lastFounderNumberGiven(tx: Prisma.TransactionClient): Promise<number> {
  const [counter, top] = await Promise.all([
    tx.expertFounderCounter.findUnique({ where: { id: 1 }, select: { lastNumber: true } }),
    tx.expertPreRegistration.aggregate({ _max: { founderNumber: true } }),
  ]);
  return Math.max(counter?.lastNumber ?? 0, top._max.founderNumber ?? 0);
}

/**
 * Raises the counter to `lastNumber`. Never lowers it and writes nothing when the
 * value is not higher (so `updatedAt` stays the moment a number was last given);
 * the database refuses a lowering UPDATE anyway (add-expert-founder-counter.sql).
 * Call under EXPERT_PREREG_LOCK_KEY.
 */
export async function recordFounderNumberGiven(tx: Prisma.TransactionClient, lastNumber: number): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "ExpertFounderCounter" ("id", "lastNumber", "updatedAt")
    VALUES (1, ${lastNumber}, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE
      SET "lastNumber" = EXCLUDED."lastNumber", "updatedAt" = EXCLUDED."updatedAt"
      WHERE EXCLUDED."lastNumber" > "ExpertFounderCounter"."lastNumber"`;
}
