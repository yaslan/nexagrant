import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import type Stripe from 'stripe';

/**
 * TASK-MTVSBEO7VX6Y4 / ADR-0003 — the Stripe webhook's idempotency key under
 * the role the application will actually run as.
 *
 * Why this file exists next to `stripe-webhook-idempotency.live.test.ts`:
 * that one measures the guard through the `prisma` singleton, which locally is
 * the `fabrika` role — SUPERUSER, BYPASSRLS. Every RLS policy in this database
 * is skipped on that connection, so a green run there says nothing about the
 * role the app is being moved to. Measured on `fabrika_app` (NOBYPASSRLS), the
 * same code granted the monthly allowance, failed to write the key, and let
 * Stripe's redelivery grant it a second time:
 *
 *     after first delivery: Subscription=1 AddOn=1 CreditLedger=1 AuditEvent=0
 *     guard row visible as fabrika_app, no tenant set: 0
 *
 * The reason was structural, not a typo: the key was an `AuditEvent` row, that
 * table carries `tenant_or_shared`, and a row that HAS a tenant is neither
 * readable nor writable unless `app.tenant_id` names that tenant — and the row
 * was written last, outside the tenant transaction.
 *
 * So this file points the singleton at `fabrika_app` before `@/lib/db` loads
 * (the connection string is read at module scope) and drives the production
 * handlers over it. `vi.hoisted` is the only place that can run before an
 * import in an ES module.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  // `envValue` cannot be used here: hoisted code runs before every import, which
  // is the whole point — `@/lib/db` reads the connection string at module scope,
  // so the swap has to happen before that module is evaluated. Hence the dynamic
  // imports. And the owning role's URL has to be captured *now*, because the
  // line below overwrites `process.env.DATABASE_URL` and every later reader
  // would otherwise see the RLS role instead.
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

/**
 * The Stripe SDK is the transport, not the behaviour under test: no network is
 * available here, and only `logInvoicePayment` reaches for it.
 */
vi.mock('stripe', () => {
  class MockStripe {
    subscriptions = { retrieve: async () => fakeSubscription('active') };
    webhooks = { constructEvent: () => { throw new Error('not used'); } };
  }
  return { default: MockStripe };
});

import pg from 'pg';
import { prisma, createDbClient } from '@/lib/db';
import {
  syncStripeSubscription,
  handleSubscriptionCancellation,
} from '@/lib/billing/subscription-sync';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/** Fixtures and counts go through the owning role; only the handlers run as fabrika_app. */
const PRIV_URL = OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const admin = createDbClient(PRIV_URL);

const SUITE = 'stripe webhook RLS idempotency test';

const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

// Checked before any test runs, so a BYPASSRLS role fails the whole file rather
// than one assertion next to many vacuous greens.
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `mtvsbe-${Date.now()}`;
const TENANT = `t-rls-${RUN}`;
const PLAN = `plan-rls-${RUN}`;
const PRICE = `price-rls-${RUN}`;
const ADDON_PRICE = `price-rls-addon-${RUN}`;
const ADDON_SKU = `sku-rls-addon-${RUN}`;
const CREDITS = 777;
const SUB_ID = `sub-rls-${RUN}`;
/** Sized to the pg pool default (max=10), so the wave cannot be won by queueing alone. */
const WAVE = 8;

function fakeSubscription(status: string, tenantId = TENANT): Stripe.Subscription {
  return {
    id: SUB_ID,
    customer: `cus-rls-${RUN}`,
    status,
    metadata: { tenantId },
    billing_cycle_anchor: 0,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    items: {
      data: [
        { id: `si-${RUN}`, quantity: 1, price: { id: PRICE, unit_amount: 4900, currency: 'usd' } },
        { id: `si-a-${RUN}`, quantity: 2, price: { id: ADDON_PRICE, unit_amount: 900, currency: 'usd' } },
      ],
    },
  } as unknown as Stripe.Subscription;
}

/** Every table a webhook can move, counted one at a time out of Postgres. */
async function snapshot() {
  const [subscriptions, addOns, creditRows, credits, audits, keys] = await Promise.all([
    admin.subscription.count({ where: { tenantId: TENANT } }),
    admin.addOn.count({ where: { tenantId: TENANT, endedAt: null } }),
    admin.creditLedger.count({ where: { tenantId: TENANT } }),
    admin.creditLedger.aggregate({ where: { tenantId: TENANT }, _sum: { delta: true } }),
    admin.auditEvent.count({ where: { tenantId: TENANT } }),
    admin.stripeEventLog.count({ where: { tenantId: TENANT } }),
  ]);
  return {
    subscriptions,
    addOns,
    creditRows,
    creditBalance: credits._sum.delta ?? 0,
    audits,
    keys,
  };
}

async function wipe(): Promise<void> {
  await admin.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: TENANT } } });
  await admin.stripeEventLog.deleteMany({ where: { tenantId: TENANT } });
  await admin.auditEvent.deleteMany({ where: { tenantId: TENANT } });
  await admin.creditLedger.deleteMany({ where: { tenantId: TENANT } });
  await admin.addOn.deleteMany({ where: { tenantId: TENANT } });
  await admin.moduleState.deleteMany({ where: { tenantId: TENANT } });
  await admin.invoice.deleteMany({ where: { tenantId: TENANT } });
  await admin.subscription.deleteMany({ where: { tenantId: TENANT } });
  await admin.tenant.deleteMany({ where: { id: TENANT } });
  await admin.addOnCatalog.deleteMany({ where: { sku: ADDON_SKU } });
  await admin.plan.deleteMany({ where: { id: PLAN } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.plan.create({
    data: {
      id: PLAN,
      name: `RLS idempotency probe ${RUN}`,
      monthlyCents: 4900,
      yearlyCents: 49000,
      currency: 'USD',
      seats: 3,
      workspaces: 1,
      aiCreditsMonthly: CREDITS,
      modules: ['M1'],
      stripePriceMonthly: PRICE,
      visibility: 'private',
    },
  });
  await admin.addOnCatalog.create({
    data: {
      sku: ADDON_SKU,
      name: `Probe add-on ${RUN}`,
      monthlyCents: 900,
      currency: 'USD',
      stripePriceId: ADDON_PRICE,
    },
  });
  await admin.tenant.create({ data: { id: TENANT, name: TENANT, slug: TENANT, country: 'TR' } });
  // `handleSubscriptionCancellation` downgrades to `free`; seeded databases have
  // it, a bare one may not.
  await admin.plan.upsert({
    where: { id: 'free' },
    update: {},
    create: {
      id: 'free', name: 'Free', monthlyCents: 0, yearlyCents: 0, currency: 'USD',
      seats: 1, workspaces: 1, aiCreditsMonthly: 0, modules: [], visibility: 'public',
    },
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('stripe webhook idempotency under fabrika_app (live database)', () => {
  test('the handlers really are running as a role the policies apply to', async () => {
    // If this ever passes on a BYPASSRLS role, every other assertion in this
    // file is meaningless — that is the false green this card was created by.
    const rows = await prisma.$queryRaw<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0]?.current_user).toBe('fabrika_app');
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  test('a first delivery writes the money, the key and the audit row together', async () => {
    const eventId = `evt-rls-sync-${RUN}`;

    expect(await snapshot()).toMatchObject({ subscriptions: 0, creditRows: 0, keys: 0, audits: 0 });

    const first = await syncStripeSubscription(fakeSubscription('active'), eventId);

    expect(first.status).toBe('ACTIVE');
    expect(first.creditsGranted).toBe(CREDITS);
    // The row that used to be missing here is `audits`/`keys`: the money landed
    // and the idempotency record did not.
    expect(await snapshot()).toMatchObject({
      subscriptions: 1,
      addOns: 1,
      creditRows: 1,
      creditBalance: CREDITS,
      audits: 1,
      keys: 1,
    });
  });

  test('a redelivery of the same event changes no row in any of the five tables', async () => {
    const eventId = `evt-rls-sync-${RUN}`;
    const before = await snapshot();

    const second = await syncStripeSubscription(fakeSubscription('active'), eventId);

    expect(second.status).toBe('skipped');
    expect(second.creditsGranted).toBe(0);
    // Not "roughly the same". The same numbers, table by table.
    expect(await snapshot()).toEqual(before);
  });

  test('a new event id does move the same rows', async () => {
    // The counterfactual. Without it a handler that had stopped writing at all
    // would satisfy the assertion above perfectly.
    const before = await snapshot();

    await syncStripeSubscription(fakeSubscription('active'), `evt-rls-fresh-${RUN}`);
    const after = await snapshot();

    expect(after.keys).toBe(before.keys + 1);
    expect(after.audits).toBe(before.audits + 1);
    expect(after.subscriptions).toBe(1);
  });

  test('a stale active event replayed after a cancellation grants no second allowance', async () => {
    // The money leak this card closes, in the shape it actually occurs. A plain
    // redelivery over an ACTIVE row never reaches the grant branch; this one
    // does, because the row is CANCELED when the stale event arrives.
    const staleEvent = `evt-rls-stale-${RUN}`;
    await syncStripeSubscription(fakeSubscription('active'), staleEvent);
    const afterActivation = await snapshot();

    await handleSubscriptionCancellation(fakeSubscription('canceled'), `evt-rls-cancel-${RUN}`);
    const cancelled = await admin.subscription.findUnique({ where: { tenantId: TENANT } });
    expect(cancelled?.status).toBe('CANCELED');

    for (let i = 0; i < 3; i += 1) {
      const replay = await syncStripeSubscription(fakeSubscription('active'), staleEvent);
      expect(replay.status).toBe('skipped');
    }

    const after = await snapshot();
    expect(after.creditRows).toBe(afterActivation.creditRows);
    expect(after.creditBalance).toBe(afterActivation.creditBalance);
    // And the cancellation is still a cancellation: measured under
    // `fabrika_app` before this fix, the stale replay pulled it back to ACTIVE.
    const still = await admin.subscription.findUnique({ where: { tenantId: TENANT } });
    expect(still?.status).toBe('CANCELED');
  });

  test('a crash after the money cannot leave the key behind, or the money without it', async () => {
    // The card's requirement (d), made real rather than argued. A trigger scoped
    // to this run's audit rows raises inside the transaction *after* the
    // subscription, add-on and credit writes — exactly the mid-handler crash
    // that used to leave money written and the key missing.
    //
    // Scoped by `target` so it can only ever fire on this test's own rows: the
    // dev database is shared with other agents' suites.
    const guard = new pg.Client({ connectionString: PRIV_URL });
    await guard.connect();
    const crashSub = `${SUB_ID}-crash`;
    try {
      await guard.query(`
        CREATE OR REPLACE FUNCTION fabrika_test_crash_${RUN.replace(/\W/g, '_')}()
        RETURNS trigger AS $fn$
        BEGIN
          IF NEW."target" = ${escapeLiteral(crashSub)} THEN
            RAISE EXCEPTION 'probe: audit write fails mid-handler';
          END IF;
          RETURN NEW;
        END $fn$ LANGUAGE plpgsql;`);
      await guard.query(`
        CREATE TRIGGER fabrika_test_crash_trg_${RUN.replace(/\W/g, '_')}
        BEFORE INSERT ON "AuditEvent"
        FOR EACH ROW EXECUTE FUNCTION fabrika_test_crash_${RUN.replace(/\W/g, '_')}();`);

      const before = await snapshot();
      const crashing = fakeSubscription('active');
      (crashing as { id: string }).id = crashSub;
      const eventId = `evt-rls-crash-${RUN}`;

      await expect(syncStripeSubscription(crashing, eventId)).rejects.toThrow();

      const after = await snapshot();
      // Either both or neither. Nothing moved at all, because the audit row and
      // the key are in the same transaction as the money.
      expect(after).toEqual(before);

      // And the event is genuinely still unclaimed, so Stripe's retry can
      // succeed rather than being skipped over a half-applied delivery.
      const key = await admin.stripeEventLog.findUnique({ where: { stripeEventId: eventId } });
      expect(key).toBeNull();
    } finally {
      await guard.query(`DROP TRIGGER IF EXISTS fabrika_test_crash_trg_${RUN.replace(/\W/g, '_')} ON "AuditEvent"`);
      await guard.query(`DROP FUNCTION IF EXISTS fabrika_test_crash_${RUN.replace(/\W/g, '_')}()`);
      await guard.end();
    }
  });

  test('simultaneous deliveries of one event are settled by the database, not by a read', async () => {
    // The gap a read-then-write guard cannot close and the UNIQUE constraint
    // can: every one of these reads no key, so every one of them tries to claim.
    await admin.creditLedger.deleteMany({ where: { tenantId: TENANT } });
    await admin.stripeEventLog.deleteMany({ where: { tenantId: TENANT } });
    await admin.auditEvent.deleteMany({ where: { tenantId: TENANT } });
    await admin.subscription.deleteMany({ where: { tenantId: TENANT } });
    await admin.addOn.deleteMany({ where: { tenantId: TENANT } });

    const eventId = `evt-rls-race-${RUN}`;
    const results = await Promise.allSettled(
      Array.from({ length: WAVE }, () => syncStripeSubscription(fakeSubscription('active'), eventId))
    );

    const applied = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'ACTIVE'
    ).length;
    const skipped = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'skipped'
    ).length;
    const failed = results.filter((r) => r.status === 'rejected');

    // A serialisation failure is a legitimate outcome for a concurrent
    // transaction; a wrong row count is not. What must hold is the row count.
    const after = await snapshot();
    // Printed so the mutation run (drop the UNIQUE index) shows what the
    // constraint is actually buying, not just that an assertion moved.
    console.log(
      `wave=${WAVE} applied=${applied} skipped=${skipped} rejected=${failed.length} ` +
        `| keys=${after.keys} creditRows=${after.creditRows} balance=${after.creditBalance}`
    );
    expect(after.keys).toBe(1);
    expect(after.creditRows).toBe(1);
    expect(after.creditBalance).toBe(CREDITS);
    expect(after.audits).toBe(1);
    expect(applied).toBe(1);
    expect(applied + skipped + failed.length).toBe(WAVE);
  });
});

/** Postgres literal quoting for the trigger body above. */
function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
