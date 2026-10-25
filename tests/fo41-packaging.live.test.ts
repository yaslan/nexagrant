import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MVC4JRKUKYPLU (FO-41) — module packaging, against the real database.
 *
 * What a mocked delegate cannot show:
 *   - `getEntitlements` reads `ModuleState.grandfathered` through the tenant
 *     join, under RLS, and a grandfathered M3 on Discover is entitled (so the
 *     modules page does not call it ORPHANED);
 *   - the monthly partner-search counter takes exactly `limit` searches even
 *     when they race, refuses the next, starts over in a new month — and does
 *     it as `fabrika_app`, through `tenant_isolation`;
 *   - the trigger refuses `fabrika_app` setting the flag.
 *
 * The code under test runs over the RLS-subject role (`withTenant` is pointed at
 * it); fixtures are written over the owner connection, the only role the
 * trigger lets set `grandfathered`.
 */

const SUITE = 'fo41-packaging.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `fo41-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const state = vi.hoisted(() => ({ rls: undefined as PrismaClient | undefined }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { withTenant } = await import('@/lib/db');
const { getEntitlements } = await import('@/lib/billing');
const { consumePartnerSearch, quotaMonth } = await import(
  '@/modules/m1/server/partner-search/monthly-quota'
);

const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;
const rls: PrismaClient | undefined = rlsUrl ? createDbClient(rlsUrl) : undefined;
state.rls = rls;

const reachable =
  admin !== undefined &&
  rls !== undefined &&
  (await Promise.all([admin.$queryRaw`SELECT 1`, rls.$queryRaw`SELECT 1`])
    .then(() => true)
    .catch(() => false));
if (!reachable) skipOrFailInCi(SUITE, 'Postgres or the RLS-subject role is unreachable');
else await assertRlsSubjectRole(rls!, SUITE);

const T = {
  discover: `${RUN}-discover`,
  grandfathered: `${RUN}-gf`,
  addon: `${RUN}-addon`,
  tto: `${RUN}-tto`,
  pro: `${RUN}-pro`,
};
const ADDON_SKU = `${RUN}-addon-m1`;
const entitlements = (tenantId: string) => withTenant(tenantId, (tx) => getEntitlements(tenantId, tx));

describe.skipIf(!reachable)('FO-41 packaging (live)', () => {
  beforeAll(async () => {
    const db = admin!;
    await db.tenant.createMany({
      data: Object.values(T).map((id) => ({ id, name: id, slug: id, country: 'TR' })),
    });
    await db.subscription.createMany({
      data: [
        { tenantId: T.addon, planId: 'free', status: 'ACTIVE' },
        { tenantId: T.tto, planId: 'tto-edition', status: 'ACTIVE' },
        { tenantId: T.pro, planId: 'pro', status: 'ACTIVE' },
      ],
    });
    await db.addOnCatalog.create({
      data: { sku: ADDON_SKU, name: 'FO-41 test M1', currency: 'USD', grantsModule: 'M1' },
    });
    await db.addOn.create({ data: { tenantId: T.addon, sku: ADDON_SKU } });
    // The owner connection: the only role the trigger lets set the flag.
    await db.moduleState.create({
      data: { tenantId: T.grandfathered, moduleId: 'M3', status: 'ON', grandfathered: true },
    });
  });

  afterAll(async () => {
    const db = admin!;
    const ids = Object.values(T);
    await db.partnerSearchQuotaUsage.deleteMany({ where: { tenantId: { in: ids } } });
    await db.moduleState.deleteMany({ where: { tenantId: { in: ids } } });
    await db.addOn.deleteMany({ where: { tenantId: { in: ids } } });
    await db.subscription.deleteMany({ where: { tenantId: { in: ids } } });
    await db.tenant.deleteMany({ where: { id: { in: ids } } });
    await db.addOnCatalog.deleteMany({ where: { sku: ADDON_SKU } });
    await Promise.all([admin?.$disconnect(), rls?.$disconnect()]);
  });

  it('Discover: M1 limited and M5; no M3', async () => {
    const e = await entitlements(T.discover);
    expect([...e.allowedModules].sort()).toEqual(['M1', 'M5']);
    expect(e.moduleLimits).toEqual({ M1: { partnerSearchPerMonth: 10, readOnly: true } });
    expect(e.grandfatheredModules).toEqual([]);
  });

  it('a grandfathered M3 on Discover stays entitled, in full', async () => {
    const e = await entitlements(T.grandfathered);
    expect([...e.allowedModules].sort()).toEqual(['M1', 'M3', 'M5']);
    expect(e.grandfatheredModules).toEqual(['M3']);
    expect(e.moduleLimits.M3).toBeUndefined();
  });

  it('an add-on granting M1 lifts the limit', async () => {
    const e = await entitlements(T.addon);
    expect(e.allowedModules).toContain('M1');
    expect(e.moduleLimits.M1).toBeUndefined();
  });

  it('TTO Edition: limited M1, M4, M7', async () => {
    const e = await entitlements(T.tto);
    expect([...e.allowedModules].sort()).toEqual(['M1', 'M4', 'M7']);
    expect(e.moduleLimits).toEqual({ M1: { partnerSearchPerMonth: 10, readOnly: true } });
  });

  it('Pro: M1 in full', async () => {
    const e = await entitlements(T.pro);
    expect(e.allowedModules).toContain('M1');
    expect(e.moduleLimits).toEqual({});
  });

  it('the monthly counter takes exactly the limit when 15 searches race, then refuses', async () => {
    const now = new Date('2026-10-25T12:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 15 }, () => consumePartnerSearch(T.discover, 10, now))
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.filter((r) => !r.allowed).every((r) => r.used === 10)).toBe(true);

    const row = await admin!.partnerSearchQuotaUsage.findUnique({
      where: { tenantId_month: { tenantId: T.discover, month: quotaMonth(now) } },
    });
    expect(row?.count).toBe(10); // refused searches are not counted

    const nextMonth = await consumePartnerSearch(T.discover, 10, new Date('2026-11-01T00:00:00Z'));
    expect(nextMonth).toEqual({ allowed: true, used: 1, limit: 10 });
  });

  it('another tenant counts from zero (tenant_isolation)', async () => {
    const r = await consumePartnerSearch(T.tto, 10, new Date('2026-10-25T12:00:00Z'));
    expect(r).toEqual({ allowed: true, used: 1, limit: 10 });
  });

  it('fabrika_app cannot set grandfathered, on insert or update; clearing it is allowed', async () => {
    const asApp = (tenantId: string, sql: string) =>
      rls!.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return tx.$executeRawUnsafe(sql);
      });

    await expect(
      asApp(T.discover, `INSERT INTO "ModuleState"(id,"tenantId","moduleId",grandfathered) VALUES ('${RUN}-x','${T.discover}','M3',true)`)
    ).rejects.toThrow(/set by migrations only/);
    await admin!.moduleState.create({ data: { tenantId: T.discover, moduleId: 'M3', status: 'OFF' } });
    await expect(
      asApp(T.discover, `UPDATE "ModuleState" SET grandfathered = true WHERE "tenantId" = '${T.discover}' AND "moduleId" = 'M3'`)
    ).rejects.toThrow(/set by migrations only/);
    // A status change on a grandfathered row is an ordinary write.
    await expect(
      asApp(T.grandfathered, `UPDATE "ModuleState" SET status = 'PILOT' WHERE "tenantId" = '${T.grandfathered}'`)
    ).resolves.toBe(1);
    await expect(
      asApp(T.grandfathered, `UPDATE "ModuleState" SET grandfathered = false WHERE "tenantId" = '${T.grandfathered}'`)
    ).resolves.toBe(1);
    expect((await entitlements(T.grandfathered)).allowedModules).not.toContain('M3');
  });
});
