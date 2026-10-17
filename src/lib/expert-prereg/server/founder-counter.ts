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

/** Stores `lastNumber` as the counter. Call under EXPERT_PREREG_LOCK_KEY with a value from {@link lastFounderNumberGiven} or above it. */
export async function recordFounderNumberGiven(tx: Prisma.TransactionClient, lastNumber: number): Promise<void> {
  await tx.expertFounderCounter.upsert({
    where: { id: 1 },
    create: { id: 1, lastNumber },
    update: { lastNumber },
  });
}
