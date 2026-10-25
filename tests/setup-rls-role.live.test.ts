import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * FO-139 (TASK-MVNMZ521MJ3AD) — `pnpm db:rls-role` on a second database of a
 * cluster whose `fabrika_app` role already exists.
 *
 * The role is cluster-wide, its GRANTs are per database. The old script
 * returned early when the role existed, so the second database got a login
 * that could read nothing and the script still printed "✅" and exited 0. This
 * file runs the real script as a child process against two fresh databases on
 * the same server and checks the grants, the unchanged password, and the
 * second run.
 *
 * The role is the shared one CI creates in `Prepare database` (db:setup runs
 * before vitest), so the test works on the role as it already exists. It takes
 * the password from DATABASE_URL_RLS_TEST and never creates or drops the role:
 * dropping a shared role would break every checkout that uses it. Only the two
 * databases this file creates are dropped.
 *
 * The script appends to `.env` in its working directory, so it runs from a
 * temporary directory that only links `prisma/`. The repo `.env` is never
 * touched.
 */

const SUITE = 'db:rls-role second-database live test';
const ROLE = 'fabrika_app';
const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = join(REPO, 'scripts/setup-rls-role.ts');
const SQL = join(REPO, 'prisma/rls-app-role.sql');
const TSX = join(REPO, 'node_modules/.bin/tsx');
const ADMIN_URL = envValue('DATABASE_URL');
const APP_URL = envValue('DATABASE_URL_RLS_TEST') ?? '';
const RUN = `${Date.now()}_${randomUUID().slice(0, 8)}`.replace(/-/g, '');
const DB_A = `fo139rls_${RUN}_a`;
const DB_B = `fo139rls_${RUN}_b`;

function serverUrl(database: string, source: string): string {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}

function withPassword(url: string, password: string): string {
  const next = new URL(url);
  next.password = encodeURIComponent(password);
  return next.toString();
}

function passwordOf(url: string): string {
  return decodeURIComponent(new URL(url).password);
}

/** Runs the real script from a scratch directory with an explicit environment. */
function runScript(cwd: string, env: Record<string, string | undefined>) {
  // The run sees exactly the URLs passed in, never a DATABASE_URL_RLS_TEST inherited from this shell.
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (!env.DATABASE_URL_RLS_TEST) delete childEnv.DATABASE_URL_RLS_TEST;
  const run = spawnSync(TSX, [SCRIPT], { cwd, env: childEnv, encoding: 'utf8', timeout: 120_000 });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fo139-rls-role-'));
  symlinkSync(join(REPO, 'prisma'), join(dir, 'prisma'));
  return dir;
}

/** The SQL file as the script sees it: psql meta-commands stripped, as in scripts/setup-rls-role.ts. */
function sqlWithoutMetaCommands(): string {
  return readFileSync(SQL, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n');
}

const admin = ADMIN_URL ? new pg.Client({ connectionString: serverUrl('postgres', ADMIN_URL) }) : undefined;
let reachable = false;
if (admin) {
  await admin.connect().then(
    () => (reachable = true),
    () => undefined
  );
}
const missing = !reachable ? (ADMIN_URL ? 'database unavailable' : 'DATABASE_URL is not set') : !APP_URL ? 'DATABASE_URL_RLS_TEST is not set' : undefined;
if (missing) {
  await admin?.end().catch(() => undefined);
  skipOrFailInCi(SUITE, missing);
}
const ready = reachable && APP_URL !== '';

describe.skipIf(!ready)(SUITE, () => {
  // Filled in beforeAll; each `it` reads what the script runs produced.
  let scratch = '';
  let runA: { status: number | null; output: string } | undefined;
  let runB: { status: number | null; output: string } | undefined;
  let runReuse: { status: number | null; output: string } | undefined;
  let runWrongPassword: { status: number | null; output: string } | undefined;

  async function onDb(database: string, sql: string, values: unknown[] = []) {
    const client = new pg.Client({ connectionString: serverUrl(database, ADMIN_URL as string) });
    await client.connect();
    try {
      const { rows } = await client.query(sql, values);
      return rows;
    } finally {
      await client.end();
    }
  }

  async function canLogIn(url: string, sql: string) {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      return (await client.query(sql)).rows;
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await admin!.query(`CREATE DATABASE "${DB_A}"`);
    await admin!.query(`CREATE DATABASE "${DB_B}"`);
    for (const db of [DB_A, DB_B]) {
      await onDb(db, 'CREATE TABLE "Tenant" (id text PRIMARY KEY)');
    }

    // The role already exists here (CI's Prepare database step), so every run takes the keep path:
    // grants for this database, the password checked against DATABASE_URL_RLS_TEST, never rewritten.
    scratch = scratchDir();
    runA = runScript(scratch, { DATABASE_URL: serverUrl(DB_A, ADMIN_URL as string), DATABASE_URL_RLS_TEST: APP_URL });
    runB = runScript(scratch, { DATABASE_URL: serverUrl(DB_B, ADMIN_URL as string), DATABASE_URL_RLS_TEST: APP_URL });
    // Second run on B: idempotent.
    runReuse = runScript(scratch, { DATABASE_URL: serverUrl(DB_B, ADMIN_URL as string), DATABASE_URL_RLS_TEST: APP_URL });
    // A wrong password must fail and must not rewrite the role.
    runWrongPassword = runScript(scratch, {
      DATABASE_URL: serverUrl(DB_B, ADMIN_URL as string),
      DATABASE_URL_RLS_TEST: withPassword(APP_URL, `${passwordOf(APP_URL)}-wrong`),
    });
  }, 300_000);

  afterAll(async () => {
    if (admin) {
      for (const db of [DB_A, DB_B]) {
        await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`).catch(() => undefined);
      }
      await admin.end().catch(() => undefined);
    }
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }, 120_000);

  it('the second database gets its GRANTs when the role already exists', async () => {
    expect(runB?.status, runB?.output).toBe(0);
    const rows = await onDb(DB_B, `SELECT has_table_privilege('${ROLE}', '"Tenant"', 'SELECT') AS ok`);
    expect(rows[0]).toEqual({ ok: true });
  }, 120_000);

  it('the second database accepts the shared credential and reads the tenant table through it', async () => {
    const appUrlB = serverUrl(DB_B, APP_URL);
    const rows = await canLogIn(appUrlB, 'SELECT current_user AS who, count(*)::int AS n FROM "Tenant"');
    expect(rows[0]).toEqual({ who: ROLE, n: 0 });
  });

  it('a second run on the same database exits 0 and reports the password unchanged', async () => {
    expect(runReuse?.status, runReuse?.output).toBe(0);
    expect(runReuse?.output).toContain('Password left unchanged');
  }, 120_000);

  it('a mismatching password fails and leaves the role password alone', async () => {
    expect(runWrongPassword?.status).not.toBe(0);
    expect(runWrongPassword?.output).toContain('password does not match');
    // The original credential still logs in, on the first database and on the second.
    const rowsA = await canLogIn(serverUrl(DB_A, APP_URL), 'SELECT count(*)::int AS n FROM "Tenant"');
    expect(rowsA).toEqual([{ n: 0 }]);
    const rowsB = await canLogIn(serverUrl(DB_B, APP_URL), 'SELECT count(*)::int AS n FROM "Tenant"');
    expect(rowsB).toEqual([{ n: 0 }]);
  });

  it('the first database runs and keeps its own GRANTs', async () => {
    expect(runA?.status, runA?.output).toBe(0);
    const rows = await onDb(DB_A, `SELECT has_table_privilege('${ROLE}', '"Tenant"', 'SELECT') AS ok`);
    expect(rows[0]).toEqual({ ok: true });
  });

  it('the SQL refuses to run without the password GUC and keeps the shared password', async () => {
    // The admin connection never sets fabrika.app_password, so the SQL reaches its guard with no password.
    // It runs inside a transaction that is always rolled back: if the guard is broken, the ALTER ROLE would
    // otherwise commit PASSWORD NULL and erase the shared password (TASK-MVNMZ521MJ3AD Ö4).
    const before = await admin!.query('SELECT rolpassword FROM pg_authid WHERE rolname = $1', [ROLE]);
    let refusal: unknown;
    await admin!.query('BEGIN');
    try {
      await admin!.query(sqlWithoutMetaCommands());
    } catch (error) {
      refusal = error;
    } finally {
      await admin!.query('ROLLBACK');
    }
    expect(String(refusal)).toContain('fabrika.app_password is not set');
    const after = await admin!.query('SELECT rolpassword FROM pg_authid WHERE rolname = $1', [ROLE]);
    expect(after.rows).toEqual(before.rows);
    const rows = await canLogIn(serverUrl(DB_A, APP_URL), 'SELECT current_user AS who');
    expect(rows[0]).toEqual({ who: ROLE });
  });
});
