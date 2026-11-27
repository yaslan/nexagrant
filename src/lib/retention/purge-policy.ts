import type { SystemTx } from '@/lib/system-scope';

/** Rows one purge statement deletes at a time (NG-375 B-2). Bounds lock time and WAL per statement. */
export const PURGE_BATCH_SIZE = 1000;

/**
 * The clock a nightly purge counts back from (NG-375, NG-366 sec-gnd B-1).
 *
 * Only the real clock may move a retention cutoff. A missing `now` is the real
 * clock; a `now` in the future is clamped to it, so no caller (a cron tick in the
 * payload, a hand-added job with `_cron.ts` in 2099) can reach rows that are not
 * yet past the window. A `now` in the past is kept: tests pin a fixed moment.
 * An invalid date is passed through so the cutoff function throws on it.
 */
export function purgeClock(now?: Date, realNow: Date = new Date()): Date {
  if (now === undefined) return realNow;
  if (Number.isNaN(now.getTime())) return now;
  return now.getTime() > realNow.getTime() ? realNow : now;
}

/**
 * Takes a transaction-scoped, NON-blocking advisory lock for one purge. A run
 * that finds the lock held by another run returns false and deletes nothing: the
 * other run is already doing the work, and a nightly job must not queue behind it.
 */
export async function tryPurgeLock(tx: SystemTx, key: bigint): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${key}) AS locked`;
  return rows[0]?.locked === true;
}

/**
 * Deletes matching rows in id-keyed batches of `batchSize` (NG-375 B-2). `findBatch`
 * returns up to `take` ids still matching the purge filter; `deleteIds` deletes
 * exactly those ids and returns how many went. Stops on a short batch, an empty
 * batch, or a batch where nothing was deleted (so a stuck filter cannot loop).
 */
export async function deleteInBatches(
  findBatch: (take: number) => Promise<Array<{ id: string }>>,
  deleteIds: (ids: string[]) => Promise<number>,
  batchSize: number = PURGE_BATCH_SIZE,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(`purge batch size must be a whole number >= 1, got ${batchSize}`);
  }
  let total = 0;
  for (;;) {
    const rows = await findBatch(batchSize);
    if (rows.length === 0) return total;
    const deleted = await deleteIds(rows.map((row) => row.id));
    total += deleted;
    if (deleted === 0 || rows.length < batchSize) return total;
  }
}
