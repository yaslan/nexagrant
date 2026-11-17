import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-215 (SEC NG-205 D-1) — a province routed to a tenant whose M18 then leaves PILOT.
 *
 * NG-205 checks M18 when a route is SET, but nothing looked at the route when M18 later moved:
 * the platform admin's module console (`updateTenantModuleStatus`) wrote ModuleState and left the
 * ProvinceLeadRoute row active. The transfer box kept showing that tenant's name
 * (`province_transfer_org_name`, NG-179), the submit kept binding the consent to it
 * (`province_transfer_org`, NG-204), and the forward was then refused (`tenant_ineligible`).
 * The visitor consented to a transfer that could not happen.
 *
 * SQL cannot see it: ModuleState is FORCE RLS, so the SECURITY DEFINER functions read 0 rows of it,
 * and ADR-0009 forbids changing scope inside them. The write that closes M18 must close the route
 * in the same transaction and write a PROVINCE_ROUTE_AUDIT row.
 *
 * Real Postgres, the code under test on the `fabrika_app` role (NOBYPASSRLS); fixtures and ground
 * truth through the owner role. Only the session (`requirePlatformAdmin`) and Next's cache are faked.
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
import { PROVINCE_ROUTE_AUDIT } from '@/core/contracts/lead-routing';
import { createDbClient, prisma } from '@/lib/db';
import { listProvinceLeadRoutes } from '@/lib/leads/province-route';
import type { ModuleStatus } from '@/lib/modules/types';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

const SUITE = 'm18 route close on module exit test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);

/** One PILOT consultancy per case, each the target of its own province (no other test file uses these). */
const CASES = {
  off: { province: 'Sivas', to: 'OFF' },
  dev: { province: 'Yozgat', to: 'DEV' },
  on: { province: 'Niğde', to: 'ON' },
  stays: { province: 'Bitlis', to: 'PILOT' },
  other: { province: 'Siirt', to: null },
} as const satisfies Record<string, { province: string; to: ModuleStatus | null }>;
type Case = keyof typeof CASES;
/** The same five, as a literal: a teardown `where` must not be computed (tests/teardown-where-guard.test.ts). */
const PROVINCES = ['Sivas', 'Yozgat', 'Niğde', 'Bitlis', 'Siirt'];
const T = {} as Record<Case, string>;
let ACTOR = '';

/** What the anonymous visitor's form reads (fabrika_app, no scope): NG-179's name, NG-204's recipient. */
async function visitorSees(province: string): Promise<{ name: string | null; recipient: string | null }> {
  const [n] = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT public.province_transfer_org_name(${province}) AS name`;
  const [r] = await prisma.$queryRaw<Array<{ tenant_id: string | null }>>`SELECT tenant_id FROM public.province_transfer_org(${province})`;
  return { name: n?.name ?? null, recipient: r?.tenant_id ?? null };
}

const activeRoutes = (province: string) => admin.provinceLeadRoute.count({ where: { province, active: true } });
const routeAudits = (province: string) =>
  admin.auditEvent.findMany({ where: { tenantId: null, target: province, type: PROVINCE_ROUTE_AUDIT.deactivated }, select: { actorId: true, data: true } });

describe.skipIf(!HAS_DB)('M18 leaving PILOT closes the tenant\'s province routes (NG-215 / D-1)', () => {
  beforeAll(async () => {
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES } } });
    const actor = await admin.user.create({ data: { email: `ng215-admin-${RUN}@example.test`, name: 'NG-215 admin', isPlatformAdmin: true } });
    ACTOR = actor.id;
    session.userId = actor.id;
    for (const [key, c] of Object.entries(CASES) as [Case, (typeof CASES)[Case]][]) {
      const t = await admin.tenant.create({
        data: { name: `ng215-${key}-${RUN}`, slug: `ng215-${key}-${RUN}`, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' },
      });
      T[key] = t.id;
      await admin.moduleState.create({ data: { tenantId: t.id, moduleId: 'M18', status: 'PILOT', changedBy: 'ng215 test' } });
      await admin.provinceLeadRoute.create({ data: { province: c.province, targetTenantId: t.id, active: true } });
    }
  });

  afterAll(async () => {
    await admin.auditEvent.deleteMany({ where: { actorId: requireId(ACTOR, 'ACTOR') } });
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES } } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.user.deleteMany({ where: { id: requireId(ACTOR, 'ACTOR') } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('the teardown list names exactly the provinces of the cases', () => {
    expect([...PROVINCES].sort()).toEqual(Object.values(CASES).map((c) => c.province).sort());
  });

  test('before: every PILOT target is shown to the visitor and bound by the submit', async () => {
    for (const key of Object.keys(CASES) as Case[]) {
      expect(await visitorSees(CASES[key].province), key).toEqual({ name: `ng215-${key}-${RUN}`, recipient: T[key] });
    }
  });

  test.each(['off', 'dev', 'on'] as const)('PILOT → %s: route inactive, audit written, both functions return nothing', async (key) => {
    const c = CASES[key];
    await updateTenantModuleStatus(T[key], 'M18', c.to);

    expect(await admin.moduleState.findUnique({ where: { tenantId_moduleId: { tenantId: T[key], moduleId: 'M18' } }, select: { status: true } }))
      .toEqual({ status: c.to });
    expect(await activeRoutes(c.province)).toBe(0);
    const audits = await routeAudits(c.province);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: ACTOR,
      data: { province: c.province, fromTenantId: T[key], toTenantId: null, reason: 'module_closed', moduleId: 'M18', newStatus: c.to },
    });
    expect(await visitorSees(c.province)).toEqual({ name: null, recipient: null });
  });

  test('PILOT → PILOT and a change to another module leave the route alone', async () => {
    await updateTenantModuleStatus(T.stays, 'M18', 'PILOT');
    await updateTenantModuleStatus(T.other, 'M1', 'ON');
    for (const key of ['stays', 'other'] as const) {
      expect(await activeRoutes(CASES[key].province), key).toBe(1);
      expect(await routeAudits(CASES[key].province), key).toHaveLength(0);
      expect(await visitorSees(CASES[key].province), key).toEqual({ name: `ng215-${key}-${RUN}`, recipient: T[key] });
    }
  });

  test('the route console flags a route whose target can no longer take leads', async () => {
    // A row left over from before this fix (or from another writer): active, target M18 OFF.
    await admin.moduleState.update({ where: { tenantId_moduleId: { tenantId: T.other, moduleId: 'M18' } }, data: { status: 'OFF' } });
    try {
      const rows = await listProvinceLeadRoutes(prisma);
      const row = (province: string) => rows.find((r) => r.province === province && r.active);
      expect(row(CASES.other.province)).toMatchObject({ targetEligible: false });
      expect(row(CASES.stays.province)).toMatchObject({ targetEligible: true });
    } finally {
      await admin.moduleState.update({ where: { tenantId_moduleId: { tenantId: T.other, moduleId: 'M18' } }, data: { status: 'PILOT' } });
    }
  });
});
