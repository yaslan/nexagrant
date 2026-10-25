import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { createDbClient, withTenantOn } from '@/lib/db';
import { getKpiMetricsIn, getKpiTrendIn } from '@/modules/m5/server/queries';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MVCU7MP8JK1V5 (FO-72) — the dashboard trend over a multi-year range.
 *
 * The trend used to issue three `count` queries per week, one after another,
 * inside the dashboard's interactive transaction: a five-year range is ~780
 * round trips, a 26-year one ~4,100, and the 5 s transaction timeout turned the
 * whole dashboard into "could not load data". The claim pinned here is the
 * shape of the read — a bounded number of queries whatever the range — plus the
 * numbers it must still produce.
 *
 * Fixture (tenant A), from Mon 2021-01-04. Five years of weeks is past the
 * 120-bucket cap (TASK-MVCW3ANV1JU6Y), so that range is read in three-week
 * buckets; the boundary claim is pinned on a short, weekly range instead.
 *   week 2021-01-04:   two live opportunities, both G0-scored, one with a
 *                      submitted proposal                        → offers 2, 50 %
 *                      one archived opportunity                  → not counted
 *   week 2021-01-11:   one opportunity created at exactly 00:00 Z, the
 *                      boundary with the first week              → offers 1, here only
 *   2023-06-15:        one opportunity, not scored               → offers 1, 0 %
 *   before the range:  one opportunity                           → not counted
 *   after the range:   one opportunity on 2026-01-02, past `to` but inside the
 *                      last bucket's 21 days                     → not counted
 * Tenant B has one opportunity in the first bucket; it must not reach A.
 */

const SUITE = 'kpi trend live test';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `kpitrend-${Date.now().toString(36)}`;

const FROM = new Date('2021-01-04T00:00:00Z');
// Five years is 261 weeks, past the cap: three-week buckets, 2021-01-04 … 2025-12-15.
const TO = new Date('2025-12-31T23:59:59.999Z');
const STEP_DAYS = 21;
const BUCKETS = 87;
// Nine weeks: under the cap, so still a week per bucket.
const WEEKLY_TO = new Date('2021-03-07T23:59:59.999Z');

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
const ids = { tenantA: '', tenantB: '' };

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) return;
  rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  const reachable = await rls.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  if (!reachable) {
    skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
    return;
  }
  await assertRlsSubjectRole(rls, SUITE);

  const tenant = (suffix: string) =>
    admin!.tenant.create({ data: { name: `${RUN} ${suffix}`, slug: `${RUN}-${suffix}`, country: 'TR' } });
  ids.tenantA = (await tenant('a')).id;
  ids.tenantB = (await tenant('b')).id;

  await withTenantOn(admin, ids.tenantA, async (tx) => {
    const ws = await tx.workspace.create({ data: { tenantId: ids.tenantA, name: RUN, slug: RUN } });
    const opp = (title: string, createdAt: string, extra: { g0Score?: number; deletedAt?: Date } = {}) =>
      tx.opportunity.create({
        data: { tenantId: ids.tenantA, workspaceId: ws.id, title: `${RUN} ${title}`, createdAt: new Date(createdAt), ...extra },
      });
    const submitted = await opp('submitted', '2021-01-05T10:00:00Z', { g0Score: 70 });
    await tx.proposal.create({
      data: { tenantId: ids.tenantA, opportunityId: submitted.id, submittedAt: new Date('2021-02-01T00:00:00Z') },
    });
    await opp('scored', '2021-01-06T10:00:00Z', { g0Score: 60 });
    await opp('archived', '2021-01-07T10:00:00Z', { g0Score: 80, deletedAt: new Date('2021-01-08T00:00:00Z') });
    await opp('boundary', '2021-01-11T00:00:00Z');
    await opp('mid-range', '2023-06-15T10:00:00Z');
    await opp('before-range', '2020-12-31T10:00:00Z', { g0Score: 50 });
    await opp('after-range', '2026-01-02T10:00:00Z');
  });

  await withTenantOn(admin, ids.tenantB, async (tx) => {
    const ws = await tx.workspace.create({ data: { tenantId: ids.tenantB, name: RUN, slug: RUN } });
    await tx.opportunity.create({
      data: { tenantId: ids.tenantB, workspaceId: ws.id, title: `${RUN} b`, createdAt: new Date('2021-01-05T12:00:00Z'), g0Score: 90 },
    });
  });

  ready = true;
});

afterAll(async () => {
  if (admin && ids.tenantA) {
    // The tenant cascade takes workspaces, opportunities and proposals with it.
    await admin.tenant.deleteMany({
      where: { id: { in: [requireId(ids.tenantA, 'tenantA'), requireId(ids.tenantB, 'tenantB')] } },
    });
  }
  await rls?.$disconnect();
  await admin?.$disconnect();
});

/** The RLS-subject client with every operation it sends counted, raw SQL included. */
function countingClient(client: PrismaClient): { client: PrismaClient; count: () => number; reset: () => void } {
  let n = 0;
  const counted = client.$extends({
    query: {
      $allOperations({ args, query }) {
        n += 1;
        return query(args);
      },
    },
  }) as unknown as PrismaClient;
  return { client: counted, count: () => n, reset: () => (n = 0) };
}

describe('getKpiTrend against a live database', () => {
  test('a five-year range is read in a bounded number of queries, not one batch per bucket', async (ctx) => {
    if (!ready) ctx.skip();
    const counter = countingClient(rls!);
    const out = await withTenantOn(counter.client, ids.tenantA, async (tx) => {
      counter.reset();
      return getKpiTrendIn(tx, ids.tenantA, FROM, TO);
    });
    expect(out).toHaveLength(BUCKETS * 2);
    expect(counter.count()).toBeLessThanOrEqual(2);
  });

  test('the five-year numbers: per-bucket offers and hit rate, archived and out-of-range rows left out', async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantA, (tx) => getKpiTrendIn(tx, ids.tenantA, FROM, TO));

    const at = (date: string, metric: string) => out.find((r) => r.date === date && r.metric === metric)?.value;
    // The first three weeks share a bucket: two scored (one submitted) plus the unscored boundary one.
    expect(out[0]).toEqual({ date: '2021-01-04', metric: 'offers', value: 3 });
    expect(out[1]).toEqual({ date: '2021-01-04', metric: 'success_rate', value: 50 });
    expect(at('2023-06-05', 'offers')).toBe(1);
    expect(at('2023-06-05', 'success_rate')).toBe(0);
    expect(out.at(-1)?.date).toBe('2025-12-15');

    const offers = out.filter((r) => r.metric === 'offers');
    expect(offers.map((r) => r.date)).toEqual(
      Array.from({ length: BUCKETS }, (_, k) =>
        new Date(FROM.getTime() + k * STEP_DAYS * 86_400_000).toISOString().slice(0, 10)
      )
    );
    expect(offers.reduce((sum, r) => sum + r.value, 0)).toBe(4);
  });

  test('an opportunity created exactly on a bucket boundary counts once, in the later bucket', async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantA, (tx) => getKpiTrendIn(tx, ids.tenantA, FROM, WEEKLY_TO));
    expect(out.filter((r) => r.metric === 'offers')).toHaveLength(9);
    const offers = (date: string) => out.find((r) => r.date === date && r.metric === 'offers')?.value;
    expect(offers('2021-01-04')).toBe(2);
    expect(offers('2021-01-11')).toBe(1);
  });

  test('the last bucket stops at `to`: the trend sums to the "total offers" card', async (ctx) => {
    if (!ready) ctx.skip();
    const [trend, metrics] = await withTenantOn(rls!, ids.tenantA, async (tx) => [
      await getKpiTrendIn(tx, ids.tenantA, FROM, TO),
      await getKpiMetricsIn(tx, ids.tenantA, FROM, TO),
    ] as const);
    const offers = trend.filter((r) => r.metric === 'offers');
    expect(offers.at(-1)).toEqual({ date: '2025-12-15', metric: 'offers', value: 0 });
    expect(offers.reduce((sum, r) => sum + r.value, 0)).toBe(metrics.totalOffers);
    expect(metrics.totalOffers).toBe(4);
  });

  test('a 26-year range completes inside the default 5 s transaction timeout', async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantA, (tx) =>
      getKpiTrendIn(tx, ids.tenantA, new Date('2000-01-03T00:00:00Z'), TO)
    );
    expect(out.filter((r) => r.metric === 'offers').reduce((sum, r) => sum + r.value, 0)).toBe(5);
  });

  test('a year-1000 `from` is capped at 120 buckets and still counts every row in range', async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantA, (tx) =>
      getKpiTrendIn(tx, ids.tenantA, new Date('1000-01-01T00:00:00Z'), TO)
    );
    const offers = out.filter((r) => r.metric === 'offers');
    expect(offers.length).toBeLessThanOrEqual(120);
    expect(offers.reduce((sum, r) => sum + r.value, 0)).toBe(5);
  });

  test("bound to tenant B, a read for tenant A's id returns only zeros: RLS, not only the WHERE", async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantB, (tx) => getKpiTrendIn(tx, ids.tenantA, FROM, TO));
    expect(out).toHaveLength(BUCKETS * 2);
    expect(out.every((r) => r.value === 0)).toBe(true);
  });

  test("tenant B sees its own opportunity, not A's", async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantB, (tx) => getKpiTrendIn(tx, ids.tenantB, FROM, TO));
    expect(out[0]).toEqual({ date: '2021-01-04', metric: 'offers', value: 1 });
    expect(out.filter((r) => r.metric === 'offers').reduce((sum, r) => sum + r.value, 0)).toBe(1);
  });
});
