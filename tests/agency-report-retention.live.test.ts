import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * NG-341 (HUKUK-5 5d) — agency report retention, on `fabrika_app` (NOBYPASSRLS, asserted),
 * exactly as the job runs it: purgeExpiredAgencyReports → public.agency_report_purge per agency.
 * Old reports (older than 12 months) are deleted, newer ones kept; a second run changes nothing
 * and writes no record; one AgencyReportDeletionLog row per agency with count, period range and
 * basis, no content. The database refuses a cutoff under 12 months, another tenant's session,
 * and any direct write to the log by the app role. Other AuditEvent types are never touched.
 *
 * Same harness as agency-report.live.test.ts: `@/lib/db` is swapped for a copy on fabrika_app;
 * `admin` (fabrika) only builds and removes fixtures.
 */

const SUITE = 'agency-report-retention.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng341-${Date.now().toString(36)}`;
const EVENT = 'agency.report.generated';

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
const NOW = new Date();
const monthsAgo = (n: number, extraDays = 0) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d;
};

async function newAgency(n: number): Promise<string> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} agency-${n}`, slug: `${RUN}-${n}`, country: 'TR', kind: 'AGENCY', orgType: 'SME' },
    select: { id: true },
  });
  tenants.push(t.id);
  return t.id;
}

async function seed(tenantId: string, type: string, target: string, createdAt: Date): Promise<void> {
  await withTenantOn(admin!, tenantId, (tx) =>
    tx.auditEvent.create({ data: { tenantId, type, target, data: { period: target }, createdAt } })
  );
}

const reports = (tenantId: string) =>
  admin!.auditEvent.findMany({ where: { tenantId, type: EVENT }, select: { target: true }, orderBy: { target: 'asc' } });
const logs = (tenantId: string) => admin!.agencyReportDeletionLog.findMany({ where: { tenantId } });

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
    SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'agency_report_purge'`;
  if (fn[0]?.n !== 1) {
    skipReason = 'add-agency-report-deletion-log.sql is not applied (scripts/apply-migrations.sh)';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  ids.agencyA = await newAgency(1);
  ids.agencyB = await newAgency(2);
  // A: two expired reports (13 and 14 months), one just inside 12 months, one fresh,
  // and an expired event of ANOTHER type that must survive.
  await seed(ids.agencyA, EVENT, '2001-01', monthsAgo(14));
  await seed(ids.agencyA, EVENT, '2001-02', monthsAgo(13));
  await seed(ids.agencyA, EVENT, '2001-03', monthsAgo(11, 25));
  await seed(ids.agencyA, EVENT, '2001-04', monthsAgo(1));
  await seed(ids.agencyA, 'agency.invite.created', 'keep-me', monthsAgo(20));
  // B: only a fresh report.
  await seed(ids.agencyB, EVENT, '2001-05', monthsAgo(1));
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin && tenants.length) {
    const where = { tenantId: { in: tenants } };
    await admin.agencyReportDeletionLog.deleteMany({ where }).catch(() => {});
    await admin.auditEvent.deleteMany({ where }).catch(() => {});
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => {});
  }
  await Promise.all([rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('agency report retention (fabrika_app)', () => {
  const runId = `manual:${RUN}`;
  const agencies = async () => [{ id: ids.agencyA }, { id: ids.agencyB }];

  test('the database refuses a cutoff under 12 months and another tenant’s session', async () => {
    const { withTenant } = await import('@/lib/db');
    const tooRecent = monthsAgo(11).toISOString();
    await expect(
      withTenant(ids.agencyA, (tx) =>
        tx.$queryRaw`SELECT * FROM public.agency_report_purge(${ids.agencyA}, ${'probe'}, ${tooRecent}::timestamptz)`
      )
    ).rejects.toThrow(/less than 12 months/);
    const ok = monthsAgo(12, 1).toISOString();
    await expect(
      withTenant(ids.agencyB, (tx) =>
        tx.$queryRaw`SELECT * FROM public.agency_report_purge(${ids.agencyA}, ${'probe'}, ${ok}::timestamptz)`
      )
    ).rejects.toThrow(/not the session tenant/);
    expect(await reports(ids.agencyA)).toHaveLength(4);
    expect(await logs(ids.agencyA)).toEqual([]);
  });

  test('fabrika_app cannot write or delete the log, nor delete a report directly', async () => {
    const { withTenant } = await import('@/lib/db');
    await expect(
      withTenant(ids.agencyA, (tx) =>
        tx.agencyReportDeletionLog.create({
          data: { runId: 'forged', tenantId: ids.agencyA, reportCount: 1, basis: 'retention-12m', cutoffAt: new Date() },
        })
      )
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(ids.agencyA, (tx) => tx.agencyReportDeletionLog.deleteMany({ where: { tenantId: ids.agencyA } }))
    ).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(ids.agencyA, (tx) => tx.auditEvent.deleteMany({ where: { tenantId: ids.agencyA, type: EVENT } }))
    ).rejects.toThrow(/permission denied/);
  });

  test('a run deletes only the expired reports and writes one record per agency that lost any', async () => {
    const { purgeExpiredAgencyReports } = await import('@/lib/agency/retention');
    const r = await purgeExpiredAgencyReports(NOW, runId, { agencies });
    expect(r).toMatchObject({ runId, agencies: 2, deleted: 2, failed: 0, errors: [] });
    expect(r.purged).toEqual([{ tenantId: ids.agencyA, deleted: 2, periodFrom: '2001-01', periodTo: '2001-02' }]);
    expect((await reports(ids.agencyA)).map((x) => x.target)).toEqual(['2001-03', '2001-04']);
    expect((await reports(ids.agencyB)).map((x) => x.target)).toEqual(['2001-05']);
    expect(await admin!.auditEvent.count({ where: { tenantId: ids.agencyA, type: 'agency.invite.created' } })).toBe(1);

    const [log, ...more] = await logs(ids.agencyA);
    expect(more).toEqual([]);
    expect(log).toMatchObject({
      runId,
      tenantId: ids.agencyA,
      reportCount: 2,
      periodFrom: '2001-01',
      periodTo: '2001-02',
      basis: 'retention-12m',
    });
    expect(log!.cutoffAt.toISOString()).toBe(r.cutoff);
    expect(Math.abs(log!.deletedAt.getTime() - Date.now())).toBeLessThan(5 * 60_000);
    // Counts and metadata only: no snapshot, no actor, no name.
    expect(Object.keys(log!).sort()).toEqual([
      'basis',
      'cutoffAt',
      'deletedAt',
      'id',
      'periodFrom',
      'periodTo',
      'reportCount',
      'runId',
      'tenantId',
    ]);
    expect(await logs(ids.agencyB)).toEqual([]);
  });

  test('a second run — same id or a new one — changes nothing and writes no record', async () => {
    const { purgeExpiredAgencyReports } = await import('@/lib/agency/retention');
    for (const id of [runId, `${runId}-again`]) {
      const r = await purgeExpiredAgencyReports(NOW, id, { agencies });
      expect(r).toMatchObject({ deleted: 0, purged: [], failed: 0 });
    }
    expect(await reports(ids.agencyA)).toHaveLength(2);
    expect(await logs(ids.agencyA)).toHaveLength(1);
  });

  test('the agency reads its own deletion records; another agency sees none', async () => {
    const { withTenant } = await import('@/lib/db');
    const own = await withTenant(ids.agencyA, (tx) => tx.agencyReportDeletionLog.count());
    const other = await withTenant(ids.agencyB, (tx) =>
      tx.agencyReportDeletionLog.count({ where: { tenantId: ids.agencyA } })
    );
    expect(own).toBe(1);
    expect(other).toBe(0);
  });
});
