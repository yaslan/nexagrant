import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
const DB_GAP = `${DB}_gap`;
const DB_DOWN = `${DB}_down`;
const LONG = 240_000;

let ready = false;
let skipReason = '';
let admin: pg.Client | undefined;
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
const down = (url: string, file: string) => run('bash', ['scripts/apply-migrations.sh', '--down', file], url);

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
  if (created.role) await admin.query(`DROP ROLE IF EXISTS ${OWNER}`).catch(() => {});
  await admin.end();
}, LONG);

describe('apply-migrations.sh as the schema owner (not superuser, not BYPASSRLS)', () => {
  // TASK-MUOG51GJ3PUOG: Supabase has no superuser for us, so the owner never
  // gets SET ON PARAMETER app.system_scope. The chain must run without it.
  test('without SET on app.system_scope the whole chain runs, and a second run before db:rls refuses', async () => {
    const facts = await one(
      ownerUrl(),
      `SELECT rolsuper, rolbypassrls, has_parameter_privilege('app.system_scope', 'SET') AS can_set
         FROM pg_roles WHERE rolname = current_user`
    );
    expect(facts).toEqual({ rolsuper: false, rolbypassrls: false, can_set: false });

    const r = chain(ownerUrl());
    expect(r.status, r.out.slice(-2000)).toBe(0);
    expect(r.out).toMatch(new RegExp(`apply-migrations: \\d+ files applied as ${OWNER}`));
    const fns = await one(
      ownerUrl(),
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'app.system\\_scope=%'))::int AS with_clause
         FROM pg_proc WHERE proname IN ('redeem_agency_invite', 'note_agency_invite_rejection',
                                        'agency_funnel_counts', 'agency_funnel_counts_by_province')`
    );
    expect(fns).toEqual({ n: 4, with_clause: 0 });

    // FORCE tables created by the chain have no system_scope policy until
    // `pnpm db:rls`; a backfill there would silently update nothing.
    const again = chain(ownerUrl());
    expect(again.status).toBe(1);
    expect(again.out).toContain('have no system_scope policy');
    expect(again.out).toContain('No file was applied');
  }, LONG);

  test('a file that brings back a function-level SET app.system_scope is refused before any file', async () => {
    const tree = mkdtempSync(join(tmpdir(), 'fb-owner-clause-'));
    try {
      cpSync(resolve(ROOT, 'scripts/apply-migrations.sh'), join(tree, 'scripts/apply-migrations.sh'));
      cpSync(resolve(ROOT, 'prisma/migrations'), join(tree, 'prisma/migrations'), { recursive: true });
      appendFileSync(
        join(tree, 'prisma/migrations/add-agency-funnel.sql'),
        `\nCREATE OR REPLACE FUNCTION public.zz_clause() RETURNS int LANGUAGE sql\nSET app.system_scope = 'on'\nAS 'SELECT 1';\n`
      );
      const r = run('bash', [join(tree, 'scripts/apply-migrations.sh')], ownerUrl());
      expect(r.status).toBe(1);
      expect(r.out).toContain(`role "${OWNER}" may not create functions with SET app.system_scope`);
      expect(r.out).toContain('add-agency-funnel.sql');
      expect(r.out).toContain('No file was applied');
      expect(r.out).not.toContain('==> [1/');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
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

  // TASK-MUPCYOCLINGC7 (crw2-fb Ö-1, mutant N2). In CI the definer functions
  // belong to the `fabrika` superuser and skip RLS altogether, so the owner arm
  // of system_scope_open() — pg_has_role(current_user, owner) — is measured
  // only here, where they belong to a NOSUPERUSER NOBYPASSRLS owner. Inside a
  // definer function current_user is that owner while session_user is still
  // fabrika_app; with session_user the agency would count 0 saved searches.
  test('a SECURITY DEFINER function owned by the NOSUPERUSER owner reads across tenants for fabrika_app', async (ctx) => {
    if (!RLS_URL) ctx.skip('DATABASE_URL_RLS_TEST is not set');
    const app = new URL(RLS_URL!);
    const fn = await one(
      ownerUrl(),
      `SELECT r.rolname AS owner, r.rolsuper AS super, r.rolbypassrls AS bypass, p.prosecdef AS definer
         FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
        WHERE p.oid = 'public.agency_funnel_counts(timestamp without time zone)'::regprocedure`
    );
    expect(fn).toEqual({ owner: OWNER, super: false, bypass: false, definer: true });
    await withDb(ownerUrl(), (c) => c.query('GRANT SELECT ON "SavedSearch" TO fabrika_app'));
    await withDb(adminUrl(), (c) =>
      c.query(`INSERT INTO "Tenant"(id,name,slug,country,kind,"updatedAt") VALUES ('oc-ag','oc-ag','oc-ag','TR','AGENCY',now());
               INSERT INTO "Tenant"(id,name,slug,country,"agencyId","updatedAt") VALUES ('oc-m','oc-m','oc-m','TR','oc-ag',now());
               INSERT INTO "SavedSearch"(id,"tenantId","userId",name,filters) VALUES ('oc-s','oc-m','lu-a','s','{}');`)
    );
    await withDb(urlFor(ADMIN_URL!, DB, { name: app.username, password: decodeURIComponent(app.password) }), async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SELECT set_config('app.tenant_id', 'oc-ag', true)`);
        // The member's row is invisible to the agency directly …
        const direct = (await c.query(`SELECT count(*)::int AS n FROM "SavedSearch" WHERE id = 'oc-s'`)).rows[0];
        expect(direct.n).toBe(0);
        // … and counted by the owner's function.
        const rows = (await c.query(`SELECT registered, saved_search FROM public.agency_funnel_counts(NULL)`)).rows;
        expect(rows).toEqual([{ registered: 1, saved_search: 1 }]);
      } finally {
        await c.query('ROLLBACK');
      }
    });
  }, LONG);

  // TASK-MUOG51GJ3PUOG: the functions set app.system_scope in their body now,
  // not as a function-level SET that PostgreSQL restores by itself. Measured
  // here that every return path puts the caller's value back.
  test('the definer functions hand app.system_scope back to fabrika_app unchanged', async (ctx) => {
    if (!RLS_URL) ctx.skip('DATABASE_URL_RLS_TEST is not set');
    const app = new URL(RLS_URL!);
    const hash = 'a'.repeat(64);
    const calls = [
      `SELECT count(*) FROM public.agency_funnel_counts(NULL)`,
      `SELECT count(*) FROM public.agency_funnel_counts_by_province(NULL)`,
      `SELECT public.redeem_agency_invite('not-a-hash')`,
      `SELECT public.redeem_agency_invite('${hash}')`,
      `SELECT public.note_agency_invite_rejection('not-a-hash')`,
      `SELECT public.note_agency_invite_rejection('${hash}')`,
    ];
    await withDb(urlFor(ADMIN_URL!, DB, { name: app.username, password: decodeURIComponent(app.password) }), async (c) => {
      const scope = async () => (await c.query(`SELECT current_setting('app.system_scope', true) AS v`)).rows[0].v ?? '';
      const members = async () =>
        (await c.query(`SELECT count(*)::int AS n FROM "Membership" WHERE id LIKE 'lm-%'`)).rows[0].n;
      await c.query('BEGIN');
      try {
        // An agency tenant (both funnel paths run) that owns no lm-* membership.
        await c.query(`SELECT set_config('app.tenant_id', 'oc-ag', true)`);
        for (const sql of calls) {
          await c.query(sql);
          expect(await scope(), sql).not.toBe('on');
          expect(await members(), sql).toBe(0);
        }
        // Inside a sealed system scope the caller keeps it.
        await c.query(`SELECT enter_system_scope('platform-aggregate')`);
        expect(await members()).toBe(2);
        for (const sql of calls) {
          await c.query(sql);
          expect(await scope(), sql).toBe('on');
          expect(await members(), sql).toBe(2);
        }
      } finally {
        await c.query('ROLLBACK');
      }
    });
  }, LONG);

  // TASK-MUPYHVSBW47GD, on top of the previous test: the caller's exact value
  // (unset, 'off', 'on') comes back, also on the ERROR path (an error raised
  // inside a function after it opened the scope); the function never sets the
  // flag for the session (the transaction ends with COMMIT, which a session-
  // level set_config would survive and ROLLBACK would hide); fabrika_app cannot
  // write the flag into a function definition; tenant A sees no row of B.
  // No EXCEPTION handler is needed for the error path: a failing function
  // aborts the transaction or the caller's savepoint, and that rolls the
  // setting back (measured: an EXCEPTION ... restore; RAISE; block changes
  // nothing this test sees).
  test('definer functions put the caller\'s app.system_scope back on every exit, and tenant A still sees no row of B', async (ctx) => {
    if (!RLS_URL) ctx.skip('DATABASE_URL_RLS_TEST is not set');
    const app = new URL(RLS_URL!);
    const appUrl = urlFor(ADMIN_URL!, DB, { name: app.username, password: decodeURIComponent(app.password) });
    // An error raised INSIDE note_agency_invite_rejection, after it opened the
    // scope: a trigger on the row it writes for an unknown code. The message
    // carries the flag as the trigger saw it.
    await withDb(ownerUrl(), (c) =>
      c.query(`CREATE FUNCTION public.fb_scope_probe() RETURNS trigger LANGUAGE plpgsql AS $p$
                 BEGIN RAISE EXCEPTION 'scope probe: %', current_setting('app.system_scope', true); END $p$;
               CREATE TRIGGER fb_scope_probe BEFORE INSERT OR UPDATE ON "SystemAlert"
                 FOR EACH ROW WHEN (NEW."source" = 'agency.invite') EXECUTE FUNCTION public.fb_scope_probe();`)
    );
    try {
      for (const prev of [undefined, 'off', 'on']) {
        // A fresh session per case, so "unset" really is unset.
        await withDb(appUrl, async (c) => {
          const q = async (sql: string) => (await c.query(sql)).rows[0];
          await c.query('BEGIN');
          try {
            if (prev !== undefined) await c.query(`SELECT set_config('app.system_scope', $1, true)`, [prev]);
            await c.query(`SELECT set_config('app.tenant_id', 'oc-ag', true)`);
            const before = (await q(`SELECT current_setting('app.system_scope', true) AS s`)).s;
            expect(before ?? null).toBe(prev ?? null);
            const scope = async () => (await q(`SELECT current_setting('app.system_scope', true) AS s`)).s || null;

            // Normal exit: the function saw the member's row, the caller's flag is back.
            const rows = (await c.query(`SELECT registered, saved_search FROM public.agency_funnel_counts(NULL)`)).rows;
            expect(rows).toEqual([{ registered: 1, saved_search: 1 }]);
            expect(await scope()).toBe(prev ?? null);
            const prov = (await c.query(`SELECT registered FROM public.agency_funnel_counts_by_province(NULL)`)).rows;
            expect(prov).toEqual([{ registered: 1 }]);
            expect(await scope()).toBe(prev ?? null);

            // Early RETURN (malformed hash).
            expect((await q(`SELECT public.redeem_agency_invite('not-a-hash') AS a`)).a).toBeNull();
            expect(await scope()).toBe(prev ?? null);

            // Error path: the original error comes out, raised while the scope was on.
            await c.query('SAVEPOINT probe');
            const err = await c
              .query(`SELECT public.note_agency_invite_rejection(repeat('a', 64))`)
              .then(() => '', (e: Error) => e.message);
            expect(err).toBe('scope probe: on');
            await c.query('ROLLBACK TO SAVEPOINT probe');
            expect(await scope()).toBe(prev ?? null);

            // Nothing leaked: as the agency, the member's and the other tenants' rows stay invisible.
            expect((await q(`SELECT count(*)::int AS n FROM "SavedSearch" WHERE id = 'oc-s'`)).n).toBe(0);
            expect((await q(`SELECT count(*)::int AS n FROM "Membership" WHERE id LIKE 'lm-%'`)).n).toBe(0);
            // As tenant A: only A's membership, never B's — whatever the flag.
            await c.query(`SELECT set_config('app.tenant_id', 'lt-a', true)`);
            const own = await q(`SELECT array_agg(id ORDER BY id) AS ids FROM "Membership" WHERE id LIKE 'lm-%'`);
            expect(own.ids).toEqual(['lm-a']);
          } finally {
            // COMMIT, not ROLLBACK: a rollback would also undo a session-level
            // set_config inside the function and hide it. Nothing above wrote rows.
            await c.query('COMMIT');
          }
          // And nothing survives the transaction: every value above was local.
          const after = (await c.query(`SELECT current_setting('app.system_scope', true) AS s`)).rows[0].s;
          expect(after || null).toBeNull();
        });
      }

      // fabrika_app cannot write the flag into a function definition (the old
      // pattern), and its own plain SET opens nothing.
      await withDb(appUrl, async (c) => {
        const priv = (await c.query(`SELECT has_parameter_privilege('app.system_scope', 'SET') AS p`)).rows[0];
        expect(priv.p).toBe(false);
        const denied = await c
          .query(`CREATE FUNCTION pg_temp.fb_open() RETURNS int LANGUAGE sql SET app.system_scope = 'on' AS 'SELECT 1'`)
          .then(() => '', (e: Error) => e.message);
        expect(denied).toContain('permission denied to set parameter "app.system_scope"');
        await c.query(`SET app.system_scope = 'on'`);
        const n = (await c.query(`SELECT count(*)::int AS n FROM "Membership" WHERE id LIKE 'lm-%'`)).rows[0];
        expect(n.n).toBe(0);
      });
    } finally {
      await withDb(ownerUrl(), (c) =>
        c.query(`DROP TRIGGER IF EXISTS fb_scope_probe ON "SystemAlert"; DROP FUNCTION IF EXISTS public.fb_scope_probe();`)
      );
    }
  }, LONG);

  // Without SET on the parameter the owner cannot store this default itself
  // (permission denied, TASK-MUOG51GJ3PUOG); a superuser still can, and the
  // check guards against it whoever wrote it.
  test('the owner cannot store a default for app.system_scope', async () => {
    await expect(
      withDb(ownerUrl(), (c) => c.query(`ALTER DATABASE ${DB} SET app.system_scope = 'on'`))
    ).rejects.toThrow('permission denied to set parameter "app.system_scope"');
  }, LONG);

  test('a stored default for app.system_scope stops the run before any file', async () => {
    await withDb(adminUrl(), (c) => c.query(`ALTER DATABASE ${DB} SET app.system_scope = 'on'`));
    try {
      const r = chain(ownerUrl());
      expect(r.status).toBe(1);
      expect(r.out).toContain('app.system_scope has a stored default');
      expect(r.out).not.toContain('==> [1/');
    } finally {
      await withDb(adminUrl(), (c) => c.query(`ALTER DATABASE ${DB} RESET app.system_scope`));
    }
  }, LONG);
  // İNCELEME-115 Ö-3 (mutant M6): the check AFTER the files, measured on its own.
  // The files run from a copy of scripts/ and prisma/migrations, so the repo is
  // never edited; the last listed file writes the default, as a bad migration would.
  test('a file that stores a default for app.system_scope fails the run after the files', async () => {
    const tree = mkdtempSync(join(tmpdir(), 'fb-owner-chain-'));
    try {
      cpSync(resolve(ROOT, 'scripts/apply-migrations.sh'), join(tree, 'scripts/apply-migrations.sh'));
      cpSync(resolve(ROOT, 'prisma/migrations'), join(tree, 'prisma/migrations'), { recursive: true });
      const last = run('bash', ['scripts/apply-migrations.sh', '--list'], ownerUrl()).out.trim().split('\n').pop()!;
      appendFileSync(
        join(tree, 'prisma/migrations', last),
        `\nDO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET app.system_scope = %L', current_database(), 'on'); END $$;\n`
      );
      // As the superuser: the owner can no longer write the default at all.
      const r = run('bash', [join(tree, 'scripts/apply-migrations.sh')], adminUrl());
      expect(r.status, r.out.slice(-2000)).toBe(1);
      expect(r.out).toMatch(/==> \[(\d+)\/\1\]/); // every file ran: the pre-run check could not have caught it
      expect(r.out).toContain('a file stored a default for app.system_scope');
      expect(r.out).not.toContain('files applied as');
    } finally {
      rmSync(tree, { recursive: true, force: true });
      await withDb(adminUrl(), (c) => c.query(`ALTER DATABASE ${DB} RESET app.system_scope`));
    }
  }, LONG);

  // İNCELEME-115 Ö-4: `db push` done, `db:rls` never run, rows already there.
  // No table is FORCE yet, so the pre-run check passes; add-feedback.sql turns
  // Feedback FORCE and rename-feedback-alert-columns.sql then converts none of
  // its rows. Before this check the run ended with exit 0.
  test('rows in a FORCE table without a system_scope policy fail the run after the files', async () => {
    await admin!.query(`CREATE DATABASE ${DB_GAP} OWNER ${OWNER}`);
    created.dbs.push(DB_GAP);
    await withDb(adminUrl(DB_GAP), async (c) => {
      await c.query('CREATE EXTENSION IF NOT EXISTS vector');
      await c.query(`ALTER SCHEMA public OWNER TO ${OWNER}`);
    });
    const push = run('node_modules/.bin/prisma', ['db', 'push'], ownerUrl(DB_GAP));
    expect(push.status, push.out).toBe(0);
    await withDb(adminUrl(DB_GAP), (c) =>
      c.query(`INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('gt-a','gt-a','gt-a','TR',now());
               INSERT INTO "Feedback"(id,"tenantId",category,title,body,"alertStatus","updatedAt")
                 VALUES ('gf-1','gt-a','BUG','t','b','sent',now()), ('gf-2','gt-a','BUG','t','b','failed',now());`)
    );
    // The check reads pg_stat_user_tables, which the inserting session flushes a moment later.
    for (let i = 0; i < 50; i++) {
      const s = await one(adminUrl(DB_GAP), `SELECT n_live_tup::int AS n FROM pg_stat_user_tables WHERE relname = 'Feedback'`);
      if (s.n > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const r = chain(ownerUrl(DB_GAP));
    expect(r.status, r.out.slice(-2000)).toBe(1);
    expect(r.out).toContain('hold rows but have no system_scope policy');
    expect(r.out).toContain('Feedback (~2 rows)');
    expect(r.out).toContain('Restore the backup taken before this run');
    const left = await one(adminUrl(DB_GAP), `SELECT count(*)::int AS n FROM "Feedback" WHERE "alertStatus" = 'legacy'`);
    expect(left.n).toBe(0); // what the check reports: the backfill saw nothing
  }, LONG);

  // İNCELEME-115 Ö-2: a rollback run by hand without the system_scope session
  // replayed nothing, deleted the archive and exited 0 (permanent loss).
  test('rollback files run only through --down, which restores the archived rows', async () => {
    await admin!.query(`CREATE DATABASE ${DB_DOWN} TEMPLATE ${DB} OWNER ${OWNER}`);
    created.dbs.push(DB_DOWN);
    await withDb(adminUrl(DB_DOWN), (c) =>
      c.query(`INSERT INTO "Feedback"(id,"tenantId",category,title,body,"alertId","alertStatus","updatedAt")
                 VALUES ('df-a','lt-a','BUG','t','b','ext-a','sent',now()), ('df-b','lt-b','BUG','t','b','ext-b','failed',now());
               ALTER TABLE "Feedback" RENAME COLUMN "alertId" TO "sentryEventId";
               ALTER TABLE "Feedback" RENAME COLUMN "alertStatus" TO "sentryStatus";`)
    );
    const up = chain(ownerUrl(DB_DOWN));
    expect(up.status, up.out.slice(-2000)).toBe(0);
    const ARCHIVE = `SELECT jsonb_array_length(meta -> 'rows') AS n FROM "SystemAlert" WHERE id = 'feedback-migration-alert-columns'`;
    // df-a, df-b and the two lf-* rows of LEGACY (which carry 'legacy' by now).
    expect((await one(adminUrl(DB_DOWN), ARCHIVE))?.n).toBe(4);

    const file = 'prisma/migrations/rename-feedback-alert-columns.down.sql';
    for (const extra of [[], ['-c', `SET app.system_scope = 'on'`]]) {
      const plain = run(PSQL, [ownerUrl(DB_DOWN), '-X', ...extra, '-f', file], ownerUrl(DB_DOWN));
      expect(plain.status).not.toBe(0);
      expect(plain.out).toContain('scripts/apply-migrations.sh --down <file>, not plain psql');
      expect((await one(adminUrl(DB_DOWN), ARCHIVE))?.n).toBe(4);
    }

    const wrong = down(ownerUrl(DB_DOWN), 'rename-feedback-alert-columns.sql');
    expect(wrong.status).toBe(1);
    expect(wrong.out).toContain('--down takes one rollback file');

    const r = down(ownerUrl(DB_DOWN), file);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(`rolled back with rename-feedback-alert-columns.down.sql as ${OWNER}`);
    const back = await one(
      adminUrl(DB_DOWN),
      `SELECT array_agg(id || '=' || "sentryEventId" || '/' || "sentryStatus" ORDER BY id) AS rows,
              (SELECT count(*)::int FROM "SystemAlert" WHERE id = 'feedback-migration-alert-columns') AS archive
         FROM "Feedback" WHERE id LIKE 'df-%'`
    );
    expect(back).toEqual({ rows: ['df-a=ext-a/sent', 'df-b=ext-b/failed'], archive: 0 });
  }, LONG);
});
