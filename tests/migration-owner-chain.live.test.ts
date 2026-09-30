import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MUOEGWSV8I7H0 (İNCELEME-106 I-1) — scripts/apply-migrations.sh run by the
 * role production runs it with: the schema owner, NOT superuser, NOT BYPASSRLS.
 * CI applies the chain as the `fabrika` superuser, so without this file nothing
 * measures the owner path, and it had two defects no gate saw:
 *
 *   1. It stopped at file 23 (add-agency-invite-code.sql) with `permission
 *      denied to set parameter "app.system_scope"`, 22 files in.
 *   2. Every backfill on a FORCE ROW LEVEL SECURITY table updated 0 rows.
 *
 * The suite builds its own database and owner role from `DATABASE_URL` (a
 * superuser, as in CI), so the shared schema is never touched, and drops both
 * afterwards. `.live`: skipped locally without a superuser DATABASE_URL or
 * psql; in CI either one fails the file.
 */

const SUITE = 'migration-owner-chain.live';
const ADMIN_URL = envValue('DATABASE_URL');
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ROOT = resolve(__dirname, '..');
const PSQL = process.env.PSQL ?? 'psql';
const RUN = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const OWNER = `fb_mig_owner_${RUN}`;
const OWNER_PW = randomBytes(18).toString('hex');
const DB = `fb_owner_chain_${RUN}`;
const DB_SUPER = `${DB}_su`;
const LONG = 240_000;

let ready = false;
let skipReason = '';
let admin: pg.Client | undefined;
let granted = false;
const created = { role: false, dbs: [] as string[] };

function urlFor(base: string, db: string, user?: { name: string; password: string }): string {
  const u = new URL(base);
  u.pathname = `/${db}`;
  u.searchParams.delete('schema');
  if (user) {
    u.username = user.name;
    u.password = user.password;
  }
  return u.toString();
}
const ownerUrl = (db = DB) => urlFor(ADMIN_URL!, db, { name: OWNER, password: OWNER_PW });
const adminUrl = (db = DB) => urlFor(ADMIN_URL!, db);

function run(cmd: string, args: string[], url: string) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url, PSQL },
    encoding: 'utf8',
    timeout: LONG,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
const chain = (url: string) => run('bash', ['scripts/apply-migrations.sh'], url);

async function withDb<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
const one = async (url: string, sql: string) => withDb(url, async (c) => (await c.query(sql)).rows[0]);

/**
 * Legacy rows that make four FORCE-RLS backfills do work, and one integrity
 * check (retire-eur-plan-ladder deletes the retired plan). Two tenants, so
 * "all rows" and "one tenant's rows" differ.
 */
const LEGACY = `
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('lt-a','lt-a','lt-a','TR',now()), ('lt-b','lt-b','lt-b','TR',now());
INSERT INTO "User"(id,email,"updatedAt") VALUES ('lu-a','lu-a@example.test',now()), ('lu-b','lu-b@example.test',now());
INSERT INTO "Membership"(id,"tenantId","userId") VALUES ('lm-a','lt-a','lu-a'), ('lm-b','lt-b','lu-b');
INSERT INTO "Feedback"(id,"tenantId",category,title,body,"alertStatus","updatedAt")
  VALUES ('lf-a','lt-a','BUG','t','b','sent',now()), ('lf-b','lt-b','BUG','t','b','failed',now());
INSERT INTO "Plan"(id,name,"monthlyCents","yearlyCents",seats,workspaces,"aiCreditsMonthly")
  VALUES ('team','Team',1,1,10,3,1) ON CONFLICT (id) DO NOTHING;
INSERT INTO "Subscription"("tenantId","planId",status,"updatedAt") VALUES ('lt-a','team','ACTIVE',now()), ('lt-b','team','ACTIVE',now());
INSERT INTO "CreditLedger"(id,"tenantId",delta,reason,"refId")
  VALUES ('lcl-a','lt-a',100,'monthly_grant','monthly_grant:2026-08'), ('lcl-b','lt-b',100,'monthly_grant',NULL);
INSERT INTO "Relationship"(id,"tenantId",kind,"counterpartName","ownerUserId","lastContactAt","staleRemindedAt","updatedAt")
  VALUES ('lr-a','lt-a','partner','p','lu-a',now()-interval '90 days',now()-interval '1 day',now()),
         ('lr-b','lt-b','partner','p','lu-b',now()-interval '90 days',now()-interval '2 days',now());`;

/** Read as superuser: what each backfill produced on the legacy rows. */
const COUNTS = `SELECT
  (SELECT count(*) FROM "Feedback" WHERE id LIKE 'lf-%' AND "alertStatus" = 'legacy')::int AS feedback_legacy,
  (SELECT count(*) FROM "Subscription" WHERE "tenantId" LIKE 'lt-%' AND "planId" = 'pro')::int AS subscription_moved,
  (SELECT count(*) FROM "Subscription" s WHERE s."tenantId" LIKE 'lt-%'
      AND NOT EXISTS (SELECT 1 FROM "Plan" p WHERE p.id = s."planId"))::int AS subscription_orphaned,
  (SELECT count(*) FROM "CreditLedger" WHERE id LIKE 'lcl-%' AND "grantPeriod" IS NOT NULL)::int AS ledger_period,
  (SELECT count(*) FROM "Relationship" WHERE id LIKE 'lr-%' AND "staleRemindedContactAt" IS NOT NULL)::int AS rel_contact,
  (SELECT count(*) FROM "Membership" WHERE id LIKE 'lm-%' AND "staleDigestOn" IS NOT NULL)::int AS membership_day,
  (SELECT count(*) FROM "User" WHERE id LIKE 'lu-%' AND "staleDigestOn" IS NOT NULL)::int AS user_day`;

beforeAll(async () => {
  if (!ADMIN_URL) {
    skipReason = 'DATABASE_URL is not set';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  if (spawnSync(PSQL, ['--version']).status !== 0) {
    skipReason = `psql not found (${PSQL}); scripts/apply-migrations.sh needs it`;
    skipOrFailInCi(SUITE, skipReason, 'Install the postgres client in the CI job.');
    return;
  }
  admin = new pg.Client({ connectionString: urlFor(ADMIN_URL, new URL(ADMIN_URL).pathname.slice(1)) });
  try {
    await admin.connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  const su = (await admin.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user')).rows[0];
  if (!su?.rolsuper) {
    skipReason = 'DATABASE_URL is not a superuser; the suite must create a role and a database';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }

  await admin.query(
    `CREATE ROLE ${OWNER} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${OWNER_PW}'`
  );
  created.role = true;
  await admin.query(`CREATE DATABASE ${DB} OWNER ${OWNER}`);
  created.dbs.push(DB);
  await withDb(adminUrl(), async (c) => {
    await c.query('CREATE EXTENSION IF NOT EXISTS vector');
    await c.query(`ALTER SCHEMA public OWNER TO ${OWNER}`);
  });
  // The owner builds the base tables, as in production (RELEASE_CHECKLIST §3.1 step 1).
  const push = run('node_modules/.bin/prisma', ['db', 'push'], ownerUrl());
  if (push.status !== 0) throw new Error(`prisma db push as owner failed:\n${push.out}`);
  ready = true;
}, LONG);

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (!admin) return;
  for (const db of created.dbs) {
    await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
  }
  if (granted) await admin.query(`REVOKE SET ON PARAMETER app.system_scope FROM ${OWNER}`).catch(() => {});
  if (created.role) await admin.query(`DROP ROLE IF EXISTS ${OWNER}`).catch(() => {});
  await admin.end();
}, LONG);

describe('apply-migrations.sh as the schema owner (not superuser, not BYPASSRLS)', () => {
  test('without the one-time grant it stops before applying any file', async () => {
    const facts = await one(ownerUrl(), 'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    expect(facts).toEqual({ rolsuper: false, rolbypassrls: false });

    const r = chain(ownerUrl());
    expect(r.status).toBe(1);
    expect(r.out).toContain(`role "${OWNER}" may not create functions with SET app.system_scope`);
    expect(r.out).toContain('No file was applied');
    expect(r.out).not.toContain('==> [1/');
    const fn = await one(ownerUrl(), `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'redeem_agency_invite'`);
    expect(fn.n).toBe(0);
  }, LONG);

  test('the grant file gives the owner SET on app.system_scope and never fabrika_app', async () => {
    const g = run(PSQL, [adminUrl(), '-X', '-v', `owner=${OWNER}`, '-f', 'prisma/migration-owner-grant.sql'], adminUrl());
    expect(g.status, g.out).toBe(0);
    granted = true;
    const priv = await one(
      adminUrl(),
      `SELECT has_parameter_privilege('${OWNER}', 'app.system_scope', 'SET') AS owner_can,
              (SELECT has_parameter_privilege('fabrika_app', 'app.system_scope', 'SET')
                 FROM pg_roles WHERE rolname = 'fabrika_app') AS app_can`
    );
    expect(priv.owner_can).toBe(true);
    expect(priv.app_can === null || priv.app_can === false).toBe(true);

    const refuse = run(PSQL, [adminUrl(), '-X', '-v', 'owner=fabrika_app', '-f', 'prisma/migration-owner-grant.sql'], adminUrl());
    // Refused by the file itself when fabrika_app exists, or because no such role exists.
    expect(refuse.status).not.toBe(0);
  }, LONG);

  test('with the grant the whole chain runs to the end, and a second run before db:rls refuses', async () => {
    const r = chain(ownerUrl());
    expect(r.status, r.out.slice(-2000)).toBe(0);
    expect(r.out).toMatch(new RegExp(`apply-migrations: \\d+ files applied as ${OWNER}`));

    // FORCE tables created by the chain have no system_scope policy until
    // `pnpm db:rls`; a backfill there would silently update nothing.
    const again = chain(ownerUrl());
    expect(again.status).toBe(1);
    expect(again.out).toContain('have no system_scope policy');
    expect(again.out).toContain('No file was applied');
  }, LONG);

  test('after db:rls, the FORCE-RLS backfills update as many rows as under the superuser', async () => {
    await withDb(ownerUrl(), async (c) => {
      const sql = readFileSync(resolve(ROOT, 'prisma/rls.sql'), 'utf8')
        .split('\n')
        .filter((line) => !line.startsWith('\\'))
        .join('\n');
      await c.query(sql);
    });
    await withDb(adminUrl(), (c) => c.query(LEGACY));

    // Same legacy state for the superuser baseline: a copy taken before the owner run.
    await admin!.query(`CREATE DATABASE ${DB_SUPER} TEMPLATE ${DB} OWNER ${OWNER}`);
    created.dbs.push(DB_SUPER);

    const before = await one(adminUrl(), COUNTS);
    expect(before).toMatchObject({ feedback_legacy: 0, ledger_period: 0, rel_contact: 0, membership_day: 0, user_day: 0 });

    const owner = chain(ownerUrl());
    expect(owner.status, owner.out.slice(-2000)).toBe(0);
    const su = chain(adminUrl(DB_SUPER));
    expect(su.status, su.out.slice(-2000)).toBe(0);

    const byOwner = await one(adminUrl(), COUNTS);
    const bySuper = await one(adminUrl(DB_SUPER), COUNTS);
    expect(bySuper).toEqual({
      feedback_legacy: 2,
      subscription_moved: 2,
      subscription_orphaned: 0,
      ledger_period: 2,
      rel_contact: 2,
      membership_day: 2,
      user_day: 2,
    });
    expect(byOwner).toEqual(bySuper);
  }, LONG);

  test('the migration session leaves no system scope behind: fabrika_app stays tenant-isolated', async (ctx) => {
    if (!RLS_URL) ctx.skip('DATABASE_URL_RLS_TEST is not set');
    const app = new URL(RLS_URL!);
    await withDb(ownerUrl(), (c) => c.query('GRANT SELECT ON "Membership" TO fabrika_app'));
    await withDb(urlFor(ADMIN_URL!, DB, { name: app.username, password: decodeURIComponent(app.password) }), async (c) => {
      const who = (await c.query('SELECT current_user AS u, current_setting($1, true) AS scope', ['app.system_scope'])).rows[0];
      expect(who.u).toBe('fabrika_app');
      expect(who.scope ?? '').not.toBe('on');
      const none = (await c.query(`SELECT count(*)::int AS n FROM "Membership" WHERE id LIKE 'lm-%'`)).rows[0];
      expect(none.n).toBe(0);
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.tenant_id', 'lt-a', true)`);
      const own = (await c.query(`SELECT array_agg(id ORDER BY id) AS ids FROM "Membership" WHERE id LIKE 'lm-%'`)).rows[0];
      await c.query('ROLLBACK');
      expect(own.ids).toEqual(['lm-a']);
    });
  }, LONG);

  test('a stored default for app.system_scope stops the run before any file', async () => {
    await withDb(ownerUrl(), (c) => c.query(`ALTER DATABASE ${DB} SET app.system_scope = 'on'`));
    try {
      const r = chain(ownerUrl());
      expect(r.status).toBe(1);
      expect(r.out).toContain('app.system_scope has a stored default');
      expect(r.out).not.toContain('==> [1/');
    } finally {
      await withDb(ownerUrl(), (c) => c.query(`ALTER DATABASE ${DB} RESET app.system_scope`));
    }
  }, LONG);
});
