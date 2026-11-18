import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-215 re-review (SEC Bulgu 1) — a route set while the target's M18 is being closed.
 *
 * `setProvinceLeadRoute` checked M18 with a plain read and `deactivateRoutesOfClosedTarget` listed
 * the active routes with a plain read. Under READ COMMITTED, admin A setting Karabük → X while
 * admin B turns X's M18 OFF could commit both: B's close saw no route (A had not committed yet),
 * A's set had read M18 as PILOT (B had not committed yet). End state: M18 OFF, route active — the
 * invariant NG-215 exists for.
 *
 * The interleaving is made deterministic: the set's transaction waits just before its route write
 * until the module close has finished, or 1.5 s have passed. Without a lock the close finishes
 * first and the race happens every time; with the tenant-row lock the close waits for the set,
 * the set proceeds after the timeout, and the close then sees (and closes) the new route.
 *
 * Second case, same window, a MOVE: Batman → A is moved to B while A's M18 is closed. Without a
 * lock on A the close deactivated the row the move was about to retarget; the move then wrote B
 * onto an inactive row and reported success.
 *
 * Third case (SEC Bulgu 8 note): the module write fails after the routes were closed → the route
 * close rolls back with it. The failure is a real one: a trigger on ModuleState refuses this
 * test's actor only.
 *
 * Real Postgres, the code under test on `fabrika_app` (NOBYPASSRLS); fixtures and ground truth
 * through the owner role. Only the session (`requirePlatformAdmin`) and Next's cache are faked.
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

const session = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/tenant', () => ({ requirePlatformAdmin: async () => ({ userId: session.userId }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

import { updateTenantModuleStatus } from '@/app/[locale]/admin/modules/actions';
import type { ProvinceRouteResult } from '@/core/contracts/lead-routing';
import { createDbClient, prisma } from '@/lib/db';
import { setProvinceLeadRoute } from '@/lib/leads/province-route';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

const SUITE = 'm18 route close race test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
/** A teardown `where` must not be computed (tests/teardown-where-guard.test.ts); no other test file uses these. */
const PROVINCES = ['Karabük', 'Batman', 'Artvin'];
/** The trigger below refuses ModuleState writes whose `changedBy` starts with this. */
const FAIL_ACTOR_PREFIX = 'ng215-fail-';
const ids: string[] = [];
let ACTOR = '';
let FAIL_ACTOR = '';

/** Resolves once `release()` was called, or after `ms` — whichever is first. */
function latch(ms: number): { wait: () => Promise<void>; release: () => void } {
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  return { wait: () => Promise.race([done, new Promise<void>((r) => setTimeout(r, ms))]), release };
}

/**
 * `db` whose transactions hand out a `tx` whose first ProvinceLeadRoute write (create or update)
 * waits for `gate` first: by then the set has read the target's M18 and the province's active row.
 */
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

async function pilotTenant(label: string): Promise<string> {
  const t = await admin.tenant.create({
    data: { name: `ng215r-${label}-${RUN}`, slug: `ng215r-${label}-${RUN}`, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' },
  });
  ids.push(t.id);
  await admin.moduleState.create({ data: { tenantId: t.id, moduleId: 'M18', status: 'PILOT', changedBy: 'ng215r test' } });
  return t.id;
}

const m18 = async (tenantId: string) =>
  (await admin.moduleState.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId: 'M18' } }, select: { status: true } }))?.status;
const activeRoute = (province: string) =>
  admin.provinceLeadRoute.findMany({ where: { province, active: true }, select: { targetTenantId: true } });

/** Runs the set (gated before its write) and the M18 close of `closing` at the same time. */
async function race(province: string, setTo: string, closing: string): Promise<{ set: ProvinceRouteResult; closeError: unknown }> {
  const gate = latch(1500);
  const set = setProvinceLeadRoute({ province, tenantId: setTo }, ACTOR, gatedDb(gate.wait));
  // Let the set reach its gate (it has read M18 and the active row) before the close starts.
  await new Promise((r) => setTimeout(r, 300));
  const close = updateTenantModuleStatus(closing, 'M18', 'OFF').then(
    () => undefined,
    (e: unknown) => e
  );
  const closeError = await Promise.race([close, new Promise((r) => setTimeout(r, 1200)).then(() => 'pending')]);
  gate.release();
  return { set: await set, closeError: closeError === 'pending' ? await close : closeError };
}

describe.skipIf(!HAS_DB)('M18 close vs. a concurrent route set (NG-215 / SEC Bulgu 1)', () => {
  beforeAll(async () => {
    // Leftovers of an earlier run of THIS file only (its tenants' slugs); a foreign active row fails the test loudly.
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES }, tenant: { slug: { startsWith: 'ng215r-' } } } });
    const actor = await admin.user.create({ data: { email: `ng215r-admin-${RUN}@example.test`, name: 'NG-215 race admin', isPlatformAdmin: true } });
    ACTOR = actor.id;
    const failActor = await admin.user.create({
      data: { id: `${FAIL_ACTOR_PREFIX}${RUN}`, email: `ng215r-fail-${RUN}@example.test`, name: 'NG-215 failing admin', isPlatformAdmin: true },
    });
    FAIL_ACTOR = failActor.id;
    session.userId = ACTOR;
  });

  afterAll(async () => {
    await admin.$executeRaw`DROP TRIGGER IF EXISTS ng215_fail_module_write ON "ModuleState"`;
    await admin.$executeRaw`DROP FUNCTION IF EXISTS ng215_fail_module_write()`;
    await admin.auditEvent.deleteMany({ where: { actorId: { in: presentIds([ACTOR, FAIL_ACTOR]) } } });
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES }, targetTenantId: { in: presentIds(ids) } } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.user.deleteMany({ where: { id: { in: presentIds([ACTOR, FAIL_ACTOR]) } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('set Karabük → X while X\'s M18 closes: never "M18 closed + route active"', async () => {
    const x = await pilotTenant('create');
    const { set, closeError } = await race('Karabük', x, x);

    expect(closeError).toBeUndefined();
    expect(await m18(x)).toBe('OFF');
    // The invariant: no active route points at a tenant whose M18 is closed.
    expect(await activeRoute('Karabük')).toEqual([]);
    // Either order is fine for the set itself: it either won the lock (route made, then closed by
    // the module write) or lost it (refused: target no longer eligible).
    if (!set.ok) expect(set.error).toBe('tenant_ineligible');
  }, 20_000);

  test('move Batman A → B while A\'s M18 closes: Batman ends active on B, never on A', async () => {
    const a = await pilotTenant('from');
    const b = await pilotTenant('to');
    await admin.provinceLeadRoute.create({ data: { province: 'Batman', targetTenantId: a, active: true } });

    const { set, closeError } = await race('Batman', b, a);

    expect(closeError).toBeUndefined();
    expect(await m18(a)).toBe('OFF');
    expect(set).toMatchObject({ ok: true, route: { province: 'Batman', tenantId: b, active: true } });
    expect(await activeRoute('Batman')).toEqual([{ targetTenantId: b }]);
  }, 20_000);

  test('the M18 write fails after the routes were closed: the route close rolls back with it', async () => {
    const t = await pilotTenant('rollback');
    await admin.provinceLeadRoute.create({ data: { province: 'Artvin', targetTenantId: t, active: true } });
    await admin.$executeRaw`CREATE OR REPLACE FUNCTION ng215_fail_module_write() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF NEW."changedBy" LIKE 'ng215-fail-%' THEN RAISE EXCEPTION 'ng215 test: ModuleState write refused'; END IF;
        RETURN NEW;
      END $f$`;
    await admin.$executeRaw`DROP TRIGGER IF EXISTS ng215_fail_module_write ON "ModuleState"`;
    await admin.$executeRaw`CREATE TRIGGER ng215_fail_module_write BEFORE INSERT OR UPDATE ON "ModuleState" FOR EACH ROW EXECUTE FUNCTION ng215_fail_module_write()`;
    session.userId = FAIL_ACTOR;
    try {
      await expect(updateTenantModuleStatus(t, 'M18', 'OFF')).rejects.toThrow('Modül durumu kaydedilemedi');
    } finally {
      session.userId = ACTOR;
      await admin.$executeRaw`DROP TRIGGER IF EXISTS ng215_fail_module_write ON "ModuleState"`;
    }
    expect(await m18(t)).toBe('PILOT');
    expect(await activeRoute('Artvin')).toEqual([{ targetTenantId: t }]);
    expect(await admin.auditEvent.count({ where: { actorId: requireId(FAIL_ACTOR, 'FAIL_ACTOR') } })).toBe(0);
  }, 20_000);
});
