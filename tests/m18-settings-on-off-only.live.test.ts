import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-228 (NG-222 SEC review, B4) — the tenant's settings action may only switch a module ON or OFF.
 *
 * `toggleModuleState` took the target status from the browser and accepted `PILOT` and `DEV`; the
 * only thing refusing them for M18 was the plan entitlement check (no catalogue plan lists M18).
 * A plan that lists M18 opens two holes:
 *   (1) the tenant puts ITSELF at PILOT (the staff preview status) and becomes a province target;
 *   (2) PILOT → ON / DEV closes M18 to the tenant's own people (an unsold beta opens at PILOT only)
 *       while the route close ran on the OFF branch only: the NG-215 hole comes back.
 *
 * Expected: PILOT and DEV are refused whatever the plan says (staff set them, from the admin
 * console), and every write that takes M18 out of the open set closes the tenant's routes in the
 * same transaction with exactly one `lead-route.deactivated` audit row.
 *
 * Real Postgres, the code under test on `fabrika_app` (NOBYPASSRLS); fixtures and ground truth
 * through the owner role. Faked: the session (`requireTenantAction`), Next's cache and — for the
 * tenants of this file only — `getEntitlements` adds M18 to what the real `pro` plan grants: the
 * settings page reads entitlements from the code catalogue, where no plan lists M18 today.
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
  process.env.IYZICO_API_KEY ||= 'test-api-key';
  process.env.IYZICO_SECRET_KEY ||= 'test-secret-key';
  return { rlsUrl, ownerUrl };
});

const session = vi.hoisted(() => ({ tenantId: '', userId: '' }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: session.tenantId, userId: session.userId, role: 'TENANT_OWNER' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/billing', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/billing')>();
  return {
    ...real,
    getEntitlements: async (...args: Parameters<typeof real.getEntitlements>) => {
      const e = await real.getEntitlements(...args);
      return args[0].startsWith('ng228-') ? { ...e, allowedModules: [...e.allowedModules, 'M18'] } : e;
    },
  };
});

import { toggleModuleState } from '@/app/[locale]/(app)/[workspace]/settings/modules/actions';
import { PROVINCE_ROUTE_AUDIT } from '@/core/contracts/lead-routing';
import type { ModuleStatus } from '@/lib/modules/types';
import { createDbClient, prisma } from '@/lib/db';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'm18 settings ON/OFF only test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);

/** One consultancy per case, each the target of its own province (no other test file routes these). */
const T = {
  selfPilot: `ng228-selfpilot-${RUN}`,
  toDev: `ng228-todev-${RUN}`,
  toOn: `ng228-toon-${RUN}`,
} as const;
type Case = keyof typeof T;
const PROVINCE: Record<Case, string> = { selfPilot: 'Kırıkkale', toDev: 'Nevşehir', toOn: 'Çankırı' };
/** The same three, as literals: a teardown `where` must not be computed (tests/teardown-where-guard.test.ts). */
const PROVINCES = ['Kırıkkale', 'Nevşehir', 'Çankırı'];
const TENANTS = [T.selfPilot, T.toDev, T.toOn];
/** A real catalogue plan; the getEntitlements mock above adds M18 to it (the day a plan lists M18). */
const PLAN = 'pro';
const OWNER_EMAIL = `ng228-owner-${RUN}@example.test`;
let OWNER = '';

const m18Status = async (tenantId: string) =>
  (await admin.moduleState.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId: 'M18' } }, select: { status: true } }))?.status ?? null;
const activeRoutes = (province: string) => admin.provinceLeadRoute.count({ where: { province, active: true } });
const routeAudits = (province: string) =>
  admin.auditEvent.findMany({ where: { tenantId: null, target: province, type: PROVINCE_ROUTE_AUDIT.deactivated }, select: { actorId: true, data: true } });

async function wipe(): Promise<void> {
  await admin.auditEvent.deleteMany({ where: { tenantId: null, target: { in: PROVINCES }, data: { path: ['fromTenantId'], string_starts_with: 'ng228-' } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.moduleState.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.subscription.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES }, targetTenantId: { in: TENANTS } } });
  await admin.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  await admin.user.deleteMany({ where: { email: OWNER_EMAIL } });
}

function as(tenantId: string) {
  session.tenantId = tenantId;
  session.userId = OWNER;
}

describe.skipIf(!HAS_DB)('the tenant settings action takes ON/OFF only and closes the route on every M18 exit (NG-228)', () => {
  beforeAll(async () => {
    await wipe();
    const owner = await admin.user.create({ data: { email: OWNER_EMAIL, name: 'NG-228 owner' } });
    OWNER = owner.id;
    const start: Record<Case, ModuleStatus> = { selfPilot: 'OFF', toDev: 'PILOT', toOn: 'PILOT' };
    for (const c of Object.keys(T) as Case[]) {
      await admin.tenant.create({ data: { id: T[c], name: T[c], slug: T[c], country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' } });
      await admin.subscription.create({ data: { tenantId: T[c], planId: PLAN, status: 'ACTIVE', billingInterval: 'month', provider: 'stripe', providerSubId: `sub-${T[c]}` } });
      await admin.moduleState.create({ data: { tenantId: T[c], moduleId: 'M18', status: start[c], changedBy: 'ng228 test' } });
      // selfPilot has no route of its own: a tenant at OFF is not a target.
      if (c !== 'selfPilot') await admin.provinceLeadRoute.create({ data: { province: PROVINCE[c], targetTenantId: T[c], active: true } });
    }
  });

  afterAll(async () => {
    await wipe();
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('the fixture: M18 is entitled to these tenants (so only the new rule can refuse PILOT/DEV)', async () => {
    const { getEntitlements } = await import('@/lib/billing');
    const { withTenant } = await import('@/lib/db');
    const e = await withTenant(T.toOn, (tx) => getEntitlements(T.toOn, tx));
    expect(e.allowedModules).toContain('M18');
  });

  test('the teardown list names exactly the provinces of the cases', () => {
    expect([...PROVINCES].sort()).toEqual(Object.values(PROVINCE).sort());
  });

  test('(a1) a tenant whose plan lists M18 cannot put itself at PILOT', async () => {
    as(T.selfPilot);
    await expect(toggleModuleState('M18', 'PILOT')).rejects.toThrow(/Geçersiz modül durumu/);
    expect(await m18Status(T.selfPilot)).toBe('OFF');
  });

  test('(a2) PILOT → DEV from the tenant settings is refused: M18 stays PILOT, the route stays, no audit', async () => {
    as(T.toDev);
    await expect(toggleModuleState('M18', 'DEV')).rejects.toThrow(/Geçersiz modül durumu/);
    expect(await m18Status(T.toDev)).toBe('PILOT');
    expect(await activeRoutes(PROVINCE.toDev)).toBe(1);
    expect(await routeAudits(PROVINCE.toDev)).toHaveLength(0);
  });

  test('(b) PILOT → ON closes M18 to the tenant\'s own people, so the route closes with exactly one audit row', async () => {
    as(T.toOn);
    await expect(toggleModuleState('M18', 'ON')).resolves.toEqual({ success: true });
    expect(await m18Status(T.toOn), 'the write really moved M18').toBe('ON');
    expect(await activeRoutes(PROVINCE.toOn), 'active routes').toBe(0);
    const audits = await routeAudits(PROVINCE.toOn);
    expect(audits, 'lead-route.deactivated audit rows').toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: OWNER,
      data: { province: PROVINCE.toOn, fromTenantId: T.toOn, toTenantId: null, reason: 'module_closed', moduleId: 'M18', newStatus: 'ON', actor: 'tenant_user' },
    });
    expect(JSON.stringify(audits[0]?.data)).not.toContain(OWNER_EMAIL);
  });
});
