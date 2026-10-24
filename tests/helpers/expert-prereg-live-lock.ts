import type { PrismaClient } from '@prisma/client';
import pg from 'pg';

/**
 * FO-45 (TASK-MVC6CTSCLO6LI): the two expert live files share one table and one
 * founder-number sequence. Vitest runs files in parallel, so the race file's
 * "gap-free from the number before the run" check could see a number taken by
 * the re-issue file. Each live file holds this session advisory lock for its
 * whole run, so they run one after the other. The lock is session-level: it
 * ends with the connection, so a crashed run cannot leave it held.
 */
const SERIAL_LOCK_KEY = '7302026019099';

/** Takes the lock on its own connection; the returned function releases it. */
export async function acquireExpertPreRegLiveLock(): Promise<() => Promise<void>> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('acquireExpertPreRegLiveLock: DATABASE_URL is not set');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('select pg_advisory_lock($1::bigint)', [SERIAL_LOCK_KEY]);
  return async () => {
    await client.query('select pg_advisory_unlock($1::bigint)', [SERIAL_LOCK_KEY]).catch(() => {});
    await client.end();
  };
}

/**
 * FO-50 (K-568932 = A): verifications raise the founder counter, and it never comes
 * down by itself, so a live file that numbers experts would use up the 100 seats of
 * the test database a few runs later. Call this with an OWNER client while holding
 * the lock above; the returned function puts the counter back as it was (no row → no row).
 *
 * The database refuses an UPDATE that lowers the counter, for the owner too (crw-fb
 * Ö-1), so the restore deletes the row and inserts the saved one. The app role has no
 * DELETE on the table: only an owner client can do this.
 */
export async function holdFounderCounter(db: PrismaClient): Promise<() => Promise<void>> {
  const saved = await db.expertFounderCounter.findUnique({ where: { id: 1 } });
  return async () => {
    await db.$transaction([
      db.expertFounderCounter.deleteMany({ where: { id: 1 } }),
      ...(saved ? [db.expertFounderCounter.create({ data: { id: 1, lastNumber: saved.lastNumber, updatedAt: saved.updatedAt } })] : []),
    ]);
  };
}
