import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * FO-251 (TASK-MVUPDPI22QCAX) — `pnpm db:seed` on an empty database, as a
 * production deploy runs it and as CI/e2e run it.
 *
 * The seed used to be one block: on a fresh production database it either left
 * the plan and module catalogue empty or opened `demo-tenant` with its demo
 * users. Now reference data is written on every run and the demo part only
 * when SEED_DEMO is on (default: on outside production, off in it).
 *
 * The real script runs as a child process against a database this file creates
 * (`prisma db push`, the first step of scripts/db-setup.sh) and drops again;
 * the shared database is never seeded. Each mode runs twice, and the row counts
 * after the second run must equal the first: the seed stays idempotent.
 * `.live`: needs the docker-compose Postgres (`pnpm db:setup`).
 */

const SUITE = 'seed demo split live test';
const REPO = resolve(import.meta.dirname, '..');
const TSX = join(REPO, 'node_modules/.bin/tsx');
const PRISMA = join(REPO, 'node_modules/.bin/prisma');
const ADMIN_URL = envValue('DATABASE_URL');
const DB = `fo251seed_${Date.now()}_${randomUUID().slice(0, 8)}`;

const TABLES = [
  'Plan',
  'PlanVersion',
  'ModuleCatalog',
  'AddOnCatalog',
  'Programme',
  'ConceptTemplate',
  'InterregRubric',
  'Tenant',
  'User',
  'Call',
  'Opportunity',
] as const;
type Counts = Record<(typeof TABLES)[number], number>;

function serverUrl(database: string): string {
  const url = new URL(ADMIN_URL as string);
  url.pathname = `/${database}`;
  return url.toString();
}

type Run = { status: number | null; output: string };
type SeedEnv = { NODE_ENV: 'development' | 'test' | 'production'; SEED_DEMO: '' | 'true' | 'false' };

/** The real child process, with exactly the NODE_ENV / SEED_DEMO given (blank = unset, so ./.env cannot fill it). */
function run(bin: string, args: string[], env: SeedEnv): Run {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: serverUrl(DB), ...env };
  const r = spawnSync(bin, args, { cwd: REPO, env: childEnv, encoding: 'utf8', timeout: 300_000 });
  return { status: r.status, output: `${r.stdout}${r.stderr}${r.error ? String(r.error) : ''}` };
}
const seed = (env: SeedEnv) => run(TSX, ['prisma/seed.ts'], env);

const admin = ADMIN_URL ? new pg.Client({ connectionString: serverUrl('postgres') }) : undefined;
let reachable = false;
if (admin) {
  await admin.connect().then(
    () => (reachable = true),
    () => undefined
  );
}
if (!reachable) {
  await admin?.end().catch(() => undefined);
  skipOrFailInCi(SUITE, ADMIN_URL ? 'database unavailable' : 'DATABASE_URL is not set');
}

describe.skipIf(!reachable)(SUITE, () => {
  let created = false;
  let push: Run | undefined;
  const runs: Record<string, Run> = {};
  const counts: Record<string, Counts> = {};
  let demoTenantAfterReference = -1;
  let demoTenantAfterDefault = -1;

  async function onDb<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
    const client = new pg.Client({ connectionString: serverUrl(DB) });
    await client.connect();
    try {
      return (await client.query<T>(sql)).rows;
    } finally {
      await client.end();
    }
  }
  async function snapshot(): Promise<Counts> {
    const sql = TABLES.map((t) => `(SELECT count(*)::int FROM "${t}") AS "${t}"`).join(', ');
    return (await onDb<Counts>(`SELECT ${sql}`))[0]!;
  }
  const demoTenantRows = async () =>
    (await onDb<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = 'demo-tenant'`))[0]!.n;

  beforeAll(async () => {
    await admin!.query(`CREATE DATABASE "${DB}"`);
    created = true;
    push = run(PRISMA, ['db', 'push'], { NODE_ENV: 'test', SEED_DEMO: '' });
    if (push.status !== 0) return;

    // A production deploy: NODE_ENV=production, SEED_DEMO unset.
    for (const i of [1, 2]) {
      runs[`prod${i}`] = seed({ NODE_ENV: 'production', SEED_DEMO: '' });
      counts[`prod${i}`] = await snapshot();
    }
    demoTenantAfterReference = await demoTenantRows();
    // Explicit off outside production.
    runs.off = seed({ NODE_ENV: 'test', SEED_DEMO: 'false' });
    counts.off = await snapshot();
    // CI / e2e / pnpm db:seed: SEED_DEMO unset outside production.
    for (const i of [1, 2]) {
      runs[`default${i}`] = seed({ NODE_ENV: 'test', SEED_DEMO: '' });
      counts[`default${i}`] = await snapshot();
    }
    demoTenantAfterDefault = await demoTenantRows();
  }, 900_000);

  afterAll(async () => {
    if (admin) {
      if (created) await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  }, 120_000);

  it('builds the scratch schema', () => {
    expect(push?.status, push?.output).toBe(0);
  });

  it('production default: reference data written, no demo tenant, no users', () => {
    for (const k of ['prod1', 'prod2']) {
      expect(runs[k]?.status, runs[k]?.output).toBe(0);
      expect(runs[k]?.output).toContain('reference data only');
    }
    const c = counts.prod1!;
    for (const t of ['Plan', 'PlanVersion', 'ModuleCatalog', 'AddOnCatalog', 'Programme', 'ConceptTemplate', 'InterregRubric'] as const) {
      expect(c[t], t).toBeGreaterThan(0);
    }
    expect(c.ModuleCatalog).toBe(11);
    expect(demoTenantAfterReference).toBe(0);
    expect({ Tenant: c.Tenant, User: c.User, Call: c.Call, Opportunity: c.Opportunity }).toEqual({
      Tenant: 0,
      User: 0,
      Call: 0,
      Opportunity: 0,
    });
  });

  it('reference-only run is idempotent', () => {
    expect(counts.prod2).toEqual(counts.prod1);
  });

  it('SEED_DEMO=false outside production writes no demo data either', () => {
    expect(runs.off?.status, runs.off?.output).toBe(0);
    expect(counts.off).toEqual(counts.prod1);
  });

  it('default outside production keeps the old behaviour: demo tenant, users, calls, opportunities', () => {
    for (const k of ['default1', 'default2']) {
      expect(runs[k]?.status, runs[k]?.output).toBe(0);
      expect(runs[k]?.output).toContain('Seeding completed with E10 data.');
    }
    expect(demoTenantAfterDefault).toBe(1);
    const c = counts.default1!;
    expect(c.User).toBeGreaterThan(0);
    expect(c.Call).toBeGreaterThan(0);
    expect(c.Opportunity).toBeGreaterThan(0);
    // Reference rows are the same ones, not a second copy.
    for (const t of ['Plan', 'PlanVersion', 'ModuleCatalog', 'AddOnCatalog', 'Programme', 'ConceptTemplate', 'InterregRubric'] as const) {
      expect(c[t], t).toBe(counts.prod1![t]);
    }
  });

  it('full run is idempotent', () => {
    expect(counts.default2).toEqual(counts.default1);
  });
});
