import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-175 (SEC NG-170 O-1, D-1) — PublicLead under row level security, measured on the real
 * `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * O-1: PublicLead had no RLS; a tenant session (fabrika_app + app.tenant_id) read every
 * visitor's name, e-mail, organisation and routedTenantId (6/6 rows in SEC NG-170 S4). Now the
 * one policy is `system_scope`, opened by system_scope_open() for 'public-intake',
 * 'platform-admin' and 'cross-tenant-job' only.
 * D-1: ProvinceLeadRoute opens for 'platform-admin' and 'cross-tenant-job' only.
 *
 * The code under test runs as fabrika_app; fixtures and ground-truth counts go through the
 * owner role (same singleton swap as tests/province-lead-route.live.test.ts). The other
 * legitimate paths are measured as fabrika_app in their own files: the form and the nightly
 * purge in tests/public-lead.live.test.ts, the forwarder and the unmatched worklist in
 * tests/province-lead-route.live.test.ts and tests/m18-intake.live.test.ts.
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

import { createDbClient, prisma } from '@/lib/db';
import { listUnmatchedLeads } from '@/lib/leads/province-route';
import { PUBLIC_LEAD_CONSENT, listPublicLeads, submitPublicLead } from '@/lib/leads/public-lead';
import { withSystemScopeOn, type SystemScopePurpose } from '@/lib/system-scope';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { holdTestDbLock, PUBLIC_LEAD_TABLE_LOCK } from './helpers/test-db-lock';

const SUITE = 'public lead RLS test';
// Salt for the IP hash in the form path; built per run so no key-like literal lives in the repo.
const IP_HASH_KEY = randomBytes(24).toString('hex');
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
const MINE = { endsWith: `-${RUN}@example.test` };
// A future createdAt keeps the fixture at the top of the admin list (newest first) whatever
// else the database holds; the nightly purge only ever deletes the past.
const FUTURE = new Date(Date.now() + 365 * 24 * 3600 * 1000);
// Provinces this file owns (province-lead-route.live owns Rize, Sinop, Van, Yalova, Bolu; m18-intake Samsun).
const PROVINCE = 'Kars';
const T: Record<'a' | 'b', string> = { a: '', b: '' };

const OPEN: SystemScopePurpose[] = ['public-intake', 'platform-admin', 'cross-tenant-job'];
const SHUT: SystemScopePurpose[] = ['tenant-discovery', 'subject-scoped', 'platform-aggregate'];

const leadData = (key: string, over: Record<string, unknown> = {}) => ({
  name: 'Ayşe Yılmaz', email: `${key}-${RUN}@example.test`, organisation: `Org ${key}`, province: PROVINCE, district: null,
  consentVersion: PUBLIC_LEAD_CONSENT.version, consentAt: FUTURE, source: 'fon-hazirlik', locale: 'tr', createdAt: FUTURE,
  ...over,
});

/** fabrika_app inside one tenant's session, like withTenantOn. */
const asTenant = <R>(tenantId: string, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<R>) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });

describe.skipIf(!HAS_DB)('PublicLead row level security (NG-175)', () => {
  let ownRows = 0;
  // NG-346: writes PublicLead rows (routed + unmatched) and reads them under RLS; hold the shared DDL lock for the file.
  let releasePublicLeadLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releasePublicLeadLock = await holdTestDbLock(OWNER_URL!, PUBLIC_LEAD_TABLE_LOCK);
    await admin.provinceLeadRoute.deleteMany({ where: { province: PROVINCE } });
    for (const key of ['a', 'b'] as const) {
      T[key] = (
        await admin.tenant.create({
          data: { name: `plrls-${key}-${RUN}`, slug: `plrls-${key}-${RUN}`, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' },
        })
      ).id;
    }
    // Three leads: one plain, one routed to tenant B (the SEC S4 shape), one unmatched (the worklist).
    await admin.publicLead.create({ data: leadData('plain') });
    await admin.publicLead.create({
      data: leadData('routed-b', { routeStatus: 'routed', routedTenantId: T.b, routedAt: FUTURE, transferConsent: true, transferConsentVersion: 'v', transferConsentAt: FUTURE }),
    });
    await admin.publicLead.create({
      data: leadData('unmatched', { routeStatus: 'unmatched', routeReason: 'province_unmapped', routedAt: FUTURE, transferConsent: true, transferConsentVersion: 'v', transferConsentAt: FUTURE }),
    });
    await admin.provinceLeadRoute.create({ data: { province: PROVINCE, targetTenantId: T.a, active: true } });
    ownRows = await admin.publicLead.count({ where: { email: MINE } });
  });

  afterAll(async () => {
    await admin.publicLead.deleteMany({ where: { email: MINE } });
    await admin.provinceLeadRoute.deleteMany({ where: { province: PROVINCE } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
    await releasePublicLeadLock?.();
  });

  describe('O-1: a tenant session cannot reach PublicLead', () => {
    test('the owner sees the fixture (the table is not empty)', () => {
      expect(ownRows).toBe(3);
    });

    test('tenant A reads 0 rows: not its own, not the lead routed to B, not the count', async () => {
      const seen = await asTenant(T.a, async (tx) => ({
        count: await tx.publicLead.count(),
        mine: await tx.publicLead.count({ where: { email: MINE } }),
        routedToB: await tx.publicLead.findMany({ where: { routedTenantId: T.b } }),
      }));
      expect(seen).toEqual({ count: 0, mine: 0, routedToB: [] });
      // B, the routed tenant itself, does not see "its" lead either: the copy lives in its M18 tables.
      expect(await asTenant(T.b, (tx) => tx.publicLead.count({ where: { routedTenantId: T.b } }))).toBe(0);
    });

    test('tenant A cannot insert, and UPDATE / DELETE reach 0 rows', async () => {
      await expect(asTenant(T.a, (tx) => tx.publicLead.create({ data: leadData('tenant-insert') }))).rejects.toThrow(/row-level security|42501/i);
      expect(await asTenant(T.a, (tx) => tx.publicLead.updateMany({ where: { email: MINE }, data: { routedTenantId: T.a } }))).toEqual({ count: 0 });
      expect(await asTenant(T.a, (tx) => tx.publicLead.deleteMany({ where: { email: MINE } }))).toEqual({ count: 0 });
      const after = await admin.publicLead.findMany({ where: { email: MINE }, select: { routedTenantId: true } });
      expect(after).toHaveLength(3);
      expect(after.filter((r) => r.routedTenantId === T.a)).toEqual([]);
    });

    test('no scope at all, and a hand-set app.system_scope (no seal), read 0 rows', async () => {
      expect(await prisma.publicLead.count({ where: { email: MINE } })).toBe(0);
      const forged = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.system_scope', 'on', true)`;
        await tx.$executeRaw`SELECT set_config('app.system_scope_purpose', 'platform-admin', true)`;
        return tx.publicLead.count({ where: { email: MINE } });
      });
      expect(forged).toBe(0);
    });

    test.each(SHUT)('a sealed %s scope reads 0 PublicLead rows and cannot insert', async (purpose) => {
      expect(await withSystemScopeOn(prisma, purpose, 'ng-175.test', (tx) => tx.publicLead.count({ where: { email: MINE } }))).toBe(0);
      await expect(withSystemScopeOn(prisma, purpose, 'ng-175.test', (tx) => tx.publicLead.create({ data: leadData(`shut-${purpose}`) }))).rejects.toThrow(
        /row-level security|42501/i
      );
    });

    test.each(OPEN)('a sealed %s scope sees every row', async (purpose) => {
      expect(await withSystemScopeOn(prisma, purpose, 'ng-175.test', (tx) => tx.publicLead.count({ where: { email: MINE } }))).toBe(ownRows);
    });
  });

  describe('the legitimate paths still work as fabrika_app', () => {
    test('the form (public-intake) stores the request', async () => {
      const email = `form-${RUN}@example.test`;
      const result = await submitPublicLead(
        {
          name: 'Ayşe Yılmaz', email, organisation: 'İlkadım Belediyesi', province: 'Samsun', district: 'İlkadım',
          readinessCode: 'municipality.111111111111111', consent: true, consentVersion: PUBLIC_LEAD_CONSENT.version,
          source: 'fon-hazirlik', locale: 'tr', website: '',
        },
        { ip: '192.0.2.175', secret: IP_HASH_KEY }
      );
      expect(result).toEqual({ ok: true });
      expect(await admin.publicLead.count({ where: { email } })).toBe(1);
    });

    test('/admin/leads (platform-admin) lists the requests', async () => {
      const { rows, total } = await listPublicLeads(prisma);
      expect(total).toBeGreaterThanOrEqual(ownRows);
      expect(rows.filter((r) => r.email.endsWith(`-${RUN}@example.test`)).map((r) => r.email.split('-')[0]).sort()).toEqual(
        expect.arrayContaining(['plain', 'routed', 'unmatched'])
      );
    });

    test('the unmatched worklist (platform-admin) lists the unmatched lead', async () => {
      const page = await listUnmatchedLeads({ limit: 100 }, prisma);
      expect(page.rows.map((r) => r.email)).toContain(`unmatched-${RUN}@example.test`);
    });
  });

  describe('D-1: ProvinceLeadRoute opens for platform-admin and cross-tenant-job only', () => {
    const routes = (purpose: SystemScopePurpose) =>
      withSystemScopeOn(prisma, purpose, 'ng-175.test', (tx) => tx.provinceLeadRoute.count({ where: { province: PROVINCE } }));

    test.each([...SHUT, 'public-intake'] as SystemScopePurpose[])('%s reads 0 rows and cannot insert', async (purpose) => {
      expect(await routes(purpose)).toBe(0);
      await expect(
        withSystemScopeOn(prisma, purpose, 'ng-175.test', (tx) => tx.provinceLeadRoute.create({ data: { province: PROVINCE, targetTenantId: T.a, active: false } }))
      ).rejects.toThrow(/row-level security|42501/i);
    });

    test.each(['platform-admin', 'cross-tenant-job'] as SystemScopePurpose[])('%s sees the mapping', async (purpose) => {
      expect(await routes(purpose)).toBe(1);
    });
  });
});
