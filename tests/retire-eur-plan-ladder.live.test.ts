import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * NG-153 — `pnpm db:setup` must exit 0 on a POPULATED database.
 *
 * retire-eur-plan-ladder.sql step 4 refuses to drop the retired plans while a
 * subscription still points at an unmapped plan. It used to count every plan
 * outside ('free','basic','pro','ultra') as unmapped, so subscriptions on plans
 * added later (`public-team`, `tto-edition`) stopped the whole chain at file
 * 8/68. A fresh database never saw it: the file runs before those plans exist.
 *
 * The suite builds its own database from `DATABASE_URL` (a superuser, as in
 * CI) with `prisma db push` and runs the one file against it, so the shared
 * schema is never touched. `.live`: skipped locally without a database or psql;
 * in CI either one fails the file.
 */

const SUITE = 'retire-eur-plan-ladder.live';
const ADMIN_URL = envValue('DATABASE_URL');
const ROOT = resolve(__dirname, '..');
const PSQL = process.env.PSQL ?? 'psql';
const DB = `fb_retire_ladder_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const LONG = 240_000;
const FILE = 'prisma/migrations/retire-eur-plan-ladder.sql';

let ready = false;
let skipReason = '';
let admin: pg.Client | undefined;
let created = false;

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL!);
  u.pathname = `/${db}`;
  u.searchParams.delete('schema');
  return u.toString();
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: urlFor(DB), PSQL },
    encoding: 'utf8',
    timeout: LONG,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
// Same session as scripts/apply-migrations.sh gives every file.
const apply = () => run(PSQL, [urlFor(DB), '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', "SET app.system_scope = 'on'", '-f', FILE]);

async function rows(sql: string): Promise<Record<string, unknown>[]> {
  const c = new pg.Client({ connectionString: urlFor(DB) });
  await c.connect();
  try {
    await c.query("SET app.system_scope = 'on'");
    return (await c.query(sql)).rows;
  } finally {
    await c.end();
  }
}

const plansOf = async () =>
  Object.fromEntries(
    (await rows(`SELECT "tenantId", "planId" FROM "Subscription" ORDER BY "tenantId"`)).map((r) => [r.tenantId, r.planId])
  );

beforeAll(async () => {
  if (!ADMIN_URL) {
    skipReason = 'DATABASE_URL is not set';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  if (spawnSync(PSQL, ['--version']).status !== 0) {
    skipReason = `psql not found (${PSQL})`;
    skipOrFailInCi(SUITE, skipReason, 'Install the postgres client in the CI job.');
    return;
  }
  admin = new pg.Client({ connectionString: urlFor(new URL(ADMIN_URL).pathname.slice(1)) });
  try {
    await admin.connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await admin.query(`CREATE DATABASE ${DB}`);
  created = true;
  const push = run('node_modules/.bin/prisma', ['db', 'push']);
  if (push.status !== 0) throw new Error(`prisma db push failed:\n${push.out}`);
  ready = true;
}, 2 * LONG);

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (!admin) return;
  if (created) await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => {});
  await admin.end();
}, LONG);

describe('retire-eur-plan-ladder.sql on a populated database (NG-153)', () => {
  test('subscriptions on plans added after the ladder (public-team, tto-edition) do not stop it, and are left untouched', async () => {
    await rows(`
      INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES
        ('rl-pub','rl-pub','rl-pub','TR',now()), ('rl-tto','rl-tto','rl-tto','TR',now()),
        ('rl-old','rl-old','rl-old','TR',now()), ('rl-ent','rl-ent','rl-ent','TR',now());
      INSERT INTO "Plan"(id,name,"monthlyCents","yearlyCents",seats,workspaces,"aiCreditsMonthly") VALUES
        ('team','Team',1,1,10,3,1), ('enterprise','Enterprise',1,1,999,999,1)
        ON CONFLICT (id) DO NOTHING;
      INSERT INTO "Subscription"("tenantId","planId",status,"updatedAt") VALUES
        ('rl-pub','public-team','ACTIVE',now()), ('rl-tto','tto-edition','ACTIVE',now()),
        ('rl-old','team','ACTIVE',now()), ('rl-ent','enterprise','ACTIVE',now());`);

    const first = apply();
    expect(first.status, first.out.slice(-2000)).toBe(0);
    const second = apply();
    expect(second.status, second.out.slice(-2000)).toBe(0);

    // New plans are not re-pointed or deleted; the retired ones are mapped as before.
    expect(await plansOf()).toEqual({ 'rl-pub': 'public-team', 'rl-tto': 'tto-edition', 'rl-old': 'pro', 'rl-ent': 'ultra' });
    const retired = await rows(`SELECT count(*)::int AS n FROM "Plan" WHERE id IN ('starter','team','business','enterprise')`);
    expect(retired[0]).toEqual({ n: 0 });
  }, LONG);

  test('the guard still protects: a subscription on a retired plan the mapping missed stops the delete', async () => {
    // Simulate a mapping gap: the re-point step cannot reach a row inserted
    // between steps 3 and 4, so provoke step 4 directly with the same predicate.
    await rows(`INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('rl-gap','rl-gap','rl-gap','TR',now())`);
    const sql = readGuard();
    await rows(`INSERT INTO "Plan"(id,name,"monthlyCents","yearlyCents",seats,workspaces,"aiCreditsMonthly")
                VALUES ('business','Business',1,1,1,1,1) ON CONFLICT (id) DO NOTHING;
                INSERT INTO "Subscription"("tenantId","planId",status,"updatedAt") VALUES ('rl-gap','business','ACTIVE',now())`);
    const r = run(PSQL, [urlFor(DB), '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', "SET app.system_scope = 'on'", '-c', sql]);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('refusing to retire plans: 1 subscription(s) still on a retired plan');
  }, LONG);
});

/** Step 4 of the migration, verbatim, so the test cannot drift from the file. */
function readGuard(): string {
  const text = readFileSync(resolve(ROOT, FILE), 'utf8');
  const m = text.match(/DO \$\$[\s\S]*?END \$\$;/);
  if (!m) throw new Error('guard block not found in ' + FILE);
  return m[0];
}
