import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeWorkerUtils, type WorkerUtils } from 'graphile-worker';
import { Client } from 'pg';
import { envValue } from './helpers/dotenv';
import { isThrowawayDbName, skipOrFailInCi, usedDatabaseName, type RawQueryable } from './helpers/live-db-role';

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
 * Here the race is made deterministic: a holder connection takes the row lock (as a
 * worker's `update … set locked_at` would) and keeps it open while `force` runs.
 * `force` reads the row before the lock commits, then its DELETE waits on the lock.
 *
 * Scope on the database behind `DATABASE_URL` (it may be a shared dev database):
 *  - the suite writes only on a throwaway database (`isThrowawayDbName`): `fabrika_test` or
 *    `fabrika_test_ng<n>`, the isolated gate's `fabrika_gate`, or CI's `fabrika` on a GitHub runner
 *    (GITHUB_ACTIONS and CI both true). Any other name stops the suite in `beforeAll`, before
 *    migrate or reset;
 *  - `reset()` deletes only rows whose key is `KEY` or `FOREIGN_KEY` and that are NOT locked
 *    (`locked_at is null`): a running job of the product key is never removed (NG-266);
 *  - a row a test locks is unlocked and deleted by that test, on the connection that locked it,
 *    so no leftover lock reaches the next test. Two tests lock with an autocommit UPDATE (the
 *    committed `locked_at` is the state under test, a transaction would change what `force` sees),
 *    so a process killed before `finally` (SIGKILL) leaves that row locked (NG-283, measured: every
 *    later run failed). `beforeEach` removes such a row when it carries this suite's `locked_by`
 *    marker (`ng266-`) and no backend of this suite's holder connection is alive (`removeOwnDeadLock`);
 *    a locked row of any other kind still stops the suite, with the command to inspect it;
 *  - assertions read only rows created by the test (id greater than the largest id seen
 *    before it), so a foreign row of the same task is never counted or changed;
 *  - the waiting is confirmed by `pg_blocking_pids` naming the holder's backend, so a
 *    lock held by another session cannot end the wait early.
 * Skips locally when no DB is reachable, fails in CI (tests/helpers/live-db-role.ts).
 */

const SUITE = 'jobs-enqueue-force.live';
const DB_URL = envValue('DATABASE_URL');
const JOB = 'credits-monthly-grant' as const;
const KEY = `${JOB}:manual`;
const FOREIGN_KEY = `${JOB}:ng266-foreign`;
const HOLDER_APP = 'ng266-holder';
const FORCE_APP = 'ng266-force';

type Row = { id: string; attempts: number; max_attempts: number; locked: boolean; key: string | null };

let utils: WorkerUtils | undefined;
let ready = false;
let maxIdBefore = 0;

/** The DATABASE_URL with an application_name, so the force connection can be told apart. */
function urlAs(appName: string): string {
  const u = new URL(DB_URL!);
  u.searchParams.set('application_name', appName);
  return u.toString();
}

/** Rows of this job's task created after `maxIdBefore` (i.e. by this test). */
async function rowsCreatedByTest(): Promise<Row[]> {
  const sql = `select j.id::text as id, j.attempts, j.max_attempts, j.locked_at is not null as locked, j.key
               from graphile_worker._private_jobs j
               join graphile_worker._private_tasks t on t.id = j.task_id
               where t.identifier = $1 and j.id > $2 order by j.id`;
  return utils!.withPgClient(async (pc) => (await pc.query<Row>(sql, [JOB, maxIdBefore])).rows);
}

async function largestJobId(): Promise<number> {
  return utils!.withPgClient(async (pc) => {
    const r = await pc.query<{ m: string }>('select coalesce(max(id), 0)::text as m from graphile_worker._private_jobs');
    return Number(r.rows[0]?.m ?? 0);
  });
}

/**
 * Deletes only the unlocked rows under the two keys this suite uses; never another key of the
 * task, and never a locked row (a running job), even one under `KEY`.
 */
async function reset(): Promise<void> {
  await utils!.withPgClient((c) =>
    c.query(
      'delete from graphile_worker._private_jobs where key = any($1::text[]) and locked_at is null',
      [[KEY, FOREIGN_KEY]]
    )
  );
}

/**
 * A suite process killed between its autocommit lock and `finally` leaves a locked row that carries
 * this suite's `locked_by` marker. It is this suite's own residue, and safe to delete, only when no
 * holder connection of this suite is alive (a concurrent run's holder is). A row locked by anything
 * else, such as a real worker, is never touched. Returns how many rows it removed.
 */
async function removeOwnDeadLock(): Promise<number> {
  const r = await utils!.withPgClient((c) =>
    c.query(
      `delete from graphile_worker._private_jobs
       where key = any($1::text[]) and locked_at is not null and locked_by like 'ng266-%'
         and not exists (select 1 from pg_stat_activity where application_name = $2)`,
      [[KEY, FOREIGN_KEY], HOLDER_APP]
    )
  );
  return r.rowCount ?? 0;
}

/** Unlocks and deletes a row this test created, on the connection that locked it. */
async function releaseOwnRow(client: Client, id: string): Promise<void> {
  await client.query('update graphile_worker._private_jobs set locked_at = null, locked_by = null where id = $1', [id]);
  await client.query('delete from graphile_worker._private_jobs where id = $1', [id]);
}


async function insertQueued(key = KEY): Promise<string> {
  const job = await utils!.addJob(JOB, {}, { jobKey: key, jobKeyMode: 'unsafe_dedupe', maxAttempts: 5 });
  return String(job.id);
}

/** Wait until the force connection is blocked on a lock held by `holderPid`. */
async function waitForForceBlockedBy(holderPid: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await utils!.withPgClient((c) =>
      c.query<{ n: string }>(
        `select count(*)::text as n from pg_stat_activity
         where application_name = $1 and wait_event_type = 'Lock' and $2 = any(pg_blocking_pids(pid))`,
        [FORCE_APP, holderPid]
      )
    );
    if (Number(found.rows[0]?.n ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error('force connection never blocked on the holder lock within the timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  if (!DB_URL) {
    skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
    return;
  }
  // Read-only identity check FIRST, on a plain pg connection: makeWorkerUtils creates the
  // graphile_worker schema on connect (measured, NG-266), so it must come after the refusal.
  const probe = new Client({ connectionString: DB_URL });
  try {
    await probe.connect();
  } catch (e) {
    skipOrFailInCi(SUITE, `database unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  let name: string | undefined;
  try {
    const identity: RawQueryable = {
      $queryRawUnsafe: async <T = unknown>(query: string): Promise<T> => (await probe.query(query)).rows as T,
    };
    // Unreadable identity is a skip locally and a throw in CI (helper).
    name = await usedDatabaseName(identity, identity, SUITE);
  } finally {
    await probe.end();
  }
  if (name === undefined) return;
  if (!isThrowawayDbName(name)) {
    throw new Error(
      `${SUITE}: refusing to write on database "${name}": it is not a test or isolated-gate database ` +
        '(the shared dev database is "fabrika"). Point DATABASE_URL at `fabrika_test` or `fabrika_test_ng<number>` ' +
        '(or run `pnpm gate:isolated`, whose database is `fabrika_gate`).'
    );
  }
  try {
    utils = await makeWorkerUtils({ connectionString: DB_URL });
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
  if (!ready) return;
  await removeOwnDeadLock();
  await reset();
  // A locked row under the product key that this suite did not create (a running job) is left in
  // place by reset(). enqueueJob would then dedupe its own insert into that row, so the suite cannot
  // tell its rows apart: stop, and leave the row untouched.
  const locked = await utils!.withPgClient((c) =>
    c.query<{ n: string }>('select count(*)::text as n from graphile_worker._private_jobs where key = $1 and locked_at is not null', [KEY])
  );
  if (Number(locked.rows[0]?.n) > 0) {
    throw new Error(`${SUITE}: a locked job under "${KEY}" is on this database (not created by this suite); left untouched, suite stopped. ` +
        `Inspect: select id, locked_by, locked_at from graphile_worker._private_jobs where key = '${KEY}' and locked_at is not null; ` +
        `a leftover of this suite has locked_by 'ng266-run' or 'ng266-holder': delete from graphile_worker._private_jobs where id = <id>`
    );
  }
  maxIdBefore = await largestJobId();
});

describe('enqueueJob force (NG-266)', () => {
  test('race: a job locked after force read it keeps its key and retries', async () => {
    if (!ready) return;
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    const id = await insertQueued();

    // The running worker: takes the row lock and holds it until `force` is blocked on it.
    const holder = new Client({ connectionString: urlAs(HOLDER_APP) });
    await holder.connect();
    try {
      const pid = Number((await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]?.pid);
      await holder.query('begin');
      await holder.query(
        `update graphile_worker._private_jobs set locked_at = now(), locked_by = 'ng266-holder', attempts = attempts + 1
         where id = $1`,
        [id]
      );
      const forced = enqueueJob(JOB, {}, { force: true, connectionString: urlAs(FORCE_APP) });
      await waitForForceBlockedBy(pid);
      await holder.query('commit');
      await forced;

      // Only the running job: still keyed, still locked, first attempt, no second copy.
      expect(await rowsCreatedByTest()).toEqual([
        expect.objectContaining({ id, key: KEY, locked: true, attempts: 1, max_attempts: 5 }),
      ]);
    } finally {
      await releaseOwnRow(holder, id);
      await holder.end();
    }
  });

  test('a job locked before force runs is left alone (kept, not re-queued)', async () => {
    if (!ready) return;
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    const id = await insertQueued();
    const holder = new Client({ connectionString: urlAs(HOLDER_APP) });
    await holder.connect();
    try {
      await holder.query(
        `update graphile_worker._private_jobs set locked_at = now(), locked_by = 'ng266-run', attempts = 1 where id = $1`,
        [id]
      );

      const result = await enqueueJob(JOB, {}, { force: true, connectionString: urlAs(FORCE_APP) });

      expect(result.added).toBe(false);
      expect(await rowsCreatedByTest()).toEqual([
        expect.objectContaining({ id, key: KEY, locked: true, attempts: 1, max_attempts: 5 }),
      ]);
    } finally {
      await releaseOwnRow(holder, id);
      await holder.end();
    }
  });

  test('reset() leaves a locked row of the product key in place', async () => {
    if (!ready) return;
    const id = await insertQueued();
    const holder = new Client({ connectionString: urlAs(HOLDER_APP) });
    await holder.connect();
    try {
      await holder.query(
        `update graphile_worker._private_jobs set locked_at = now(), locked_by = 'ng266-run', attempts = 1 where id = $1`,
        [id]
      );

      await reset();

      const left = await utils!.withPgClient((c) =>
        c.query<{ n: string }>('select count(*)::text as n from graphile_worker._private_jobs where id = $1', [id])
      );
      expect(Number(left.rows[0]?.n)).toBe(1);
    } finally {
      await releaseOwnRow(holder, id);
      await holder.end();
    }
  });

  test('an unlocked job is replaced: the old row goes, one fresh row is queued', async () => {
    if (!ready) return;
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    const oldId = await insertQueued();
    await utils!.withPgClient((c) =>
      c.query(`update graphile_worker._private_jobs set attempts = 5 where id = $1`, [oldId])
    );

    const result = await enqueueJob(JOB, {}, { force: true, connectionString: urlAs(FORCE_APP) });

    expect(result.added).toBe(true);
    const rows = await rowsCreatedByTest();
    expect(rows).toEqual([expect.objectContaining({ key: KEY, locked: false, attempts: 0, max_attempts: 5 })]);
    expect(rows[0]?.id).not.toBe(oldId);
  });

  test('a foreign row of the same task (another key) is neither deleted nor changed', async () => {
    if (!ready) return;
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    const foreignId = await insertQueued(FOREIGN_KEY);
    await insertQueued();

    await enqueueJob(JOB, {}, { force: true, connectionString: urlAs(FORCE_APP) });

    const foreign = await utils!.withPgClient((c) =>
      c.query<Row>(
        `select id::text as id, attempts, max_attempts, locked_at is not null as locked, key
         from graphile_worker._private_jobs where id = $1`,
        [foreignId]
      )
    );
    expect(foreign.rows).toEqual([
      expect.objectContaining({ id: foreignId, key: FOREIGN_KEY, locked: false, attempts: 0, max_attempts: 5 }),
    ]);
  });
});
