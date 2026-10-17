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
