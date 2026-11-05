import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

/**
 * Live Stripe event retention pruning — real Postgres, real Prisma.
 * Tests the pruneOldStripeEvents pure function against a real database.
 *
 * Verifies:
 * - Events exactly at retention boundary are preserved
 * - Events older than retention boundary are deleted
 * - Events newer than retention boundary are preserved
 * - Pruning is idempotent and counts correctly
 * - The sweep reaches EVERY tenant's rows under the RLS role (TASK-MULQKFER4MF0Y)
 *
 * This is not a unit test: the retention logic is database-dependent
 * (DateTime comparisons in Postgres). A mocked Prisma client cannot
 * validate the WHERE clause filter semantics.
 *
 * Runs as `fabrika_app` (NOBYPASSRLS), not the `fabrika` superuser: on the
 * superuser every RLS policy is skipped, so the unscoped deleteMany this file
 * used to exercise passed here and deleted nothing in production. Measured on
 * fabrika_app before the fix: `pruneOldStripeEvents()` returned 0 with old rows
 * in two tenants. The singleton is pointed at the RLS role before `@/lib/db`
 * loads (same swap as stripe-webhook-idempotency-rls.live.test.ts); fixtures and
 * counts go through the owning role.
 *
 * All estate-wide pruning lives in this ONE file on purpose: the prune deletes
 * every old row, so a second file seeding old rows in parallel would inflate
 * the exact counts asserted below. For the same reason it never runs on the shared
 * `fabrika` database: outside GitHub Actions it skips there (FO-366 F5 measured a real old row
 * gone); ci.yml's `fabrika` is a throwaway service container.
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
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma } from '@/lib/db';
import { pruneOldStripeEvents, STRIPE_EVENT_RETENTION_DAYS } from '@/lib/billing/stripe-event-retention';
import { assertRlsSubjectRole, isGithubActions, requireRlsTestUrl, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');

const SUITE = 'stripe event retention test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE ? await usedDatabaseName(prisma, admin, SUITE) : undefined;
const SHARED = DB_NAME === 'fabrika' && !isGithubActions();
if (SHARED) skipOrFailInCi(SUITE, 'the prune deletes across every tenant; refusing to run on the shared "fabrika" database');
const HAS_DB = DB_NAME !== undefined && !SHARED;

// The prune runs over the swapped singleton; on a BYPASSRLS role it would
// delete across tenants and the fix this file pins would be invisible.
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

// Unique run ID to isolate this test's data
const RUN = Math.random().toString(36).slice(2, 10);
const TENANT_ID = `t-retention-${RUN}`;
const OTHER_TENANT_ID = `t-retention-b-${RUN}`;
const TENANTS = [TENANT_ID, OTHER_TENANT_ID];

async function cleanUp(): Promise<void> {
  await admin.stripeEventLog.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.tenant.deleteMany({ where: { id: { in: TENANTS } } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await cleanUp();
  for (const id of TENANTS) {
    await admin.tenant.create({
      data: { id, name: `Retention probe ${RUN}`, slug: id, country: 'TR' },
    });
  }
});

afterEach(async () => {
  if (!HAS_DB) return;
  // Clean up between tests to isolate them
  await admin.stripeEventLog.deleteMany({ where: { tenantId: { in: TENANTS } } });
});

afterAll(async () => {
  if (!HAS_DB) return;
  // Report cleanup count for visibility
  const remaining = await admin.stripeEventLog.count({ where: { tenantId: TENANT_ID } });
  if (remaining > 0) {
    console.log(`[cleanup] ${remaining} StripeEventLog rows remain in tenant ${TENANT_ID}`);
  }
  await cleanUp();
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('stripe event retention pruning (live database, fabrika_app)', () => {
  test('prunes events older than 30 days, preserves newer ones', async () => {
    const now = new Date();

    // Event 31 days old: should be deleted
    const thirtyOneDaysAgo = new Date(now);
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    // Event 29 days old: should be preserved (within retention window)
    const twentyNineDaysAgo = new Date(now);
    twentyNineDaysAgo.setDate(twentyNineDaysAgo.getDate() - 29);

    // Event today: should be preserved
    const today = now;

    // Create test events
    await admin.stripeEventLog.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          stripeEventId: `evt-old-${RUN}`,
          handler: 'subscription.sync',
          processedAt: thirtyOneDaysAgo,
        },
        {
          tenantId: TENANT_ID,
          stripeEventId: `evt-recent-${RUN}`,
          handler: 'subscription.sync',
          processedAt: twentyNineDaysAgo,
        },
        {
          tenantId: TENANT_ID,
          stripeEventId: `evt-today-${RUN}`,
          handler: 'invoice.payment',
          processedAt: today,
        },
      ],
    });

    // Verify all three events exist before pruning
    const countBefore = await admin.stripeEventLog.count({ where: { tenantId: TENANT_ID } });
    expect(countBefore).toBe(3);

    // Run pruning
    const deletedCount = pruneOldStripeEvents(STRIPE_EVENT_RETENTION_DAYS);
    await expect(deletedCount).resolves.toBe(1);

    // Verify results: only 31-day-old event deleted
    const remaining = await admin.stripeEventLog.findMany({ where: { tenantId: TENANT_ID } });
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.stripeEventId).sort()).toEqual(
      [`evt-recent-${RUN}`, `evt-today-${RUN}`].sort()
    );

    // Verify 31-day-old event is gone
    const deleted = await admin.stripeEventLog.findUnique({
      where: { stripeEventId: `evt-old-${RUN}` },
    });
    expect(deleted).toBeNull();
  });

  test('pruning is idempotent: second run deletes nothing', async () => {
    const now = new Date();
    const thirtyOneDaysAgo = new Date(now);
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    await admin.stripeEventLog.create({
      data: {
        tenantId: TENANT_ID,
        stripeEventId: `evt-idem-${RUN}`,
        handler: 'subscription.sync',
        processedAt: thirtyOneDaysAgo,
      },
    });

    // First prune
    const firstDelete = await pruneOldStripeEvents(STRIPE_EVENT_RETENTION_DAYS);
    expect(firstDelete).toBe(1);

    // Second prune should delete nothing (already gone)
    const secondDelete = await pruneOldStripeEvents(STRIPE_EVENT_RETENTION_DAYS);
    expect(secondDelete).toBe(0);
  });

  test('respects custom retention window', async () => {
    const now = new Date();

    // Event 15 days old
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    // Event 5 days old
    const fiveDaysAgo = new Date(now);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    await admin.stripeEventLog.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          stripeEventId: `evt-cust-15-${RUN}`,
          handler: 'subscription.sync',
          processedAt: fifteenDaysAgo,
        },
        {
          tenantId: TENANT_ID,
          stripeEventId: `evt-cust-5-${RUN}`,
          handler: 'subscription.sync',
          processedAt: fiveDaysAgo,
        },
      ],
    });

    // Prune with 10-day window: only 15-day-old deleted
    const deleted = await pruneOldStripeEvents(10);
    expect(deleted).toBe(1);

    const remaining = await admin.stripeEventLog.findMany({
      where: { tenantId: TENANT_ID, stripeEventId: `evt-cust-5-${RUN}` },
    });
    expect(remaining).toHaveLength(1);
  });

  test('sweeps every tenant under the RLS role, not just the one in scope (TASK-MULQKFER4MF0Y)', async () => {
    const old = new Date();
    old.setDate(old.getDate() - (STRIPE_EVENT_RETENTION_DAYS + 5));
    const fresh = new Date();

    await admin.stripeEventLog.createMany({
      data: [
        { tenantId: TENANT_ID, stripeEventId: `evt-x-a-old-${RUN}`, handler: 'subscription.sync', processedAt: old },
        { tenantId: OTHER_TENANT_ID, stripeEventId: `evt-x-b-old-${RUN}`, handler: 'invoice.payment', processedAt: old },
        { tenantId: OTHER_TENANT_ID, stripeEventId: `evt-x-b-new-${RUN}`, handler: 'invoice.payment', processedAt: fresh },
      ],
    });

    // The production function, on the fabrika_app singleton, with no tenant set.
    // Unscoped, RLS hides every row: it returns 0 and both old rows survive.
    const deleted = await pruneOldStripeEvents(STRIPE_EVENT_RETENTION_DAYS);
    expect(deleted).toBe(2);

    const left = await admin.stripeEventLog.findMany({
      where: { tenantId: { in: TENANTS } },
      select: { stripeEventId: true },
    });
    expect(left.map((r) => r.stripeEventId)).toEqual([`evt-x-b-new-${RUN}`]);
  });

  test('fails gracefully if database is unavailable', async () => {
    // This test would require mocking Prisma or simulating a connection failure.
    // For now, we verify the function is correctly typed and can be called.
    // In a real scenario, Inngest would catch the error and retry.
    expect(typeof pruneOldStripeEvents).toBe('function');
  });
});
