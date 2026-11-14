import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-167 — province → consultancy routing. Real Postgres, real Prisma, the `fabrika_app` role
 * (NOBYPASSRLS), no mocks. The code under test runs as fabrika_app; fixtures and ground-truth counts go
 * through the owner role (same singleton swap as tests/m18-intake.live.test.ts).
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

import { PROVINCE_ROUTE_AUDIT } from '@/core/contracts/lead-routing';
import { createEventBus } from '@/core/events';
import { createDbClient, prisma } from '@/lib/db';
import { forwardPublicLead } from '@/lib/leads/public-lead-intake';
import {
  deactivateProvinceLeadRoute,
  listProvinceLeadRoutes,
  listUnmatchedLeads,
  setProvinceLeadRoute,
} from '@/lib/leads/province-route';
import { createLeadIntakePort } from '@/modules/m18/server/intake-repo';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'province lead route test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const NOW = new Date('2026-11-14T10:00:00Z');
const ACTOR = `admin-${RUN}`;
// Provinces this file owns (tests/m18-intake.live.test.ts owns Samsun).
const PROVINCES = ['Rize', 'Sinop', 'Van', 'Yalova', 'Bolu'];
const port = createLeadIntakePort(prisma, createEventBus());
const T: Record<'a' | 'b' | 'sme', string> = { a: '', b: '', sme: '' };

const dealsIn = (tenantId: string) => admin.deal.count({ where: { tenantId } });
const mkLead = (key: string, over: Record<string, unknown> = {}) =>
  admin.publicLead.create({
    data: {
      name: 'Ayşe Yılmaz', email: `${key}-${RUN}@example.test`, organisation: `Org ${key}`, province: 'Rize', district: null,
      readinessCode: 'municipality.012012012012012', consentVersion: 'v-form', consentAt: NOW, source: 'fon-hazirlik', locale: 'tr',
      transferConsent: true, transferConsentVersion: 'v-test', transferConsentAt: NOW,
      ...over,
    },
  });

describe.skipIf(!HAS_DB)('province lead routing', () => {
  beforeAll(async () => {
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES } } });
    const mk = (key: keyof typeof T, orgType: 'CONSULTANCY' | 'SME') =>
      admin.tenant
        .create({ data: { name: `route-${key}-${RUN}`, slug: `route-${key}-${RUN}`, country: 'TR', orgType, kind: 'ORGANIZATION' } })
        .then((t) => (T[key] = t.id));
    await mk('a', 'CONSULTANCY');
    await mk('b', 'CONSULTANCY');
    await mk('sme', 'SME');
  });

  afterAll(async () => {
    await admin.publicLead.deleteMany({ where: { email: { endsWith: `-${RUN}@example.test` } } });
    await admin.consent.deleteMany({ where: { userId: { startsWith: 'public-lead:' }, tenantId: { in: [T.a, T.b] } } });
    await admin.auditEvent.deleteMany({ where: { actorId: ACTOR } });
    await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES } } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  describe('RLS: tenants cannot read the map', () => {
    test('outside any scope fabrika_app reads 0 rows although the table has rows, and cannot insert', async () => {
      await admin.provinceLeadRoute.create({ data: { province: 'Bolu', targetTenantId: T.a, active: true } });
      expect(await admin.provinceLeadRoute.count({ where: { province: 'Bolu' } })).toBe(1);
      expect(await prisma.provinceLeadRoute.count()).toBe(0);
      await expect(
        prisma.provinceLeadRoute.create({ data: { province: 'Van', targetTenantId: T.a, active: false } })
      ).rejects.toThrow();
    });

    test('a user of the TARGET tenant (app.tenant_id set) reads 0 rows too', async () => {
      const seen = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${T.a}, true)`;
        return tx.provinceLeadRoute.count();
      });
      expect(seen).toBe(0);
      const other = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${T.b}, true)`;
        return tx.provinceLeadRoute.findMany();
      });
      expect(other).toEqual([]);
    });

    test('setting app.system_scope by hand does not open it (the seal does)', async () => {
      const seen = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.system_scope', 'on', true)`;
        return tx.provinceLeadRoute.count();
      });
      expect(seen).toBe(0);
    });

    test('the platform-admin scope sees it', async () => {
      const rows = await listProvinceLeadRoutes(prisma);
      expect(rows.map((r) => r.province)).toContain('Bolu');
      await admin.provinceLeadRoute.deleteMany({ where: { province: 'Bolu' } });
    });
  });

  describe('admin management + audit', () => {
    test('invalid province and ineligible / unknown tenant are refused, nothing written', async () => {
      expect(await setProvinceLeadRoute({ province: 'Atlantis', tenantId: T.a }, ACTOR, prisma)).toEqual({ ok: false, error: 'invalid_province' });
      expect(await setProvinceLeadRoute({ province: 'rize', tenantId: T.a }, ACTOR, prisma)).toEqual({ ok: false, error: 'invalid_province' });
      expect(await setProvinceLeadRoute({ province: 'Van', tenantId: T.sme }, ACTOR, prisma)).toEqual({ ok: false, error: 'tenant_ineligible' });
      expect(await setProvinceLeadRoute({ province: 'Van', tenantId: `ghost-${RUN}` }, ACTOR, prisma)).toEqual({ ok: false, error: 'tenant_not_found' });
      expect(await admin.provinceLeadRoute.count({ where: { province: { in: ['Van', 'Rize'] } } })).toBe(0);
      expect(await admin.auditEvent.count({ where: { actorId: ACTOR } })).toBe(0);
    });

    test('set / same-again / move / deactivate write one audit row each (same again writes none)', async () => {
      const created = await setProvinceLeadRoute({ province: 'Van', tenantId: T.a }, ACTOR, prisma);
      expect(created.ok && created.route).toMatchObject({ province: 'Van', tenantId: T.a, active: true, updatedBy: ACTOR });

      const again = await setProvinceLeadRoute({ province: 'Van', tenantId: T.a }, ACTOR, prisma);
      expect(again.ok).toBe(true);
      expect(await admin.provinceLeadRoute.count({ where: { province: 'Van' } })).toBe(1);

      const moved = await setProvinceLeadRoute({ province: 'Van', tenantId: T.b }, ACTOR, prisma);
      expect(moved.ok && moved.route.tenantId).toBe(T.b);
      expect(await admin.provinceLeadRoute.count({ where: { province: 'Van', active: true } })).toBe(1);

      const off = await deactivateProvinceLeadRoute({ province: 'Van' }, ACTOR, prisma);
      expect(off.ok && off.route.active).toBe(false);
      expect(await deactivateProvinceLeadRoute({ province: 'Van' }, ACTOR, prisma)).toEqual({ ok: false, error: 'route_not_found' });

      const audit = await admin.auditEvent.findMany({ where: { actorId: ACTOR }, orderBy: { createdAt: 'asc' } });
      expect(audit.map((a) => a.type)).toEqual([PROVINCE_ROUTE_AUDIT.set, PROVINCE_ROUTE_AUDIT.moved, PROVINCE_ROUTE_AUDIT.deactivated]);
      expect(audit.every((a) => a.tenantId === null && a.target === 'Van')).toBe(true);
      expect(audit[1]!.data).toEqual({ province: 'Van', fromTenantId: T.a, toTenantId: T.b });
    });

    test('the database refuses a second ACTIVE row for a province (unique), an inactive one is fine', async () => {
      await admin.provinceLeadRoute.create({ data: { province: 'Yalova', targetTenantId: T.a, active: true } });
      await expect(admin.provinceLeadRoute.create({ data: { province: 'Yalova', targetTenantId: T.b, active: true } })).rejects.toThrow();
      await admin.provinceLeadRoute.create({ data: { province: 'Yalova', targetTenantId: T.b, active: false } });
      // one tenant, many provinces
      await admin.provinceLeadRoute.create({ data: { province: 'Sinop', targetTenantId: T.a, active: false } });
      await admin.provinceLeadRoute.deleteMany({ where: { province: { in: ['Yalova', 'Sinop'] } } });
    });
  });

  describe('forwardPublicLead picks the target from the map', () => {
    test('mapped province: lands in THAT tenant only (1 deal), lead marked routed', async () => {
      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('mapped', { province: 'Rize' });
      const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
      const result = await forwardPublicLead(lead.id, port, prisma);
      expect(result.status).toBe('created');
      expect((await dealsIn(T.a)) - a0).toBe(1);
      expect((await dealsIn(T.b)) - b0).toBe(0);
      const row = await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(row).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a, routeReason: null });
    });

    test('unmapped province: port not called, 0 deals anywhere, marked unmatched (province_unmapped)', async () => {
      const lead = await mkLead('unmapped', { province: 'Sinop' });
      const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
      const result = await forwardPublicLead(lead.id, port, prisma);
      expect(result).toEqual({ status: 'skipped', reason: 'unmatched', unmatchedReason: 'province_unmapped' });
      expect(await dealsIn(T.a)).toBe(a0);
      expect(await dealsIn(T.b)).toBe(b0);
      expect(await admin.leadOrganization.count({ where: { name: 'Org unmapped' } })).toBe(0);
      expect(await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ routeStatus: 'unmatched', routeReason: 'province_unmapped', routedTenantId: null });
    });

    test('empty province (null and a non-province string): same, province_missing', async () => {
      for (const [key, province] of [['null', null], ['junk', 'Atlantis']] as const) {
        const lead = await mkLead(`empty-${key}`, { province });
        const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
        expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'unmatched', unmatchedReason: 'province_missing' });
        expect(await dealsIn(T.a)).toBe(a0);
        expect(await dealsIn(T.b)).toBe(b0);
        expect((await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } })).routeStatus).toBe('unmatched');
      }
    });

    test('a deactivated mapping no longer routes', async () => {
      await setProvinceLeadRoute({ province: 'Sinop', tenantId: T.b }, ACTOR, prisma);
      await deactivateProvinceLeadRoute({ province: 'Sinop' }, ACTOR, prisma);
      const lead = await mkLead('deactivated', { province: 'Sinop' });
      const b0 = await dealsIn(T.b);
      expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('skipped');
      expect(await dealsIn(T.b)).toBe(b0);
    });

    test('no transfer consent: nothing at all, not even a mark', async () => {
      const lead = await mkLead('noconsent', { province: 'Rize', transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
      const a0 = await dealsIn(T.a);
      expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'transfer_consent_off' });
      expect(await dealsIn(T.a)).toBe(a0);
      expect((await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } })).routeStatus).toBeNull();
    });

    test('target tenant deleted-after-mapping is refused by M18 -> unmatched tenant_refused', async () => {
      const gone = await admin.tenant.create({ data: { name: `route-gone-${RUN}`, slug: `route-gone-${RUN}`, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' } });
      await admin.provinceLeadRoute.create({ data: { province: 'Yalova', targetTenantId: gone.id, active: true } });
      await admin.tenant.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
      const lead = await mkLead('refused', { province: 'Yalova' });
      expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'refused', reason: 'tenant_ineligible' });
      expect(await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ routeStatus: 'unmatched', routeReason: 'tenant_refused' });
    });

    test('the worklist lists unmatched leads; mapping the province and forwarding again routes it', async () => {
      const page = await listUnmatchedLeads({ limit: 200 }, prisma);
      const mine = page.rows.filter((r) => r.email.endsWith(`-${RUN}@example.test`));
      expect(mine.map((r) => r.reason).sort()).toEqual(['province_missing', 'province_missing', 'province_unmapped', 'province_unmapped', 'tenant_refused'].sort());
      expect(page.total).toBeGreaterThanOrEqual(mine.length);

      await setProvinceLeadRoute({ province: 'Sinop', tenantId: T.b }, ACTOR, prisma);
      const lead = await admin.publicLead.findFirstOrThrow({ where: { email: `unmapped-${RUN}@example.test` } });
      const b0 = await dealsIn(T.b);
      expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('created');
      expect((await dealsIn(T.b)) - b0).toBe(1);
      expect(await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ routeStatus: 'routed', routedTenantId: T.b, routeReason: null });
      const after = await listUnmatchedLeads({ limit: 200 }, prisma);
      expect(after.rows.some((r) => r.publicLeadId === lead.id)).toBe(false);
    });
  });
});
