import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { envValue } from './helpers/dotenv';
import { isLocalDbUrl, skipOrFailInCi } from './helpers/live-db-role';

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
 * every probe. Only the NG-183 block runs, not the whole rls.sql, so no other table's policies
 * are rebuilt under a parallel suite. DDL, so local databases only (isLocalDbUrl).
 */
const SUITE = 'rls:verify system_scope policy set live test';
const REPO = resolve(import.meta.dirname, '..');
const TSX = join(REPO, 'node_modules/.bin/tsx');
const OWNER_URL = envValue('DATABASE_URL');
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const RUN = randomBytes(4).toString('hex');
const STRAY = `ng183_stray_${RUN}`;
const STRAY_TENANT = `ng183_tenant_${RUN}`;
const SYSTEM_SCOPE_TABLES = ['ExpertFounderCounter', 'ExpertPreRegAttempt', 'ExpertPreRegistration', 'ProvinceLeadRoute', 'PublicLead'];
const TENANT_TABLE = 'AddOn';

const admin = new pg.Client({ connectionString: OWNER_URL ?? 'postgresql://localhost:5432/unset', connectionTimeoutMillis: 3000 });
const REACHABLE = Boolean(OWNER_URL && RLS_URL) && (await admin.connect().then(() => true).catch(() => false));
if (!OWNER_URL || !RLS_URL) skipOrFailInCi(SUITE, 'DATABASE_URL / DATABASE_URL_RLS_TEST is not set');
else if (!REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable');
const LOCAL = REACHABLE && isLocalDbUrl(OWNER_URL!);
if (REACHABLE && !LOCAL) skipOrFailInCi(SUITE, 'DATABASE_URL is not a local database; this suite runs DDL');
const HAS_DB = REACHABLE && LOCAL;

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
  await admin.query(`drop policy if exists ${STRAY_TENANT} on "${TENANT_TABLE}"`);
}

describe.skipIf(!HAS_DB)('NG-183: system_scope tables carry exactly {system_scope}', () => {
  beforeAll(async () => {
    // Precondition, so a red below is this suite's mutation and not a dirty database.
    const sets = await policySets();
    for (const t of SYSTEM_SCOPE_TABLES) if (sets[t]) expect(sets[t], t).toEqual(['system_scope']);
  });
  afterEach(dropStrays);
  afterAll(async () => {
    await dropStrays().catch(() => {});
    await admin.end();
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
    expect(out).toContain(`PublicLead: politika kümesi {${STRAY}, system_scope}, beklenen tam {system_scope} — fazla: ${STRAY} (SELECT)`);
  }, 180_000);

  it('the NG-183 block of prisma/rls.sql drops stray policies on system_scope tables only', async () => {
    await admin.query(`create policy ${STRAY} on "PublicLead" for select to pg_monitor using (true)`);
    await admin.query(`create policy ${STRAY} on "ProvinceLeadRoute" to pg_monitor using (true) with check (true)`);
    await admin.query(`create policy ${STRAY_TENANT} on "${TENANT_TABLE}" for select to pg_monitor using (false)`);
    expect((await policySets()).PublicLead).toContain(STRAY);

    await admin.query(ng183Block());

    const sets = await policySets();
    for (const t of SYSTEM_SCOPE_TABLES) if (sets[t]) expect(sets[t], t).toEqual(['system_scope']);
    const kept = await admin.query('select 1 from pg_policies where tablename = $1 and policyname = $2', [TENANT_TABLE, STRAY_TENANT]);
    expect(kept.rowCount, 'tenant table policy must be left alone').toBe(1);
  });
});
