import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import type Stripe from 'stripe';
import pg from 'pg';
import { prisma } from '@/lib/db';
import {
  syncStripeSubscription,
  handleSubscriptionCancellation,
  logInvoicePayment,
} from '@/lib/billing/subscription-sync';

/**
 * TASK-MTVRACMDFRGKV — what a Stripe redelivery leaves behind, counted in the
 * database, after the thirteen tenant-scoped queries moved into `withTenant`.
 *
 * `stripe-webhook-idempotency.live.test.ts` already pins the audit row and the
 * credit grant against a redelivery (TASK-MTSY88Q6AMCGB). This file is the
 * money-path half of the same question and the one the migration had to answer:
 * the wrapper opens a real transaction where there was none — before this change
 * the handler issued no BEGIN at all and every write autocommitted on its own —
 * so the subscription row, the invoice and the credit balance are counted here
 * before and after the second delivery, and must be byte-identical.
 *
 * Every assertion is a count read back from Postgres. A mocked client would
 * happily report whatever it was told; only the database knows how many rows
 * a second delivery actually wrote.
 *
 * The counterfactual arm matters as much as the redelivery arm: a handler that
 * silently did nothing at all would satisfy "the second delivery changed
 * nothing" perfectly. `a new event id does change the same rows` is what stops
 * that reading.
 */

vi.mock('stripe', () => {
  class MockStripe {
    subscriptions = { retrieve: async () => fakeSubscription() };
    webhooks = { constructEvent: () => { throw new Error('not used'); } };
  }
  return { default: MockStripe };
});

const CONNECTION =
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';

async function dbReachable(): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: CONNECTION, connectionTimeoutMillis: 2000 });
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

const HAS_DB = await dbReachable();

const RUN = Math.random().toString(36).slice(2, 10);
const TENANT_ID = `t-scope-${RUN}`;
const PLAN_ID = `plan-scope-${RUN}`;
const PRICE_ID = `price-scope-${RUN}`;
const ADDON_PRICE = `price-scope-addon-${RUN}`;
const ADDON_SKU = `sku-scope-addon-${RUN}`;
const AI_CREDITS = 777;
/** Tenants for the concurrency wave; sized to the pg pool default (max=10). */
const WAVE = Array.from({ length: 10 }, (_, i) => `t-wave-${RUN}-${i}`);

function fakeSubscription(tenantId = TENANT_ID): Stripe.Subscription {
  return {
    id: `sub-scope-${tenantId}`,
    customer: `cus-scope-${tenantId}`,
    status: 'active',
    metadata: { tenantId },
    billing_cycle_anchor: 0,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    items: {
      data: [
        { id: `si-${tenantId}`, quantity: 1, price: { id: PRICE_ID, unit_amount: 4900, currency: 'usd' } },
        { id: `si-a-${tenantId}`, quantity: 2, price: { id: ADDON_PRICE, unit_amount: 900, currency: 'usd' } },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function fakeInvoice(id: string): Stripe.Invoice {
  return {
    id,
    subscription: `sub-scope-${TENANT_ID}`,
    amount_paid: 120_000,
    currency: 'try',
    hosted_invoice_url: 'https://stripe.test/i/1',
    lines: { data: [{ description: 'FonBridge probe' }] },
  } as unknown as Stripe.Invoice;
}

/** Everything a webhook can move, counted straight out of Postgres. */
async function snapshot(tenantId = TENANT_ID) {
  const [subscriptionRows, activeAddOns, credits, invoiceRows, auditRows, modulesOff] =
    await Promise.all([
      prisma.subscription.count({ where: { tenantId } }),
      prisma.addOn.count({ where: { tenantId, endedAt: null } }),
      prisma.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } }),
      prisma.invoice.count({ where: { tenantId } }),
      prisma.auditEvent.count({ where: { tenantId } }),
      prisma.moduleState.count({ where: { tenantId, status: 'OFF' } }),
    ]);
  return {
    subscriptionRows,
    activeAddOns,
    creditBalance: credits._sum.delta ?? 0,
    invoiceRows,
    auditRows,
    modulesOff,
  };
}

async function wipe(tenantIds: string[]): Promise<void> {
  for (const tenantId of tenantIds) {
    // SystemAlert carries no tenantId column, only a `meta` document naming the
    // tenant — the tenant-scoped sweep below cannot reach it, and an alert left
    // behind outlives its tenant and shows up in `pnpm alerts:check`
    // (TASK-MTVFWYKIZXRB1).
    await prisma.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: tenantId } } });
    await prisma.auditEvent.deleteMany({ where: { tenantId } });
    await prisma.creditLedger.deleteMany({ where: { tenantId } });
    await prisma.addOn.deleteMany({ where: { tenantId } });
    await prisma.moduleState.deleteMany({ where: { tenantId } });
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.addOnCatalog.deleteMany({ where: { sku: ADDON_SKU } });
  await prisma.plan.deleteMany({ where: { id: PLAN_ID } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await wipe([TENANT_ID, ...WAVE]);
  await prisma.plan.create({
    data: {
      id: PLAN_ID,
      name: `Tenant-scope probe ${RUN}`,
      monthlyCents: 4900,
      yearlyCents: 49000,
      currency: 'USD',
      seats: 3,
      workspaces: 1,
      aiCreditsMonthly: AI_CREDITS,
      modules: ['M1'],
      stripePriceMonthly: PRICE_ID,
      visibility: 'private',
    },
  });
  await prisma.addOnCatalog.create({
    data: {
      sku: ADDON_SKU,
      name: `Probe add-on ${RUN}`,
      monthlyCents: 900,
      currency: 'USD',
      stripePriceId: ADDON_PRICE,
    },
  });
  for (const id of [TENANT_ID, ...WAVE]) {
    await prisma.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
  }
  // Without a billing identity the invoice writer refuses the document and
  // raises a SystemAlert instead, so the invoice count would stay 0 either way
  // and prove nothing.
  await prisma.tenantBillingIdentity.create({
    data: {
      tenantId: TENANT_ID,
      buyerName: `Probe ${RUN} A.Ş.`,
      buyerVknTckn: '2840958172',
      buyerTaxOffice: 'Doğanbey V.D.',
      buyerAddress: 'ODTÜ Teknokent',
      buyerCity: 'Ankara',
      buyerCountry: 'Türkiye',
    },
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await wipe([TENANT_ID, ...WAVE]);
});

describe.skipIf(!HAS_DB)('stripe webhook tenant scope (live database)', () => {
  test('a redelivered subscription event moves the subscription, add-on and credit rows exactly once', async () => {
    const eventId = `evt-scope-sync-${RUN}`;

    const empty = await snapshot();
    expect(empty).toMatchObject({ subscriptionRows: 0, activeAddOns: 0, creditBalance: 0 });

    const first = await syncStripeSubscription(fakeSubscription(), eventId);
    const afterFirst = await snapshot();

    expect(first.status).toBe('ACTIVE');
    expect(first.creditsGranted).toBe(AI_CREDITS);
    expect(afterFirst).toMatchObject({
      subscriptionRows: 1,
      activeAddOns: 1,
      creditBalance: AI_CREDITS,
      auditRows: 1,
    });

    const second = await syncStripeSubscription(fakeSubscription(), eventId);
    const afterSecond = await snapshot();

    expect(second.status).toBe('skipped');
    expect(second.creditsGranted).toBe(0);
    // Not "roughly the same": the same numbers. A second credit grant or a
    // second add-on row is money.
    expect(afterSecond).toEqual(afterFirst);
  });

  test('a new event id does change the same rows', async () => {
    // The counterfactual. Without it, a handler that had stopped writing
    // anything at all would pass the test above.
    const before = await snapshot();

    await syncStripeSubscription(fakeSubscription(), `evt-scope-fresh-${RUN}`);
    const after = await snapshot();

    expect(after.auditRows).toBe(before.auditRows + 1);
    expect(after.subscriptionRows).toBe(1);
  });

  test('a redelivered invoice payment issues exactly one invoice', async () => {
    const eventId = `evt-scope-invoice-${RUN}`;
    const invoice = fakeInvoice(`in-scope-${RUN}`);

    const before = await snapshot();

    await logInvoicePayment(invoice, eventId);
    const afterFirst = await snapshot();
    expect(afterFirst.invoiceRows).toBe(before.invoiceRows + 1);

    await logInvoicePayment(invoice, eventId);
    const afterSecond = await snapshot();

    expect(afterSecond.invoiceRows).toBe(afterFirst.invoiceRows);
    expect(afterSecond.auditRows).toBe(afterFirst.auditRows);
    expect(afterSecond.creditBalance).toBe(before.creditBalance);
  });

  test('a redelivered cancellation ends the add-ons exactly once', async () => {
    const eventId = `evt-scope-cancel-${RUN}`;

    await handleSubscriptionCancellation(fakeSubscription(), eventId);
    const afterFirst = await snapshot();

    // The cancellation is one transaction now, so the subscription row, the
    // add-on end date and the module states land together or not at all.
    expect(afterFirst.activeAddOns).toBe(0);
    expect(afterFirst.modulesOff).toBeGreaterThan(0);
    const sub = await prisma.subscription.findUnique({ where: { tenantId: TENANT_ID } });
    expect(sub?.status).toBe('CANCELED');

    await handleSubscriptionCancellation(fakeSubscription(), eventId);
    const afterSecond = await snapshot();

    expect(afterSecond).toEqual(afterFirst);
  });

  test('ten simultaneous webhooks all complete without exhausting the connection pool', async () => {
    // The risk TASK-MTSZ0AL4QP2CT §7 named: each wrapper now holds one of the
    // pool's ten connections for the length of its transaction, where before
    // every statement borrowed and returned one. Ten at once is the pool size.
    const started = Date.now();
    const results = await Promise.allSettled(
      WAVE.map((id, i) => syncStripeSubscription(fakeSubscription(id), `evt-wave-${RUN}-${i}`))
    );
    const elapsed = Date.now() - started;

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(
      rejected.map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)))
    ).toEqual([]);
    // A pool timeout surfaces as a rejection well inside this budget; the
    // measured run is ~30 ms, so this only fires on a real stall.
    expect(elapsed).toBeLessThan(10_000);

    for (const id of WAVE) {
      const snap = await snapshot(id);
      expect(snap).toMatchObject({
        subscriptionRows: 1,
        activeAddOns: 1,
        creditBalance: AI_CREDITS,
      });
    }
  });
});
