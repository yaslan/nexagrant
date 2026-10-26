import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { consumePartnerSearchQuery } from '@/modules/m1/server/partner-search/api';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * FO-61 (PS-K3, TASK-MVCH2R3VSLAJN) — the Partner Search monthly quota of a
 * metered plan (Discover, Basic) against the real table, on `fabrika_app`
 * (NOBYPASSRLS, asserted), the way the route runs it inside `withTenant`:
 *
 *  - concurrent queries serialise on the (tenantId, month) row: with 10 left,
 *    25 at once give exactly 10 passes, and the counter stops at 10;
 *  - a new UTC month starts a new row at 1;
 *  - the row is the tenant's own: another tenant's scope neither sees it nor
 *    can count against it (strict tenant_isolation);
 *  - a read that fails after the count, in the same transaction, gives the
 *    unit back (review B1c; the route side: tests/partner-search-http.test.ts).
 *
 * The statement's text and the plan figures: tests/partner-search-api.test.ts.
 */

const SUITE = 'partner-search-quota.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `fo61-${Date.now().toString(36)}`;
const LIMIT = 10;

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let skipReason = '';
const tenants: string[] = [];

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
  for (const n of [1, 2]) {
    const t = await admin.tenant.create({
      data: { name: `${RUN} ${n}`, slug: `${RUN}-${n}`, country: 'TR' },
      select: { id: true },
    });
    tenants.push(t.id);
  }
});

afterAll(async () => {
  if (admin && tenants.length > 0) {
    // PartnerSearchQuotaUsage rows go with the tenant (onDelete: Cascade).
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } });
  }
  await rls?.$disconnect();
  await admin?.$disconnect();
});

const consume = (tenantId: string, now: Date) =>
  withTenantOn(rls!, tenantId, (tx) => consumePartnerSearchQuery(tx, tenantId, LIMIT, now));

describe('Partner Search quota (live DB, fabrika_app)', () => {
  test('25 concurrent queries with 10 left: exactly 10 pass and the counter stops at 10', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const tenantId = tenants[0]!;
    const now = new Date('2026-10-15T12:00:00Z');

    const results = await Promise.all(Array.from({ length: 25 }, () => consume(tenantId, now)));

    expect(results.filter((r) => r.ok)).toHaveLength(LIMIT);
    expect(results.filter((r) => !r.ok)).toHaveLength(25 - LIMIT);
    expect(results.filter((r) => r.ok).map((r) => r.used).sort((a, b) => a - b)).toEqual(
      Array.from({ length: LIMIT }, (_, i) => i + 1)
    );
    const rows = await admin!.partnerSearchQuotaUsage.findMany({ where: { tenantId }, select: { month: true, count: true } });
    expect(rows).toEqual([{ month: '2026-10', count: LIMIT }]);

    // The eleventh, sequentially, is still refused and changes nothing.
    await expect(consume(tenantId, now)).resolves.toEqual({ ok: false, used: LIMIT });
    expect((await admin!.partnerSearchQuotaUsage.findFirstOrThrow({ where: { tenantId, month: '2026-10' } })).count).toBe(LIMIT);
  });

  test('a new UTC month starts its own row at 1', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const tenantId = tenants[0]!;
    await expect(consume(tenantId, new Date('2026-11-01T00:00:00Z'))).resolves.toEqual({ ok: true, used: 1 });
    const months = await admin!.partnerSearchQuotaUsage.findMany({
      where: { tenantId },
      orderBy: { month: 'asc' },
      select: { month: true, count: true },
    });
    expect(months).toEqual([
      { month: '2026-10', count: LIMIT },
      { month: '2026-11', count: 1 },
    ]);
  });

  test('a read that fails after the count rolls the unit back with the transaction', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const tenantId = tenants[1]!;
    const now = new Date('2026-10-15T12:00:00Z');
    await expect(consume(tenantId, now)).resolves.toEqual({ ok: true, used: 1 });

    await expect(
      withTenantOn(rls!, tenantId, async (tx) => {
        await expect(consumePartnerSearchQuery(tx, tenantId, LIMIT, now)).resolves.toEqual({ ok: true, used: 2 });
        throw new Error('page read failed');
      })
    ).rejects.toThrow('page read failed');

    expect((await admin!.partnerSearchQuotaUsage.findFirstOrThrow({ where: { tenantId, month: '2026-10' } })).count).toBe(1);
  });

  test("another tenant's scope neither reads the row nor counts against it", async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const [owner, other] = [tenants[0]!, tenants[1]!];

    const seen = await withTenantOn(rls!, other, (tx) => tx.partnerSearchQuotaUsage.count({ where: { tenantId: owner } }));
    expect(seen).toBe(0);

    // Counting for `owner` from `other`'s scope: the upsert is refused by the policy.
    await expect(
      withTenantOn(rls!, other, (tx) => consumePartnerSearchQuery(tx, owner, LIMIT, new Date('2026-12-01T00:00:00Z')))
    ).rejects.toThrow();
    expect(await admin!.partnerSearchQuotaUsage.count({ where: { tenantId: owner, month: '2026-12' } })).toBe(0);
  });
});
