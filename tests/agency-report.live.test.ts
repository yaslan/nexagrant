import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MULRR08Y9YI77 (FB KAMU B3) — the monthly region report, run on
 * `fabrika_app` (NOBYPASSRLS, asserted) exactly as the Inngest job runs it:
 * readAgencyFunnelRaw → buildAgencyReport → an AuditEvent in the agency's own
 * tenant. Then: the stored snapshot equals what the dashboard answers
 * (getAgencyFunnel) for every breakdown, carries no id or name, a second run
 * adds nothing, and another agency cannot read it.
 *
 * Same harness as agency-funnel.live.test.ts: `@/lib/db` is swapped for a copy on
 * fabrika_app; `admin` (fabrika) only builds and removes fixtures.
 */

const SUITE = 'agency-report.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `b3-${Date.now().toString(36)}`;

vi.mock('@/lib/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db')>();
  const { envValue: readEnv } = await import('./helpers/dotenv');
  const url = readEnv('DATABASE_URL_RLS_TEST');
  if (!url) return real;
  const client = real.createDbClient(url);
  return {
    ...real,
    prisma: client,
    withTenant: <T,>(tenantId: string, cb: Parameters<typeof real.withTenant<T>>[1]) =>
      real.withTenantOn(client, tenantId, cb),
  };
});

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const ids = { agencyA: '', agencyB: '' };
const orgs: string[] = [];
let seq = 0;
const NOW = new Date('2026-10-01T06:00:00Z');

async function newTenant(
  kind: 'AGENCY' | 'ORGANIZATION',
  agencyId: string | null,
  orgType: 'SME' | 'MUNICIPALITY',
  province: string | null
): Promise<string> {
  const n = ++seq;
  const t = await admin!.tenant.create({
    data: { name: `${RUN} secret-name-${n}`, slug: `${RUN}-${n}`, country: 'TR', kind, agencyId, orgType, province },
    select: { id: true },
  });
  tenants.push(t.id);
  return t.id;
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(rls, SUITE);
  const fn = await admin.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'agency_funnel_counts_by_province'`;
  if (fn[0]?.n !== 1) {
    skipReason = 'add-agency-funnel-province.sql is not applied (scripts/apply-migrations.sh)';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  ids.agencyA = await newTenant('AGENCY', null, 'SME', null);
  ids.agencyB = await newTenant('AGENCY', null, 'SME', null);
  // 6 organisations: 4 SMEs in Samsun (2 with a saved search), 2 municipalities in Tokat.
  for (let i = 0; i < 4; i++) orgs.push(await newTenant('ORGANIZATION', ids.agencyA, 'SME', 'Samsun'));
  for (let i = 0; i < 2; i++) orgs.push(await newTenant('ORGANIZATION', ids.agencyA, 'MUNICIPALITY', 'Tokat'));
  for (const t of orgs.slice(0, 2)) {
    await withTenantOn(admin, t, (tx) =>
      tx.savedSearch.create({ data: { tenantId: t, userId: `${RUN}-u`, name: `${RUN} secret`, filters: {} } })
    );
  }
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin && tenants.length) {
    const where = { tenantId: { in: tenants } };
    await admin.savedSearch.deleteMany({ where }).catch(() => {});
    await admin.auditEvent.deleteMany({ where }).catch(() => {});
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => {});
  }
  await Promise.all([rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('monthly agency report (fabrika_app)', () => {
  test('the run writes one snapshot per agency, in its own tenant, for the month that closed', async () => {
    const { generateAgencyReports, AGENCY_REPORT_EVENT } = await import('@/lib/agency/report');
    const r = await generateAgencyReports('2026-09', NOW, { agencies: async () => [{ id: ids.agencyA }, { id: ids.agencyB }] });
    expect(r).toEqual({ agencies: 2, generated: 2, skipped: 0, failed: 0, errors: [] });
    const rows = await admin!.auditEvent.findMany({
      where: { type: AGENCY_REPORT_EVENT, tenantId: { in: [ids.agencyA, ids.agencyB] } },
      select: { tenantId: true, target: true, actorId: true },
    });
    expect(rows.map((x) => x.tenantId).sort()).toEqual([ids.agencyA, ids.agencyB].sort());
    expect(new Set(rows.map((x) => x.target))).toEqual(new Set(['2026-09']));
  });

  test('the stored numbers are the dashboard’s: none, by type and each province, cell for cell', async () => {
    const { getAgencyFunnel } = await import('@/lib/agency/funnel');
    const { listAgencyReportsIn, readAgencyReportIn } = await import('@/lib/agency/report');
    const { withTenant } = await import('@/lib/db');
    const snap = await withTenant(ids.agencyA, async (tx) => {
      const [item] = await listAgencyReportsIn(tx, ids.agencyA);
      return readAgencyReportIn(tx, ids.agencyA, item!.id);
    });
    expect(snap).not.toBeNull();
    const none = await getAgencyFunnel(ids.agencyA);
    const byType = await getAgencyFunnel(ids.agencyA, { breakdown: { dimension: 'orgType' } });
    if (byType.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
    expect(snap!.all).toEqual(none.all);
    expect(snap!.byOrgType).toEqual(byType.breakdown.byOrgType);
    for (const province of ['Samsun', 'Tokat'] as const) {
      const f = await getAgencyFunnel(ids.agencyA, { breakdown: { dimension: 'province', province } });
      if (f.breakdown.dimension !== 'province') throw new Error('no province breakdown');
      const row = snap!.byProvince.find((p) => p.province === province);
      const shows = Object.values(f.breakdown.view).some((c) => c.state === 'count');
      // Listed exactly when the dashboard shows a number for it, and then equal.
      expect(Boolean(row)).toBe(shows);
      if (row) expect(row.view).toEqual(f.breakdown.view);
    }
    // 6 organisations → shown rounded: 5. 4 SMEs and 2 municipalities are each under 5: masked.
    expect(snap!.all.registered).toEqual({ state: 'count', value: 5 });
    expect(snap!.byOrgType.SME.registered).toEqual({ state: 'small' });
    expect(snap!.byOrgType.MUNICIPALITY.registered).toEqual({ state: 'small' });
  });

  test('the stored row carries no organisation id or name, and no raw count', async () => {
    const { AGENCY_REPORT_EVENT } = await import('@/lib/agency/report');
    const row = await admin!.auditEvent.findFirstOrThrow({
      where: { type: AGENCY_REPORT_EVENT, tenantId: ids.agencyA },
      select: { data: true },
    });
    const json = JSON.stringify(row.data);
    expect(json).not.toContain('secret');
    expect(json).not.toContain(RUN);
    for (const t of [...orgs, ids.agencyA, ids.agencyB]) expect(json).not.toContain(t);
    for (const m of json.matchAll(/"value":(\d+)/g)) expect(Number(m[1]) % 5).toBe(0);
  });

  test('a second run for the same month adds nothing', async () => {
    const { generateAgencyReports, AGENCY_REPORT_EVENT } = await import('@/lib/agency/report');
    const r = await generateAgencyReports('2026-09', NOW, { agencies: async () => [{ id: ids.agencyA }] });
    expect(r).toMatchObject({ generated: 0, skipped: 1, failed: 0 });
    expect(await admin!.auditEvent.count({ where: { type: AGENCY_REPORT_EVENT, tenantId: ids.agencyA } })).toBe(1);
  });

  test('agency B cannot read A’s report, not even by id, and lists only its own', async () => {
    const { listAgencyReportsIn, readAgencyReportIn } = await import('@/lib/agency/report');
    const { withTenant } = await import('@/lib/db');
    const aId = (await withTenant(ids.agencyA, (tx) => listAgencyReportsIn(tx, ids.agencyA)))[0]!.id;
    // B asks with its own scope and A's report id; and with A's tenant id under B's scope (RLS).
    expect(await withTenant(ids.agencyB, (tx) => readAgencyReportIn(tx, ids.agencyB, aId))).toBeNull();
    expect(await withTenant(ids.agencyB, (tx) => readAgencyReportIn(tx, ids.agencyA, aId))).toBeNull();
    const bList = await withTenant(ids.agencyB, (tx) => listAgencyReportsIn(tx, ids.agencyB));
    expect(bList.map((x) => x.id)).not.toContain(aId);
    expect(bList).toHaveLength(1);
  });
});
