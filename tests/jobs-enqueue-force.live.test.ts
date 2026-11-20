import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeWorkerUtils, type WorkerUtils } from 'graphile-worker';
import { Client } from 'pg';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * NG-266 — `enqueueJob(…, { force: true })` (`src/lib/jobs/enqueue.ts`).
 *
 * The `force` branch used to be `select graphile_worker.remove_job($1) … where key = $1
 * and locked_at is null`. The WHERE is evaluated when the row is read; `remove_job`
 * then deletes in its own statement. A worker that locks the row in between makes
 * `remove_job` skip the delete and fall through to its `update … set attempts =
 * max_attempts, key = null`: the running job loses its key and its retries, and the
 * re-queue adds a second copy. The same race NG-239 Ö-2 fixed in `replaceFailed`.
 *
 * Here the race is made deterministic: a second connection takes the row lock (as a
 * worker's `update … set locked_at` would) and holds it open while `force` runs.
 * `force` reads the row before the lock commits, then its DELETE waits on the lock.
 *
 * The DB is the one behind `DATABASE_URL`; the suite only touches
 * `graphile_worker._private_jobs` rows with its own key. Skips locally when no DB
 * is reachable, fails in CI (tests/helpers/live-db-role.ts).
 */

const SUITE = 'jobs-enqueue-force.live';
const URL = envValue('DATABASE_URL');
const JOB = 'credits-monthly-grant' as const;
const KEY = `${JOB}:manual`;

let utils: WorkerUtils | undefined;
let ready = false;

async function rows(c: WorkerUtils): Promise<Array<{ id: string; attempts: number; max_attempts: number; locked: boolean; key: string | null }>> {
  // Every row of this job, by task, not by key: a job whose key was cleared by a lost race is
  // still a row of this task.
  const sql = `select j.id::text as id, j.attempts, j.max_attempts, j.locked_at is not null as locked, j.key
               from graphile_worker._private_jobs j
               join graphile_worker._private_tasks t on t.id = j.task_id
               where t.identifier = $1 order by j.id`;
  return c.withPgClient(async (pc) => (await pc.query(sql, [JOB])).rows);
}

async function reset(): Promise<void> {
  await utils!.withPgClient((c) => c.query('delete from graphile_worker._private_jobs where task_id in (select id from graphile_worker._private_tasks where identifier = $1)', [JOB]));
}

async function insertQueued(): Promise<void> {
  await utils!.addJob(JOB, {}, { jobKey: KEY, jobKeyMode: 'unsafe_dedupe', maxAttempts: 5 });
}

/** Wait until a backend of this database is blocked on a lock inside graphile_worker. */
async function waitForLockWait(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await utils!.withPgClient((c) =>
      c.query<{ n: string }>(
        `select count(*)::text as n from pg_stat_activity
         where datname = current_database() and wait_event_type = 'Lock' and query ilike '%graphile_worker%'`
      )
    );
    if (Number(found.rows[0]?.n ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error('no backend blocked on the job row lock within the timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  if (!URL) {
    skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
    return;
  }
  try {
    utils = await makeWorkerUtils({ connectionString: URL });
    await utils.migrate();
    ready = true;
  } catch (e) {
    skipOrFailInCi(SUITE, `database unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }
});

afterAll(async () => {
  await utils?.release();
});

beforeEach(async () => {
  if (ready) await reset();
});

describe('enqueueJob force (NG-266)', () => {
  test('race: a job locked after force read it keeps its key and retries', async () => {
    if (!ready) return;
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    await insertQueued();

    // The running worker: takes the row lock and holds it until `force` has read the row.
    const holder = new Client({ connectionString: URL });
    await holder.connect();
    try {
      await holder.query('begin');
      await holder.query(
        `update graphile_worker._private_jobs set locked_at = now(), locked_by = 'ng266-holder', attempts = attempts + 1
         where key = $1`,
        [KEY]
      );
      const forced = enqueueJob(JOB, {}, { force: true, connectionString: URL });
      await waitForLockWait();
      await holder.query('commit');
      await forced;
    } finally {
      await holder.end();
    }

    const after = await rows(utils!);
    // The running job is the only row of the task: still keyed, still locked, first attempt.
    expect(after).toEqual([expect.objectContaining({ key: KEY, locked: true, attempts: 1, max_attempts: 5 })]);
  });

  test('a job locked before force runs is left alone (kept, not re-queued)', async () => {
    if (!ready) return;
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    await insertQueued();
    await utils!.withPgClient((c) =>
      c.query(`update graphile_worker._private_jobs set locked_at = now(), locked_by = 'ng266-run', attempts = 1 where key = $1`, [KEY])
    );

    const result = await enqueueJob(JOB, {}, { force: true, connectionString: URL });

    expect(result.added).toBe(false);
    expect(await rows(utils!)).toEqual([
      expect.objectContaining({ key: KEY, locked: true, attempts: 1, max_attempts: 5 }),
    ]);
  });

  test('an unlocked job is replaced: the old row goes, one fresh row is queued', async () => {
    if (!ready) return;
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    await insertQueued();
    await utils!.withPgClient((c) =>
      c.query(`update graphile_worker._private_jobs set attempts = 5 where key = $1`, [KEY])
    );

    const result = await enqueueJob(JOB, {}, { force: true, connectionString: URL });

    expect(result.added).toBe(true);
    expect(await rows(utils!)).toEqual([
      expect.objectContaining({ key: KEY, locked: false, attempts: 0, max_attempts: 5 }),
    ]);
  });
});
