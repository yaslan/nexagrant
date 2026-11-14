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
  listIntakeTenantOptions,
  listProvinceLeadRoutes,
  listUnmatchedLeads,
  setProvinceLeadRoute,
} from '@/lib/leads/province-route';
import { createLeadIntakePort } from '@/modules/m18/server/intake-repo';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'province lead route test';
// No fallback address: without OWNER_URL the suite skips (loudly) instead of guessing credentials.
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
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
    await admin.user.deleteMany({ where: { email: { endsWith: `-${RUN}@example.test` } } });
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
  describe('NG-171: scorecard level, tenant options, admin name', () => {
    test('the worklist row carries the lead readinessLevel (and null when none)', async () => {
      const withLevel = await mkLead('level-set', { province: 'Van', readinessLevel: 'L3' });
      const noLevel = await mkLead('level-none', { province: 'Van' });
      const unmatched = { routeStatus: 'unmatched', routeReason: 'province_unmapped', routedAt: NOW } as const;
      await admin.publicLead.updateMany({ where: { id: { in: [withLevel.id, noLevel.id] } }, data: unmatched });
      const page = await listUnmatchedLeads({ limit: 200 }, prisma);
      expect(page.rows.find((r) => r.publicLeadId === withLevel.id)?.readinessLevel).toBe('L3');
      expect(page.rows.find((r) => r.publicLeadId === noLevel.id)?.readinessLevel).toBeNull();
    });

    test('tenant options: consultancy + agency, no SME, no deleted, sorted by name, ids/names only', async () => {
      const mk = (key: string, data: { orgType: 'CONSULTANCY' | 'SME'; kind: 'ORGANIZATION' | 'AGENCY'; deletedAt?: Date }) =>
        admin.tenant.create({ data: { name: `opt-${key}-${RUN}`, slug: `opt-${key}-${RUN}`, country: 'TR', ...data } });
      const z = await mk('z-consult', { orgType: 'CONSULTANCY', kind: 'ORGANIZATION' });
      const ag = await mk('b-agency', { orgType: 'SME', kind: 'AGENCY' });
      await mk('c-sme', { orgType: 'SME', kind: 'ORGANIZATION' });
      await mk('d-deleted', { orgType: 'CONSULTANCY', kind: 'ORGANIZATION', deletedAt: new Date() });
      const options = await listIntakeTenantOptions(prisma);
      const mine = options.filter((o) => o.name.endsWith(`-${RUN}`) && o.name.startsWith('opt-'));
      expect(mine).toEqual([{ id: ag.id, name: `opt-b-agency-${RUN}` }, { id: z.id, name: `opt-z-consult-${RUN}` }]);
      expect(options.some((o) => o.id === T.sme)).toBe(false);
      expect(options.some((o) => o.id === T.a) && options.some((o) => o.id === T.b)).toBe(true);
      expect(Object.keys(options[0] ?? {}).sort()).toEqual(['id', 'name']);
    });

    test('route list: updatedByName is the admin display name, null for unknown/nameless actors, never an e-mail', async () => {
      const named = await admin.user.create({ data: { email: `named-${RUN}@example.test`, name: '  Ayşe Admin ' } });
      const nameless = await admin.user.create({ data: { email: `nameless-${RUN}@example.test`, name: null } });
      await setProvinceLeadRoute({ province: 'Bolu', tenantId: T.a }, named.id, prisma);
      await setProvinceLeadRoute({ province: 'Yalova', tenantId: T.a }, nameless.id, prisma);
      await setProvinceLeadRoute({ province: 'Sinop', tenantId: T.a }, ACTOR, prisma);
      const rows = await listProvinceLeadRoutes(prisma);
      const by = (province: string) => rows.find((r) => r.province === province && r.active);
      expect(by('Bolu')).toMatchObject({ updatedBy: named.id, updatedByName: 'Ayşe Admin' });
      expect(by('Yalova')).toMatchObject({ updatedBy: nameless.id, updatedByName: null });
      expect(by('Sinop')).toMatchObject({ updatedBy: ACTOR, updatedByName: null });
      expect(JSON.stringify(rows)).not.toContain(`named-${RUN}@example.test`);
      const moved = await setProvinceLeadRoute({ province: 'Bolu', tenantId: T.b }, named.id, prisma);
      expect(moved.ok && moved.route.updatedByName).toBe('Ayşe Admin');
    });
  });
  describe('NG-174: a routed lead goes to at most one tenant (SEC NG-170 Y-1, D-2)', () => {
    const routedRow = (id: string) => admin.publicLead.findUniqueOrThrow({ where: { id } });

    test('S1: mapping moved A→B after the lead was routed; a second forward adds 0 rows to B and keeps routedTenantId', async () => {
      await setProvinceLeadRoute({ province: 'Bolu', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('s1', { province: 'Bolu' });
      expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('created');
      await setProvinceLeadRoute({ province: 'Bolu', tenantId: T.b }, ACTOR, prisma);
      const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
      const contactsB0 = await admin.leadContact.count({ where: { tenantId: T.b } });

      expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'already_routed' });
      expect(await dealsIn(T.b)).toBe(b0);
      expect(await admin.leadContact.count({ where: { tenantId: T.b } })).toBe(contactsB0);
      expect(await dealsIn(T.a)).toBe(a0);
      expect(await routedRow(lead.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a, routeReason: null });
    });

    test('same target again is idempotent: M18 answers duplicate, nothing new, mark unchanged', async () => {
      await setProvinceLeadRoute({ province: 'Bolu', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('same', { province: 'Bolu' });
      expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('created');
      const a0 = await dealsIn(T.a);
      const again = await forwardPublicLead(lead.id, port, prisma);
      expect(again.status).toBe('duplicate');
      expect(await dealsIn(T.a)).toBe(a0);
      expect(await routedRow(lead.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a });
    });

    test('S2: parallel calls produce exactly one M18 lead for one tenant', async () => {
      await setProvinceLeadRoute({ province: 'Yalova', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('s2', { province: 'Yalova' });
      const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
      const results = await Promise.all(Array.from({ length: 6 }, () => forwardPublicLead(lead.id, port, prisma)));
      expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
      expect(results.every((r) => r.status === 'created' || r.status === 'duplicate')).toBe(true);
      expect((await dealsIn(T.a)) - a0).toBe(1);
      expect(await dealsIn(T.b)).toBe(b0);
      expect(await admin.leadContact.count({ where: { sourceRef: `public-lead:${lead.id}` } })).toBe(1);
      expect(await routedRow(lead.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a });
    });

    test('S2b: the map moves WHILE the first call is inside the port; the concurrent second call must not reach B', async () => {
      await setProvinceLeadRoute({ province: 'Van', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('s2b', { province: 'Van' });
      const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
      let inner: ReturnType<typeof forwardPublicLead> | undefined;
      const racing = {
        accept: async (req: Parameters<typeof port.accept>[0]) => {
          if (!inner) {
            await setProvinceLeadRoute({ province: 'Van', tenantId: T.b }, ACTOR, prisma);
            inner = forwardPublicLead(lead.id, port, prisma);
            await inner;
          }
          return port.accept(req);
        },
      };
      const outer = await forwardPublicLead(lead.id, racing, prisma);
      expect(outer.status).toBe('created');
      expect(await inner).toEqual({ status: 'skipped', reason: 'already_routed' });
      expect((await dealsIn(T.a)) - a0).toBe(1);
      expect(await dealsIn(T.b)).toBe(b0);
      expect(await routedRow(lead.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a });
    });

    test('S3: tenant deleted after routing: reprocessing copies nothing and does not fall back to unmatched', async () => {
      const mkC = () =>
        admin.tenant.create({ data: { name: `route-c-${RUN}-${Math.random().toString(36).slice(2, 6)}`, slug: `route-c-${RUN}-${Math.random().toString(36).slice(2, 8)}`, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' } });
      // (a) soft delete: the mapping row still points at the tenant, M18 refuses it
      const soft = await mkC();
      await admin.provinceLeadRoute.deleteMany({ where: { province: 'Sinop' } });
      await admin.provinceLeadRoute.create({ data: { province: 'Sinop', targetTenantId: soft.id, active: true } });
      const leadSoft = await mkLead('s3-soft', { province: 'Sinop' });
      expect((await forwardPublicLead(leadSoft.id, port, prisma)).status).toBe('created');
      await admin.tenant.update({ where: { id: soft.id }, data: { deletedAt: new Date() } });
      const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
      const r1 = await forwardPublicLead(leadSoft.id, port, prisma);
      expect(r1.status).toBe('refused');
      expect(await routedRow(leadSoft.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: soft.id, routeReason: null });

      // (b) hard delete: the mapping row cascades away, no match is left
      const hard = await mkC();
      await admin.provinceLeadRoute.deleteMany({ where: { province: 'Sinop' } });
      await admin.provinceLeadRoute.create({ data: { province: 'Sinop', targetTenantId: hard.id, active: true } });
      const leadHard = await mkLead('s3-hard', { province: 'Sinop' });
      expect((await forwardPublicLead(leadHard.id, port, prisma)).status).toBe('created');
      await admin.tenant.delete({ where: { id: hard.id } });
      expect(await forwardPublicLead(leadHard.id, port, prisma)).toEqual({ status: 'skipped', reason: 'already_routed' });
      expect(await routedRow(leadHard.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: hard.id, routeReason: null });
      expect(await dealsIn(T.a)).toBe(a0);
      expect(await dealsIn(T.b)).toBe(b0);
    });

    test('a refusal that is not about the tenant gives the claim back (lead can be retried)', async () => {
      const refusingPort = { accept: async () => ({ status: 'refused' as const, reason: 'consent_missing' as const }) };
      await setProvinceLeadRoute({ province: 'Bolu', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('release', { province: 'Bolu' });
      expect((await forwardPublicLead(lead.id, refusingPort, prisma)).status).toBe('refused');
      expect(await routedRow(lead.id)).toMatchObject({ routeStatus: null, routedTenantId: null });
      expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('created');
    });

    test('D-2: the database refuses inconsistent route columns', async () => {
      const bad = (data: Record<string, unknown>) => mkLead(`chk-${Math.random().toString(36).slice(2, 7)}`, data);
      // NG-181 D-3: each expectation is bound to the ONE constraint that must refuse it, by its full name,
      // so a fixture that fails for any other reason cannot pass. 'bogus' is refused by the older value
      // CHECK (add-province-lead-route.sql) before the consistency CHECK is evaluated.
      const CHECK = /"PublicLead_route_consistency_check"/;
      const STATUS_CHECK = /"PublicLead_routeStatus_check"/;
      await expect(bad({ routeStatus: 'routed', routedTenantId: null })).rejects.toThrow(CHECK);
      await expect(bad({ routeStatus: 'routed', routedTenantId: T.a, routeReason: 'anything-goes' })).rejects.toThrow(CHECK);
      await expect(bad({ routeStatus: 'unmatched', routeReason: 'anything-goes' })).rejects.toThrow(CHECK);
      await expect(bad({ routeStatus: 'unmatched', routeReason: null })).rejects.toThrow(CHECK);
      await expect(bad({ routeStatus: 'unmatched', routeReason: 'province_unmapped', routedTenantId: T.a })).rejects.toThrow(CHECK);
      await expect(bad({ routeStatus: null, routeReason: 'province_unmapped' })).rejects.toThrow(CHECK);
      await expect(bad({ routeStatus: null, routedTenantId: T.a })).rejects.toThrow(CHECK);
      await expect(bad({ routeStatus: 'bogus' })).rejects.toThrow(STATUS_CHECK);
      const ok1 = await bad({ routeStatus: 'routed', routedTenantId: T.a, routedAt: NOW });
      const ok2 = await bad({ routeStatus: 'unmatched', routeReason: 'tenant_refused', routedAt: NOW });
      const ok3 = await bad({});
      expect([ok1, ok2, ok3].every((r) => r.id)).toBe(true);
    });
  });

  /**
   * NG-181 (NG-174 review H-1, O-1, D-1, D-2). Every race here is DETERMINISTIC: `gatedDb` parks the call
   * under test at one exact write (`publicLead.updateMany` with the given mark) until the test lets it go,
   * so "both calls read before either writes" is arranged, not hoped for.
   */
  describe('NG-181: uncertainty falls to "stuck", never to "a second tenant"', () => {
    const routedRow = (id: string) => admin.publicLead.findUniqueOrThrow({ where: { id } });
    const contactsOf = (leadId: string) =>
      admin.leadContact.findMany({ where: { sourceRef: `public-lead:${leadId}` }, select: { tenantId: true } });

    test('H-1: the port throws AFTER M18 committed; the claim is kept, so a moved map cannot copy the lead to B', async () => {
      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('h1', { province: 'Rize' });
      // The CRW-PROBE port: the real write happens, then the answer is lost (commit ack, network, timeout).
      const writesThenThrows = {
        accept: async (req: Parameters<typeof port.accept>[0]) => {
          await port.accept(req);
          throw new Error('h1: commit acknowledgement lost');
        },
      };
      await expect(forwardPublicLead(lead.id, writesThenThrows, prisma)).rejects.toThrow('h1: commit acknowledgement lost');

      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.b }, ACTOR, prisma);
      const b0 = await dealsIn(T.b);
      const second = await forwardPublicLead(lead.id, port, prisma);
      const row = await routedRow(lead.id);
      expect({
        second,
        contacts: await contactsOf(lead.id),
        newDealsInB: (await dealsIn(T.b)) - b0,
        row: { routeStatus: row.routeStatus, routedTenantId: row.routedTenantId, routeReason: row.routeReason },
      }).toEqual({
        second: { status: 'skipped', reason: 'already_routed' },
        contacts: [{ tenantId: T.a }],
        newDealsInB: 0,
        row: { routeStatus: 'routed', routedTenantId: T.a, routeReason: null },
      });
    });

    test('H-1 repair path: a throw keeps the lead with its tenant; asking THAT tenant again heals it (created / duplicate)', async () => {
      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.a }, ACTOR, prisma);
      // (a) thrown BEFORE anything was written: nothing landed, the retry creates it in A
      const before = await mkLead('h1-before', { province: 'Rize' });
      const failsFirst = { accept: async () => { throw new Error('h1: connection refused'); } };
      await expect(forwardPublicLead(before.id, failsFirst, prisma)).rejects.toThrow('h1: connection refused');
      expect(await routedRow(before.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a });
      expect(await contactsOf(before.id)).toEqual([]);
      expect((await forwardPublicLead(before.id, port, prisma)).status).toBe('created');
      expect(await contactsOf(before.id)).toEqual([{ tenantId: T.a }]);

      // (b) thrown AFTER the write: the retry gets M18's duplicate, still one copy
      const after = await mkLead('h1-after', { province: 'Rize' });
      const writesThenThrows = {
        accept: async (req: Parameters<typeof port.accept>[0]) => {
          await port.accept(req);
          throw new Error('h1: timeout');
        },
      };
      await expect(forwardPublicLead(after.id, writesThenThrows, prisma)).rejects.toThrow('h1: timeout');
      expect((await forwardPublicLead(after.id, port, prisma)).status).toBe('duplicate');
      expect(await contactsOf(after.id)).toEqual([{ tenantId: T.a }]);
      expect(await routedRow(after.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a });
    });

    test('O-1: both calls read before either claims and see different targets; the claim condition alone keeps the loser out', async () => {
      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('o1', { province: 'Rize' });
      const [a0, b0] = [await dealsIn(T.a), await dealsIn(T.b)];
      const gate = gatedDb(prisma, 'routed');

      // Call 1 reads (map says A) and is parked right before its claim; the routed-guard has already passed.
      const first = forwardPublicLead(lead.id, port, gate.db);
      await gate.reached;
      // The map moves; call 2 reads B and claims first.
      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.b }, ACTOR, prisma);
      expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('created');
      // Call 1 now claims with a stale A: only the WHERE condition stands between it and tenant A.
      gate.release();
      expect(await first).toEqual({ status: 'skipped', reason: 'already_routed' });

      expect(await contactsOf(lead.id)).toEqual([{ tenantId: T.b }]);
      expect((await dealsIn(T.a)) - a0).toBe(0);
      expect((await dealsIn(T.b)) - b0).toBe(1);
      expect(await routedRow(lead.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.b, routeReason: null });
    });

    test('D-1: a call that saw no mapping cannot mark a lead unmatched after a concurrent call routed it', async () => {
      await deactivateProvinceLeadRoute({ province: 'Rize' }, ACTOR, prisma);
      const lead = await mkLead('d1', { province: 'Rize' });
      const gate = gatedDb(prisma, 'unmatched');

      // Call 1 reads (no mapping) and is parked right before markUnmatched.
      const first = forwardPublicLead(lead.id, port, gate.db);
      await gate.reached;
      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.a }, ACTOR, prisma);
      expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('created');
      gate.release();
      await first;

      expect(await routedRow(lead.id)).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a, routeReason: null });
      expect(await contactsOf(lead.id)).toEqual([{ tenantId: T.a }]);
    });

    test('D-2: a refusal unrelated to the tenant puts an unmatched lead back on the worklist (previous mark, not NULL)', async () => {
      await deactivateProvinceLeadRoute({ province: 'Rize' }, ACTOR, prisma);
      const lead = await mkLead('d2', { province: 'Rize' });
      expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'unmatched', unmatchedReason: 'province_unmapped' });
      const marked = await routedRow(lead.id);

      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.a }, ACTOR, prisma);
      const refusingPort = { accept: async () => ({ status: 'refused' as const, reason: 'consent_missing' as const }) };
      expect(await forwardPublicLead(lead.id, refusingPort, prisma)).toEqual({ status: 'refused', reason: 'consent_missing' });

      expect(await routedRow(lead.id)).toMatchObject({
        routeStatus: 'unmatched', routeReason: 'province_unmapped', routedTenantId: null, routedAt: marked.routedAt,
      });
      const page = await listUnmatchedLeads({ limit: 200 }, prisma);
      expect(page.rows.some((r) => r.publicLeadId === lead.id)).toBe(true);
      expect(await contactsOf(lead.id)).toEqual([]);
    });

    test('D-2 (review bulgu 2): the mark restored is the one the CLAIM replaced, not the one the first read saw', async () => {
      await setProvinceLeadRoute({ province: 'Rize', tenantId: T.a }, ACTOR, prisma);
      const lead = await mkLead('d2-race', { province: 'Rize' });
      const refusingPort = { accept: async () => ({ status: 'refused' as const, reason: 'consent_missing' as const }) };
      const gate = gatedDb(prisma, 'routed');

      // Call 1 reads (mark NULL, map says A) and is parked right before its claim.
      const first = forwardPublicLead(lead.id, refusingPort, gate.db);
      await gate.reached;
      // The mapping goes away; call 2 marks the lead unmatched (allowed: it is not routed).
      await deactivateProvinceLeadRoute({ province: 'Rize' }, ACTOR, prisma);
      expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'unmatched', unmatchedReason: 'province_unmapped' });
      const marked = await routedRow(lead.id);
      // Call 1 claims over that mark, then M18 refuses for a reason unrelated to the tenant.
      gate.release();
      expect(await first).toEqual({ status: 'refused', reason: 'consent_missing' });

      expect(await routedRow(lead.id)).toMatchObject({
        routeStatus: 'unmatched', routeReason: 'province_unmapped', routedTenantId: null, routedAt: marked.routedAt,
      });
      const page = await listUnmatchedLeads({ limit: 200 }, prisma);
      expect(page.rows.some((r) => r.publicLeadId === lead.id)).toBe(true);
      expect(await contactsOf(lead.id)).toEqual([]);
    });
  });
});

/**
 * A `db` for forwardPublicLead that parks the FIRST `publicLead.updateMany` whose `data.routeStatus` equals
 * `mark` until `release()` is called. `reached` resolves when it is parked. Only `$transaction` is wrapped:
 * that is the one door `withSystemScopeOn` uses.
 */
function gatedDb(base: typeof prisma, mark: 'routed' | 'unmatched') {
  let signal!: () => void;
  let open!: () => void;
  const reached = new Promise<void>((resolve) => (signal = resolve));
  const gate = new Promise<void>((resolve) => (open = resolve));
  let parked = false;
  const bind = (target: object, key: string | symbol): unknown => {
    const value: unknown = Reflect.get(target, key);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  };
  const wrapTx = (tx: object): object =>
    new Proxy(tx, {
      get(target, key) {
        if (key !== 'publicLead') return bind(target, key);
        const delegate = Reflect.get(target, key) as typeof prisma.publicLead;
        return new Proxy(delegate, {
          get(d, k) {
            if (k !== 'updateMany') return bind(d, k);
            // Forwards the code-under-test's own call unchanged (it guards its id with requireActionId);
            // refused here too if the id is not a string, so this pass-through can never go filterless.
            const forward = bind(d, k) as (a: unknown) => Promise<unknown>;
            return async (args: { where?: { id?: unknown }; data?: { routeStatus?: unknown } }) => {
              if (typeof args.where?.id !== 'string') throw new Error('gatedDb: publicLead.updateMany without a string id');
              if (!parked && args.data?.routeStatus === mark) {
                parked = true;
                signal();
                await gate;
              }
              return forward(args);
            };
          },
        });
      },
    });
  const db = new Proxy(base, {
    get(target, key) {
      if (key !== '$transaction') return bind(target, key);
      return (fn: (tx: object) => Promise<unknown>, options?: unknown) =>
        (target.$transaction as (f: (tx: object) => Promise<unknown>, o?: unknown) => Promise<unknown>)((tx) => fn(wrapTx(tx)), options);
    },
  });
  return { db, reached, release: () => open() };
}
