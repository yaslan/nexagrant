import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-222 (K-583842 = A) — the negative side of `public.close_own_province_routes`, the narrow
 * SECURITY DEFINER door the tenant's settings and the billing webhooks use to close the tenant's
 * province routes when M18 leaves PILOT (prisma/migrations/add-close-own-province-routes.sql).
 * tests/m18-route-close-other-paths.live.test.ts shows the four paths close the route; this file
 * shows what the door does NOT do:
 *
 *   (a) M18 still open to the tenant (PILOT) → nothing closes. Pinned against the state machine's
 *       `isOpenToTenantMembers('M18', …)` for every ModuleStatus and for "no row".
 *   (b) called in tenant A's scope it never touches tenant B's route (it takes no tenant id).
 *   (c) only fabrika_app may EXECUTE it (PUBLIC / anon / authenticated / any other role refused),
 *       including right after its migration under Supabase's default privileges (NG-213 D-3).
 *   (d) a route set racing the tenant's own M18 close never ends "M18 closed + route active".
 *   Plus: no app.tenant_id → refused; a bad actor → refused; the system_scope flag it raises for
 *   the audit INSERT is back off when it returns (fabrika_app still reads 0 platform audit rows).
 *
 * Extra finding (NG-222 report): the settings action's ENABLE branch for M18 (PILOT → ON / DEV).
 *
 * Real Postgres, the code under test on `fabrika_app` (NOBYPASSRLS); fixtures and ground truth
 * through the owner role. Faked: the session (`requireTenantAction`, `requirePlatformAdmin`) and Next's cache.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) return t.slice(i + 1).replace(/^["']|["']$/g, '') || undefined;
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

const session = vi.hoisted(() => ({ tenantId: '', userId: '' }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: session.tenantId, userId: session.userId, role: 'TENANT_OWNER' }),
  requirePlatformAdmin: async () => ({ userId: session.userId }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

import { toggleModuleState } from '@/app/[locale]/(app)/[workspace]/settings/modules/actions';
import { PROVINCE_ROUTE_AUDIT, type ProvinceRouteResult } from '@/core/contracts/lead-routing';
import { createDbClient, prisma, withTenant } from '@/lib/db';
import { setProvinceLeadRoute } from '@/lib/leads/province-route';
import { isOpenToTenantMembers } from '@/lib/modules/state-machine';
import type { ModuleStatus } from '@/lib/modules/types';
import { assertRlsSubjectRole, isLocalDbUrl, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { sqlStatements } from './helpers/sql-statements';
import { requireId } from './helpers/teardown-guard';

const SUITE = 'm18 own route close (close_own_province_routes) test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

// (c) creates a role and replays a migration as the owner inside a rolled-back transaction: local only.
const DDL_LOCAL = HAS_DB && OWNER_URL !== undefined && isLocalDbUrl(OWNER_URL);
if (HAS_DB && !DDL_LOCAL) {
  skipOrFailInCi(`${SUITE} (role / migration replay)`, 'DATABASE_URL is not a local database (scripts/db-target.sh db_is_local) and the probe runs DDL');
}

const RUN = Math.random().toString(36).slice(2, 10);
const FN = 'public.close_own_province_routes(text, text)';

/** One tenant per case. No other test file routes these provinces. */
const T = {
  open: `ng222n-open-${RUN}`,
  pin: `ng222n-pin-${RUN}`,
  a: `ng222n-a-${RUN}`,
  b: `ng222n-b-${RUN}`,
  race: `ng222n-race-${RUN}`,
  enable: `ng222n-enable-${RUN}`,
} as const;
const TENANTS = [T.open, T.pin, T.a, T.b, T.race, T.enable];
/** As literals: a teardown `where` must not be computed (tests/teardown-where-guard.test.ts). */
const PROVINCES = ['Aksaray', 'Adıyaman', 'Amasya', 'Aydın', 'Bilecik'];
const USER_EMAIL = `ng222n-user-${RUN}@example.test`;
let USER = '';

/** The function, on fabrika_app, inside `tenantId`'s own tenant transaction. */
const closeOwn = (tenantId: string, actor: string, actorId: string | null) =>
  withTenant(tenantId, async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ closed: string[] }>>`SELECT public.close_own_province_routes(${actor}, ${actorId}::text) AS closed`;
    return row?.closed ?? [];
  });
const setM18 = (tenantId: string, status: ModuleStatus) =>
  admin.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId, moduleId: 'M18' } },
    create: { tenantId, moduleId: 'M18', status, changedBy: 'ng222n test' },
    update: { status },
  });
const m18 = async (tenantId: string) =>
  (await admin.moduleState.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId: 'M18' } }, select: { status: true } }))?.status ?? null;
const activeTargets = async (province: string) =>
  (await admin.provinceLeadRoute.findMany({ where: { province, active: true }, select: { targetTenantId: true } })).map((r) => r.targetTenantId);
const audits = (province: string) =>
  admin.auditEvent.count({ where: { tenantId: null, target: province, type: PROVINCE_ROUTE_AUDIT.deactivated } });

async function wipe(): Promise<void> {
  await admin.auditEvent.deleteMany({ where: { tenantId: null, target: { in: PROVINCES }, data: { path: ['fromTenantId'], string_starts_with: 'ng222n-' } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.moduleState.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES }, targetTenantId: { in: TENANTS } } });
  await admin.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  await admin.user.deleteMany({ where: { email: USER_EMAIL } });
}

/** Resolves once `release()` was called, or after `ms` — whichever is first (NG-215 race test). */
function latch(ms: number): { wait: () => Promise<void>; release: () => void } {
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  return { wait: () => Promise.race([done, new Promise<void>((r) => setTimeout(r, ms))]), release };
}

/** `prisma` whose transactions make the first ProvinceLeadRoute create/update wait for `gate` (NG-215 race test). */
function gatedDb(gate: () => Promise<void>): typeof prisma {
  const wrapTx = (tx: object): object => {
    let waited = false;
    const route = new Proxy(Reflect.get(tx, 'provinceLeadRoute') as object, {
      get(target, prop, receiver) {
        const value: unknown = Reflect.get(target, prop, receiver);
        if ((prop === 'create' || prop === 'update') && typeof value === 'function') {
          return async (...args: unknown[]) => {
            if (!waited) {
              waited = true;
              await gate();
            }
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    return new Proxy(tx, {
      get(target, prop, receiver) {
        if (prop === 'provinceLeadRoute') return route;
        const value: unknown = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  };
  return new Proxy(prisma, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (prop === '$transaction' && typeof value === 'function') {
        return (cb: (tx: object) => Promise<unknown>, opts?: unknown) =>
          (value as (c: unknown, o?: unknown) => Promise<unknown>).call(target, (tx: object) => cb(wrapTx(tx)), opts);
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

describe.skipIf(!HAS_DB)('close_own_province_routes: only the caller\'s own routes, only with M18 closed (NG-222)', () => {
  beforeAll(async () => {
    await wipe();
    USER = (await admin.user.create({ data: { email: USER_EMAIL, name: 'NG-222 negative user', isPlatformAdmin: true } })).id;
    for (const id of TENANTS) {
      await admin.tenant.create({ data: { id, name: id, slug: id, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' } });
      await setM18(id, 'PILOT');
    }
  });

  afterAll(async () => {
    await wipe();
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('the teardown list holds every province this file routes', () => {
    expect(PROVINCES).toEqual(['Aksaray', 'Adıyaman', 'Amasya', 'Aydın', 'Bilecik']);
  });

  test('(a) M18 still PILOT: the call closes nothing and writes no audit row', async () => {
    await admin.provinceLeadRoute.create({ data: { province: 'Aksaray', targetTenantId: T.open, active: true } });
    expect(await closeOwn(T.open, 'billing', null)).toEqual([]);
    expect(await closeOwn(T.open, 'tenant_user', USER)).toEqual([]);
    expect(await activeTargets('Aksaray')).toEqual([T.open]);
    expect(await audits('Aksaray')).toBe(0);
  });

  test.each<[ModuleStatus | null]>([['OFF'], ['DEV'], ['PILOT'], ['ON'], [null]])(
    '(a) pin: M18 %s → closes exactly when isOpenToTenantMembers says closed',
    async (status) => {
      await admin.provinceLeadRoute.deleteMany({ where: { province: 'Adıyaman', targetTenantId: requireId(T.pin, 'T.pin') } });
      await admin.moduleState.deleteMany({ where: { tenantId: requireId(T.pin, 'T.pin') } });
      if (status) await setM18(T.pin, status);
      await admin.provinceLeadRoute.create({ data: { province: 'Adıyaman', targetTenantId: T.pin, active: true } });
      const shouldClose = !isOpenToTenantMembers('M18', status ?? 'OFF');
      expect(await closeOwn(T.pin, 'billing', null)).toEqual(shouldClose ? ['Adıyaman'] : []);
      expect(await activeTargets('Adıyaman')).toEqual(shouldClose ? [] : [T.pin]);
    }
  );

  test('(b) in tenant A\'s scope it closes A\'s route and never B\'s — even when B\'s M18 is closed too', async () => {
    await setM18(T.a, 'OFF');
    await setM18(T.b, 'OFF');
    await admin.provinceLeadRoute.create({ data: { province: 'Amasya', targetTenantId: T.a, active: true } });
    // B's route left active on purpose (a state only a broken writer leaves): A's call must not repair it.
    await admin.provinceLeadRoute.create({ data: { province: 'Aydın', targetTenantId: T.b, active: true } });

    expect(await closeOwn(T.a, 'tenant_user', USER)).toEqual(['Amasya']);
    expect(await activeTargets('Amasya')).toEqual([]);
    expect(await activeTargets('Aydın')).toEqual([T.b]);
    expect(await audits('Aydın')).toBe(0);

    const [row] = await admin.auditEvent.findMany({ where: { tenantId: null, target: 'Amasya', type: PROVINCE_ROUTE_AUDIT.deactivated }, select: { actorId: true, data: true } });
    expect(row).toEqual({
      actorId: USER,
      data: { province: 'Amasya', fromTenantId: T.a, toTenantId: null, reason: 'module_closed', moduleId: 'M18', newStatus: 'OFF', actor: 'tenant_user' },
    });
    expect(JSON.stringify(row?.data)).not.toContain(USER_EMAIL);
  });

  test('(b) the signature names no tenant: two text arguments, actor and actor id', async () => {
    const [fn] = await admin.$queryRaw<Array<{ args: string }>>`SELECT pg_get_function_arguments(${FN}::regprocedure) AS args`;
    expect(fn?.args).toBe('p_actor text, p_actor_id text');
  });

  test('no app.tenant_id: refused, nothing closed', async () => {
    await expect(prisma.$queryRaw`SELECT public.close_own_province_routes('billing', NULL::text)`).rejects.toThrow(/app\.tenant_id is not set/);
  });

  test.each([
    ['tenant_user', null],
    ['billing', 'someone'],
    ['platform-admin', null],
    [null, null],
  ])('actor %s / %s: refused', async (actor, actorId) => {
    await expect(closeOwn(T.open, actor as string, actorId)).rejects.toThrow(/actor must be/);
  });

  test('the system_scope flag is off again when it returns; fabrika_app still reads no platform audit row', async () => {
    await setM18(T.a, 'OFF');
    await admin.provinceLeadRoute.updateMany({ where: { province: 'Amasya', targetTenantId: requireId(T.a, 'T.a') }, data: { active: true } });
    const after = await withTenant(T.a, async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ closed: string[] }>>`SELECT public.close_own_province_routes('billing', NULL::text) AS closed`;
      const [flag] = await tx.$queryRaw<Array<{ v: string | null }>>`SELECT current_setting('app.system_scope', true) AS v`;
      const platformAudits = await tx.auditEvent.count({ where: { tenantId: null } });
      const routesSeen = await tx.provinceLeadRoute.count();
      return { closed: r?.closed, flag: flag?.v ?? null, platformAudits, routesSeen };
    });
    expect(after.closed).toEqual(['Amasya']);
    expect(after.flag === null || after.flag === '').toBe(true);
    expect(after.platformAudits).toBe(0);
    expect(after.routesSeen).toBe(0);
  });

  test('(c) SECURITY DEFINER, fixed search_path, EXECUTE for fabrika_app only (PUBLIC, anon, authenticated refused)', async () => {
    const [fn] = await admin.$queryRaw<Array<{ definer: boolean; config: string[] | null; pub: boolean; anon: boolean | null; auth: boolean | null; app: boolean }>>`
      SELECT p.prosecdef AS definer, p.proconfig AS config,
             EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub,
             CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon,
             CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS auth,
             has_function_privilege('fabrika_app', p.oid, 'EXECUTE') AS app
        FROM pg_proc p WHERE p.oid = ${FN}::regprocedure`;
    expect(fn).toMatchObject({ definer: true, config: ['search_path=public, pg_temp'], pub: false, app: true });
    expect(fn?.anon).not.toBe(true);
    expect(fn?.auth).not.toBe(true);
  });

  test.skipIf(!DDL_LOCAL)('(c) a role other than fabrika_app cannot EXECUTE it', async () => {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: OWNER_URL });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE ROLE ng222n_probe NOLOGIN');
      await client.query('GRANT USAGE ON SCHEMA public TO ng222n_probe');
      await client.query('SET LOCAL ROLE ng222n_probe');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [T.a]);
      await expect(client.query(`SELECT public.close_own_province_routes('billing', NULL::text)`)).rejects.toThrow(/permission denied for function close_own_province_routes/);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  });

  test.skipIf(!DDL_LOCAL)('(c) right after its migration, under Supabase default privileges: no EXECUTE for anon / authenticated; fabrika_app keeps it', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { default: pg } = await import('pg');
    const statements = sqlStatements(readFileSync(resolve(process.cwd(), 'prisma/migrations/add-close-own-province-routes.sql'), 'utf8'));
    const client = new pg.Client({ connectionString: OWNER_URL });
    await client.connect();
    try {
      await client.query('BEGIN');
      for (const role of ['anon', 'authenticated']) {
        const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
        if (!rowCount) await client.query(`CREATE ROLE ${role} NOLOGIN`);
      }
      await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated');
      await client.query(`DROP FUNCTION ${FN}`);
      for (const statement of statements) await client.query(statement);
      const { rows } = await client.query<{ anon: boolean; auth: boolean; app: boolean; pub: boolean }>(
        `SELECT has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') AS auth,
                has_function_privilege('fabrika_app', $1::regprocedure, 'EXECUTE') AS app,
                EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                         WHERE p.oid = $1::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub`,
        [FN],
      );
      expect(rows[0]).toEqual({ anon: false, auth: false, app: true, pub: false });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  });

  test('(d) a route set racing the tenant\'s own M18 close never leaves "M18 closed + route active"', async () => {
    await setM18(T.race, 'PILOT');
    session.userId = USER;
    session.tenantId = T.race;
    const gate = latch(1500);
    const set = setProvinceLeadRoute({ province: 'Bilecik', tenantId: T.race }, USER, gatedDb(gate.wait));
    // The set has locked the tenant row and read M18 = PILOT; it now waits before its route write.
    await new Promise((r) => setTimeout(r, 300));
    const close = toggleModuleState('M18', 'OFF').then(() => undefined, (e: unknown) => e);
    const early = await Promise.race([close, new Promise((r) => setTimeout(r, 1200)).then(() => 'pending')]);
    gate.release();
    const result: ProvinceRouteResult = await set;
    const closeError = early === 'pending' ? await close : early;

    // NG-228 (NG-222 SEC B5): the close really waited on the set's tenant lock — without it this
    // test would pass on an unlocked close too.
    expect(early, 'the close waited for the set').toBe('pending');
    expect(closeError).toBeUndefined();
    expect(await m18(T.race)).toBe('OFF');
    expect(await activeTargets('Bilecik')).toEqual([]);
    // The set won the tenant lock (it locked first), so it committed; the close then saw and closed its route.
    expect(result.ok).toBe(true);
    expect(await audits('Bilecik')).toBe(1);
  }, 20_000);

  /**
   * Extra finding (NG-222 report, M18 writers): can the tenant's settings move M18 from PILOT to ON
   * or DEV? Both would close M18 to the tenant's own people (an unsold beta opens at PILOT only) and
   * bypass the route close, which this action ran only on its OFF branch. Closed by NG-228: the
   * action takes ON/OFF only and runs the route close on ON too.
   */
  describe('settings ENABLE branch for M18 (NG-222 extra finding)', () => {
    // NG-228: DEV is refused before the plan check (the tenant action takes ON/OFF only); ON is
    // still refused by entitlement here, and closes the route when a plan grants M18
    // (tests/m18-settings-on-off-only.live.test.ts).
    test.each<[ModuleStatus, RegExp]>([
      ['ON', /Modül etkinleştirilemez: Plan upgrade required/],
      ['DEV', /Geçersiz modül durumu/],
    ])('PILOT → %s from the tenant\'s settings is refused and M18 stays PILOT', async (target, refusal) => {
      await setM18(T.enable, 'PILOT');
      session.userId = USER;
      session.tenantId = T.enable;
      await expect(toggleModuleState('M18', target)).rejects.toThrow(refusal);
      expect(await m18(T.enable)).toBe('PILOT');
    });
  });
});
