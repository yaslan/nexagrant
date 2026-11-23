import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * NG-340 (HUKUK-5 5b) — the dashboard shows the last closed month, not a live
 * count, run on `fabrika_app` (NOBYPASSRLS, asserted) through the same calls the
 * page makes (getAgencyDashboardFunnelIn under withTenant):
 *
 *   1. the monthly run writes October's snapshot (on 1 November);
 *   2. organisations register in November: the dashboard answer is byte for
 *      byte the same, while the live count (server-only) has moved;
 *   3. a second run for October adds nothing (idempotent), still the same bytes;
 *   4. the run on 1 December writes November: the answer changes once, to the
 *      live count at that run.
 *
 * Same harness as agency-report.live.test.ts. Fixture: 20 SMEs, 20
 * municipalities, 3 NGOs and 8 universities in Samsun, so the type breakdown
 * shows numbers (the two small types cover each other); 15 more SMEs in November.
 */

const SUITE = 'agency-dashboard-month-end.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng340-${Date.now().toString(36)}`;

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
let agency = '';
let seq = 0;
const OCT_RUN = new Date('2026-11-01T06:00:00Z');
const NOV_RUN = new Date('2026-12-01T06:00:00Z');

type OrgTypeArg = 'SME' | 'MUNICIPALITY' | 'NGO' | 'UNIVERSITY';

async function newTenant(kind: 'AGENCY' | 'ORGANIZATION', agencyId: string | null, orgType: OrgTypeArg): Promise<string> {
  const n = ++seq;
  const t = await admin!.tenant.create({
    data: {
      name: `${RUN} secret-name-${n}`,
      slug: `${RUN}-${n}`,
      country: 'TR',
      kind,
      agencyId,
      orgType,
      province: kind === 'AGENCY' ? null : 'Samsun',
    },
    select: { id: true },
  });
  tenants.push(t.id);
  return t.id;
}

async function addOrgs(orgType: OrgTypeArg, n: number) {
  for (let i = 0; i < n; i++) await newTenant('ORGANIZATION', agency, orgType);
}

/** Exactly what the page passes to the client for `?kirilim=tur`, serialised. */
async function dashboardBytes(): Promise<string> {
  const { getAgencyDashboardFunnelIn } = await import('@/lib/agency/dashboard-snapshot');
  const { withTenant } = await import('@/lib/db');
  const r = await withTenant(agency, (tx) => getAgencyDashboardFunnelIn(tx, agency, { dimension: 'orgType' }));
  return JSON.stringify(r);
}

async function liveBytes(): Promise<string> {
  const { getAgencyFunnel } = await import('@/lib/agency/funnel');
  return JSON.stringify(await getAgencyFunnel(agency, { breakdown: { dimension: 'orgType' } }));
}

async function run(period: string, now: Date) {
  const { generateAgencyReports } = await import('@/lib/agency/report');
  return generateAgencyReports(period, now, { agencies: async () => [{ id: agency }] });
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
  agency = await newTenant('AGENCY', null, 'SME');
  await addOrgs('SME', 20);
  await addOrgs('MUNICIPALITY', 20);
  await addOrgs('NGO', 3);
  await addOrgs('UNIVERSITY', 8);
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin && tenants.length) {
    await admin.auditEvent.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => {});
    await admin.tenant.deleteMany({ where: { agencyId: agency } }).catch(() => {});
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => {});
  }
  await Promise.all([rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('agency dashboard reads the month-end snapshot (fabrika_app)', () => {
  let october = '';

  test('before the first month-end run the dashboard has no numbers at all', async () => {
    expect(await dashboardBytes()).toBe('null');
  });

  test('the run on 1 November writes October; the dashboard shows it and names the month', async () => {
    expect(await run('2026-10', OCT_RUN)).toMatchObject({ generated: 1, skipped: 0, failed: 0 });
    october = await dashboardBytes();
    const parsed = JSON.parse(october);
    expect(parsed.period).toBe('2026-10');
    expect(parsed.funnel).toEqual(JSON.parse(await liveBytes()));
    expect(parsed.funnel.breakdown.byOrgType.SME.registered).toEqual({ state: 'count', value: 20 });
    expect(parsed.funnel.all.registered).toEqual({ state: 'withheld' });
    expect(october).not.toContain('secret');
    for (const t of tenants) expect(october).not.toContain(t);
  });

  test('15 SMEs register in November: the live count moves, the dashboard does not, byte for byte', async () => {
    const liveBefore = await liveBytes();
    await addOrgs('SME', 15);
    const liveAfter = await liveBytes();
    expect(liveAfter).not.toBe(liveBefore);
    expect(JSON.parse(liveAfter).breakdown.byOrgType.SME.registered).toEqual({ state: 'count', value: 40 });
    expect(await dashboardBytes()).toBe(october);
  });

  test('a second October run adds nothing, and the dashboard still answers the same bytes', async () => {
    expect(await run('2026-10', OCT_RUN)).toMatchObject({ generated: 0, skipped: 1, failed: 0 });
    expect(await dashboardBytes()).toBe(october);
  });

  test('November cannot be made before it closes', async () => {
    await expect(run('2026-11', new Date('2026-11-20T12:00:00Z'))).rejects.toThrow(/last closed month/);
    expect(await dashboardBytes()).toBe(october);
  });

  test('the run on 1 December writes November: the dashboard changes once, to the count at that run', async () => {
    expect(await run('2026-11', NOV_RUN)).toMatchObject({ generated: 1, skipped: 0, failed: 0 });
    const november = await dashboardBytes();
    expect(november).not.toBe(october);
    const parsed = JSON.parse(november);
    expect(parsed.period).toBe('2026-11');
    expect(parsed.funnel).toEqual(JSON.parse(await liveBytes()));
    expect(parsed.funnel.breakdown.byOrgType.SME.registered).toEqual({ state: 'count', value: 40 });
    console.log(`[NG-340 live] october=${october}\n[NG-340 live] november=${november}`);
  });
});
