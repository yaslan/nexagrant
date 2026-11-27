import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { envValue } from './helpers/dotenv';
import { isGithubActions, isLocalDbUrl, skipOrFailInCi } from './helpers/live-db-role';
import { EXPERT_DIRECTORY_POLICY_LOCK, holdTestDbLock, PUBLIC_LEAD_TABLE_LOCK, withTestDbLock } from './helpers/test-db-lock';
import { INTAKE_APPEND_ONLY, INTAKE_APPEND_ONLY_POLICIES } from '../scripts/rls-models';

/**
 * NG-183 (NG-175 review Düşük-1) — on a system_scope table (system_scope policy, no tenant
 * policy) the policy set must be exactly {system_scope}. Policies are permissive and OR
 * together: a stray `FOR SELECT USING (true)` on an empty PublicLead used to pass
 * `pnpm rls:verify` with exit 0, and `pnpm db:rls` left it in place.
 *
 * 1. `scripts/check-rls-live.ts --require-db`, run for real as a child process, exits 1 and
 *    names the table and the stray policy.
 * 2. The NG-183 block of prisma/rls.sql — read out of the file, not copied — drops it and
 *    leaves {system_scope} on every system_scope table, and keeps a stray policy on a tenant
 *    table (that block must not touch tenant tables).
 *
 * Safe on any local database, the shared one included: the stray policies are
 * `TO pg_monitor`, a built-in role nothing here connects as, so no session's reads change
 * while they exist, and each test drops its own (named with a RUN id). rls:verify rolls back
 * every probe. Only the NG-183 block or the view block runs, not the whole rls.sql, so no other
 * table's policies are rebuilt under a parallel suite. DDL, so local databases only (isLocalDbUrl).
 *
 * The ExpertDirectoryEntry mutation tests (NG-188) are NOT safe on the shared "fabrika" database
 * (NG-206, review D-B1): they commit a mutated view, and only the `finally` restores it. A SIGKILL,
 * an OOM or a closed pane leaves the mutated view behind, so unconsented experts would be listed
 * or `email` readable for every session on that database. They skip by default (MUTATION_SKIP, with a
 * WARNING line naming the reason) and run only on an isolated database, e.g. a throwaway Docker Postgres,
 * opted in with RLS_MUTATION_DB=<that database's name>. "fabrika" is never opted in off GitHub Actions.
 * In GitHub Actions the CI database is allowed (isGithubActions).
 */
const SUITE = 'rls:verify system_scope policy set live test';
const REPO = resolve(import.meta.dirname, '..');
const TSX = join(REPO, 'node_modules/.bin/tsx');
const OWNER_URL = envValue('DATABASE_URL');
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const RUN = randomBytes(4).toString('hex');
const STRAY = `ng183_stray_${RUN}`;
const STRAY_TENANT = `ng183_tenant_${RUN}`;
const SYSTEM_SCOPE_TABLES = ['CookieConsentRecord', 'ExpertFounderCounter', 'ExpertPreRegAttempt', 'ExpertPreRegistration', 'ProvinceLeadRoute', 'PublicLead'];
/**
 * No permissive exception since NG-188: NG-52's expert_directory policy on ExpertPreRegistration was
 * replaced by the view "ExpertDirectoryEntry". NG-243: the four intake tables also carry the
 * RESTRICTIVE intake_no_update / intake_no_delete (INTAKE_APPEND_ONLY), which only shut rows.
 */
const INTAKE_EXTRA = [...INTAKE_APPEND_ONLY_POLICIES.map((p) => p.policy)].sort();
const expectedSet = (t: string) => (INTAKE_APPEND_ONLY.has(t) ? [...INTAKE_EXTRA, 'system_scope'] : ['system_scope']);
/** The suffix rls:verify prints after "beklenen tam {system_scope}" on an intake table. */
const INTAKE_SUFFIX = ` (+ ${INTAKE_APPEND_ONLY_POLICIES.map((p) => `${p.policy} (${p.cmd})`).join(', ')})`;
const TENANT_TABLE = 'AddOn';
const EXPERT_DIRECTORY_BACK = `ExpertPreRegistration: politika kümesi {expert_directory, intake_no_delete, intake_no_update, system_scope}, beklenen tam {system_scope}${INTAKE_SUFFIX} — fazla: expert_directory (SELECT)`;

const admin = new pg.Client({ connectionString: OWNER_URL ?? 'postgresql://localhost:5432/unset', connectionTimeoutMillis: 3000 });
const REACHABLE = Boolean(OWNER_URL && RLS_URL) && (await admin.connect().then(() => true).catch(() => false));
if (!OWNER_URL || !RLS_URL) skipOrFailInCi(SUITE, 'DATABASE_URL / DATABASE_URL_RLS_TEST is not set');
else if (!REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable');
const LOCAL = REACHABLE && isLocalDbUrl(OWNER_URL!);
if (REACHABLE && !LOCAL) skipOrFailInCi(SUITE, 'DATABASE_URL is not a local database; this suite runs DDL');
const HAS_DB = REACHABLE && LOCAL;
/**
 * NG-206 (D-B1): the name the server reports for the owner connection, which the rls:verify child
 * processes also use (same OWNER_URL). Read from the server, not parsed from the URL, so a
 * DATABASE_URL that only .env holds cannot slip past the guard.
 */
const DB_NAME = LOCAL ? (await admin.query<{ db: string }>('select current_database() as db')).rows[0]?.db : undefined;
/** The shared dev database is "fabrika" everywhere except ci.yml's service container. */
const SHARED_DB = DB_NAME === 'fabrika' && !isGithubActions();
/**
 * NG-206 (review tur 2): allowlist, not a name denylist. A shared database with any other name
 * (`fabrika_dev`, a quoted `"Fabrika"`) must not run these tests by default. Off GitHub Actions they
 * run only when RLS_MUTATION_DB names exactly the database the owner connection is on, and off GitHub Actions never on "fabrika".
 */
const MUTATION_ALLOWED = isGithubActions() || (DB_NAME !== undefined && !SHARED_DB && process.env.RLS_MUTATION_DB === DB_NAME);
const MUTATION_SKIP = !MUTATION_ALLOWED;
if (HAS_DB && MUTATION_SKIP) {
  skipOrFailInCi(
    `${SUITE} (ExpertDirectoryEntry mutation tests)`,
    `they commit a mutated view and restore it only in \`finally\`; not allowed on "${DB_NAME}" — run on an isolated database and set RLS_MUTATION_DB=<its name>`
  );
}

/** The NG-183 cleanup block of prisma/rls.sql, verbatim. */
function ng183Block(): string {
  const sql = readFileSync(join(REPO, 'prisma/rls.sql'), 'utf8');
  const start = sql.indexOf('-- NG-183 (NG-175 review Düşük-1)');
  if (start < 0) throw new Error('prisma/rls.sql: NG-183 block not found');
  const doAt = sql.indexOf('DO $$', start);
  const end = sql.indexOf('END $$;', doAt);
  if (doAt < 0 || end < 0) throw new Error('prisma/rls.sql: NG-183 DO block not found');
  return sql.slice(doAt, end + 'END $$;'.length);
}

/** The NG-243 block of prisma/rls.sql (intake_no_update / intake_no_delete), verbatim — restores the real policies. */
function intakeBlock(): string {
  const sql = readFileSync(join(REPO, 'prisma/rls.sql'), 'utf8');
  const start = sql.indexOf('-- NG-243 (NG-9 review Ö-1)');
  if (start < 0) throw new Error('prisma/rls.sql: NG-243 block not found');
  const doAt = sql.indexOf('DO $$', start);
  const end = sql.indexOf('END $$;', doAt);
  return sql.slice(doAt, end + 'END $$;'.length);
}

/** The ExpertDirectoryEntry block of prisma/rls.sql (DROP VIEW … grants), verbatim — restores the real view. */
function expertDirectoryView(): string {
  const sql = readFileSync(join(REPO, 'prisma/rls.sql'), 'utf8');
  const start = sql.indexOf('DROP VIEW IF EXISTS public."ExpertDirectoryEntry";');
  const end = sql.indexOf('END $$;', start);
  if (start < 0 || end < 0) throw new Error('prisma/rls.sql: ExpertDirectoryEntry view block not found');
  return sql.slice(start, end + 'END $$;'.length);
}

/** The view's CREATE statement from prisma/rls.sql, passed through `mutate` (a mutation under test). */
function mutatedView(mutate: (create: string) => string): string {
  const block = expertDirectoryView();
  const start = block.indexOf('CREATE VIEW public."ExpertDirectoryEntry"');
  const create = block.slice(start, block.indexOf(';', start) + 1);
  const out = mutate(create);
  if (out === create) throw new Error('mutation did not change the view');
  return `DROP VIEW IF EXISTS public."ExpertDirectoryEntry"; ${out} GRANT SELECT ON public."ExpertDirectoryEntry" TO fabrika_app;`;
}

function rlsVerify(): { status: number | null; out: string } {
  const run = spawnSync(TSX, ['scripts/check-rls-live.ts', '--require-db'], {
    cwd: REPO,
    env: { ...process.env, DATABASE_URL: OWNER_URL, DATABASE_URL_RLS_TEST: RLS_URL },
    encoding: 'utf8',
    timeout: 170_000,
  });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

async function policySets(): Promise<Record<string, string[]>> {
  const { rows } = await admin.query<{ t: string; p: string[] }>(
    `select tablename as t, array_agg(policyname::text order by policyname) as p
       from pg_policies where schemaname = 'public' and tablename = any($1) group by tablename`,
    [SYSTEM_SCOPE_TABLES]
  );
  return Object.fromEntries(rows.map((r) => [r.t, r.p]));
}

async function dropStrays(): Promise<void> {
  await admin.query(`drop policy if exists ${STRAY} on "PublicLead"`);
  await admin.query(`drop policy if exists ${STRAY} on "ProvinceLeadRoute"`);
  await admin.query(`drop policy if exists ${STRAY} on "ExpertPreRegistration"`);
  await admin.query(`drop policy if exists expert_directory on "PublicLead"`);
  await admin.query(`drop policy if exists expert_directory on "ExpertPreRegistration"`);
  await admin.query(`drop policy if exists ${STRAY_TENANT} on "${TENANT_TABLE}"`);
  await admin.query(`drop policy if exists intake_no_update on "ProvinceLeadRoute"`);
}

describe.skipIf(!HAS_DB)('NG-183: system_scope tables carry exactly {system_scope}', () => {
  // NG-346: this file's DO block takes ACCESS EXCLUSIVE on PublicLead / ProvinceLeadRoute; hold the
  // PublicLead DDL lock for the whole file so no province or stuck-lead test reads them meanwhile.
  let releasePublicLeadLock: (() => Promise<void>) | undefined;
  beforeAll(async () => {
    releasePublicLeadLock = await holdTestDbLock(OWNER_URL!, PUBLIC_LEAD_TABLE_LOCK);
    // Precondition, so a red below is this suite's mutation and not a dirty database.
    const sets = await policySets();
    for (const t of SYSTEM_SCOPE_TABLES) if (sets[t]) expect(sets[t], t).toEqual(expectedSet(t));
  });
  // NG-384: dropStrays() drops expert_directory on ExpertPreRegistration, so it runs under the expert lock too.
  afterEach(() => withTestDbLock(OWNER_URL!, EXPERT_DIRECTORY_POLICY_LOCK, dropStrays));
  afterAll(async () => {
    await dropStrays().catch(() => {});
    await admin.end();
    await releasePublicLeadLock?.();
  });

  it('rls:verify --require-db exits 1 on a stray SELECT-only policy on PublicLead', async () => {
    await admin.query(`create policy ${STRAY} on "PublicLead" for select to pg_monitor using (true)`);
    const run = spawnSync(TSX, ['scripts/check-rls-live.ts', '--require-db'], {
      cwd: REPO,
      env: { ...process.env, DATABASE_URL: OWNER_URL, DATABASE_URL_RLS_TEST: RLS_URL },
      encoding: 'utf8',
      timeout: 170_000,
    });
    const out = `${run.stdout}${run.stderr}`;
    expect(run.status, out.slice(-2000)).toBe(1);
    expect(out).toContain(
      `PublicLead: politika kümesi {intake_no_delete, intake_no_update, ${STRAY}, system_scope}, beklenen tam {system_scope}${INTAKE_SUFFIX} — fazla: ${STRAY} (SELECT)`
    );
  }, 180_000);

  it('rls:verify --require-db exits 1 when the NG-52 expert_directory policy comes back on ExpertPreRegistration (NG-188)', async () => {
    // The policy filtered rows, not columns (SEC NG-185 F-1): with it back, the sealed
    // 'expert-directory' scope would read fullName, email, ORCID and IP hash again. No longer an
    // exception, so the catalogue check names it. TO pg_monitor: no real session reads through it.
    // NG-384: the policy is visible to every fabrika_app read of ExpertPreRegistration until dropStrays,
    // so the expert-prereg files must not read the table meanwhile: hold their lock for the whole test.
    await withTestDbLock(OWNER_URL!, EXPERT_DIRECTORY_POLICY_LOCK, async () => {
      await admin.query(
        `create policy expert_directory on "ExpertPreRegistration" for select to pg_monitor using (status = 'verified' and "visibilityConsentAt" is not null)`
      );
      const { status, out } = rlsVerify();
      expect(status, out.slice(-2000)).toBe(1);
      expect(out).toContain(EXPERT_DIRECTORY_BACK);
    });
  }, 180_000);

  it.skipIf(MUTATION_SKIP)('rls:verify --require-db exits 1 when ExpertDirectoryEntry loses its verified + consent condition (NG-188 mutation)', async () => {
    await withTestDbLock(OWNER_URL!, EXPERT_DIRECTORY_POLICY_LOCK, async () => {
      try {
        await admin.query(
          mutatedView((v) => v.replace(`AND e.status = 'verified'\n     AND e."visibilityConsentAt" IS NOT NULL;`, 'AND true;'))
        );
        const { status, out } = rlsVerify();
        expect(status, out.slice(-2000)).toBe(1);
        expect(out).toContain('expert-directory: ExpertDirectoryEntry prob satırlarından görünen 3/3 (yalnız verified görünmeli) — doğrulanmamış/rızasız görünüyor: pending, disabled');
      } finally {
        await admin.query(expertDirectoryView());
      }
    });
  }, 180_000);

  it.skipIf(MUTATION_SKIP)('rls:verify --require-db exits 1 when ExpertDirectoryEntry gains a personal-data column (NG-188 mutation)', async () => {
    await withTestDbLock(OWNER_URL!, EXPERT_DIRECTORY_POLICY_LOCK, async () => {
      try {
        await admin.query(mutatedView((v) => v.replace('AS "listOrder"', 'AS "listOrder", e.email')));
        const { status, out } = rlsVerify();
        expect(status, out.slice(-2000)).toBe(1);
        expect(out).toMatch(/expert-directory: ExpertDirectoryEntry sütunları \{[^}]*\} — fazla: email/);
      } finally {
        await admin.query(expertDirectoryView());
      }
    });
  }, 180_000);

  /**
   * NG-191 (SEC NG-185 low finding): the expert_directory policy kept NG-52's qual but changed its
   * role list (`TO <app role>`) or its permissive flag (`AS RESTRICTIVE`), and rls:verify had to
   * say so. Since NG-188 there is no named exception left (SYSTEM_SCOPE_ALLOWED_EXTRA is empty and
   * rls.sql drops the policy), so the same two mutations are drift by name, whatever their roles
   * or flag. The qual is NG-52's, verbatim from rls.sql before NG-188, so a real reader would see
   * directory rows through it: committed DDL that opens rows, hence MUTATION_SKIP (NG-206) and
   * EXPERT_DIRECTORY_POLICY_LOCK like the view mutations above, and dropped in finally.
   */
  const NG52_EXPERT_DIRECTORY_QUAL = `(SELECT coalesce(current_setting('app.system_scope', true) = 'on', false)
                 AND coalesce(current_setting('app.system_scope_purpose', true), '') = 'expert-directory'
                 AND public.system_scope_sealed())
         AND status = 'verified'
         AND "visibilityConsentAt" IS NOT NULL`;

  async function rlsVerifyWithExpertDirectory(clauses: string): Promise<{ status: number | null; out: string }> {
    return withTestDbLock(OWNER_URL!, EXPERT_DIRECTORY_POLICY_LOCK, async () => {
      try {
        await admin.query(`create policy expert_directory on "ExpertPreRegistration" ${clauses} using (${NG52_EXPERT_DIRECTORY_QUAL})`);
        return rlsVerify();
      } finally {
        await admin.query(`drop policy if exists expert_directory on "ExpertPreRegistration"`);
      }
    });
  }

  it.skipIf(MUTATION_SKIP)('rls:verify --require-db exits 1 when expert_directory comes back with its qual, granted to the app role (NG-191)', async () => {
    // TO <the measured app role>: the sealed 'expert-directory' scope reads the base table again,
    // personal-data columns included — the catalogue check and the behaviour probe both say so.
    // The app role is read from the server on the RLS connection (select current_user), not parsed from the URL.
    const appConn = new pg.Client({ connectionString: RLS_URL!, connectionTimeoutMillis: 3000 });
    await appConn.connect();
    const appRole = await appConn.query<{ role: string }>('select current_user as role').finally(() => appConn.end()).then((r) => r.rows[0]!.role);
    const { status, out } = await rlsVerifyWithExpertDirectory(`for select to ${appRole}`);
    expect(status, out.slice(-2000)).toBe(1);
    expect(out).toContain(EXPERT_DIRECTORY_BACK);
    expect(out).toMatch(/expert-directory: ExpertPreRegistration [1-9]\d* satır okunuyor/);
  }, 180_000);

  it.skipIf(MUTATION_SKIP)('rls:verify --require-db exits 1 when expert_directory comes back with its qual, AS RESTRICTIVE (NG-191)', async () => {
    const { status, out } = await rlsVerifyWithExpertDirectory('as restrictive for select');
    expect(status, out.slice(-2000)).toBe(1);
    expect(out).toContain(EXPERT_DIRECTORY_BACK);
  }, 180_000);

  it('rls:verify --require-db exits 1 when an intake append-only policy is not the one rls.sql writes (NG-243)', async () => {
    // RESTRICTIVE, so it can only shut rows: no reader sees more through it. Restored in finally.
    try {
      await admin.query(`drop policy intake_no_delete on "PublicLead"`);
      await admin.query(`create policy intake_no_delete on "PublicLead" as restrictive for delete using (true)`);
      const { status, out } = rlsVerify();
      expect(status, out.slice(-2000)).toBe(1);
      expect(out).toContain(`PublicLead: politika kümesi {intake_no_delete, intake_no_update, system_scope}, beklenen tam {system_scope}${INTAKE_SUFFIX} — fazla: intake_no_delete (DELETE) — intake_no_delete sapması: qual rls.sql'deki ifadeden farklı`);
      expect(out).toMatch(/append-only: PublicLead public-intake ile UPDATE 0, DELETE 1 satır \(0 beklenir\)/);
    } finally {
      await admin.query(intakeBlock());
    }
  }, 180_000);

  it('the NG-183 block of prisma/rls.sql drops stray policies on system_scope tables only', async () => {
    // NG-384: the block DROPs policies on ExpertPreRegistration and this test creates expert_directory
    // there; hold the expert lock for the whole test so no expert-prereg read sees the policy.
    await withTestDbLock(OWNER_URL!, EXPERT_DIRECTORY_POLICY_LOCK, async () => {
      await admin.query(`create policy ${STRAY} on "PublicLead" for select to pg_monitor using (true)`);
      await admin.query(`create policy ${STRAY} on "ProvinceLeadRoute" to pg_monitor using (true) with check (true)`);
      await admin.query(`create policy ${STRAY_TENANT} on "${TENANT_TABLE}" for select to pg_monitor using (false)`);
      await admin.query(`create policy ${STRAY} on "ExpertPreRegistration" for select to pg_monitor using (true)`);
      await admin.query(`create policy expert_directory on "PublicLead" for select to pg_monitor using (true)`);
      // NG-188: the NG-52 exception is gone; the old policy is dropped like any stray one.
      await admin.query(`create policy expert_directory on "ExpertPreRegistration" for select to pg_monitor using (true)`);
      // NG-243: a PERMISSIVE policy under an append-only name would OPEN rows; it is dropped as a
      // stray (only the RESTRICTIVE ones are kept). A RESTRICTIVE one on another table is dropped too.
      await admin.query(`drop policy intake_no_update on "CookieConsentRecord"`);
      await admin.query(`create policy intake_no_update on "CookieConsentRecord" for update to pg_monitor using (true)`);
      await admin.query(`create policy intake_no_update on "ProvinceLeadRoute" as restrictive for update to pg_monitor using (true)`);
      expect((await policySets()).PublicLead).toContain(STRAY);

      await admin.query(ng183Block());
      const permissiveLeft = await admin.query(`select 1 from pg_policies where tablename = 'CookieConsentRecord' and policyname = 'intake_no_update'`);
      expect(permissiveLeft.rowCount, 'a permissive intake_no_update must be dropped').toBe(0);
      await admin.query(intakeBlock());

      const sets = await policySets();
      for (const t of SYSTEM_SCOPE_TABLES) if (sets[t]) expect(sets[t], t).toEqual(expectedSet(t));
      const kept = await admin.query('select 1 from pg_policies where tablename = $1 and policyname = $2', [TENANT_TABLE, STRAY_TENANT]);
      expect(kept.rowCount, 'tenant table policy must be left alone').toBe(1);
    });
  });
});
