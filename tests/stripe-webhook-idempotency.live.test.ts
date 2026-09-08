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
 * The Stripe SDK is the transport, not the behaviour under test: `logInvoicePayment`
 * resolves the tenant by fetching the subscription before it reaches the guard,
 * and no network is available here. Everything below that call is production code.
 */
vi.mock('stripe', () => {
  class MockStripe {
    subscriptions = { retrieve: async () => fakeSubscription() };
    webhooks = { constructEvent: () => { throw new Error('not used'); } };
  }
  return { default: MockStripe };
});

/**
 * Live Stripe webhook idempotency — real Postgres, real Prisma, the production
 * code path (TASK-MTSY88Q6AMCGB).
 *
 * The three webhook handlers each open with a guard that is supposed to make a
 * redelivered Stripe event a no-op. It was written as
 *
 *     prisma.auditEvent.findFirst({ where: { data: { equals: { stripeEventId } } } })
 *
 * which is not "the audit row whose `stripeEventId` is this one" — on a Json
 * column `equals` compares the *whole* document, so the filter only matches a
 * row whose `data` is exactly `{"stripeEventId": "..."}` and nothing else.
 * Every row these handlers write carries more keys than that, so the guard
 * never matched and every redelivery was processed again.
 *
 * A mocked Prisma client cannot see this: it would faithfully record the filter
 * shape and answer whatever the mock was told to answer. Only Postgres decides
 * whether a Json filter matches, so this file measures it against one.
 *
 * Stripe retries a webhook for up to three days, so a redelivery is not a
 * hypothetical — and `syncStripeSubscription` grants a monthly credit
 * allowance whenever it sees an `active` subscription over a row that is not
 * ACTIVE. A stale event replayed after a cancellation therefore both
 * resurrects the subscription and grants the allowance a second time.
 */

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
const TENANT_ID = `t-idem-${RUN}`;
const PLAN_ID = `plan-idem-${RUN}`;
const PRICE_ID = `price-idem-${RUN}`;
const AI_CREDITS = 1234;

function fakeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: `sub-idem-${RUN}`,
    customer: `cus-idem-${RUN}`,
    status: 'active',
    metadata: { tenantId: TENANT_ID },
    billing_cycle_anchor: 0,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    items: {
      data: [
        {
          id: `si-idem-${RUN}`,
          quantity: 1,
          price: { id: PRICE_ID, unit_amount: 4900, currency: 'usd' },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

/** Audit rows this run wrote for one Stripe event id, counted in the database. */
async function auditRowsFor(eventId: string): Promise<number> {
  const rows = await prisma.auditEvent.findMany({ where: { tenantId: TENANT_ID } });
  return rows.filter(
    (r) => (r.data as { stripeEventId?: string } | null)?.stripeEventId === eventId
  ).length;
}

async function cleanUp(): Promise<void> {
  await prisma.auditEvent.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.creditLedger.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.addOn.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.moduleState.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.invoice.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.subscription.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  await prisma.plan.deleteMany({ where: { id: PLAN_ID } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await cleanUp();
  await prisma.plan.create({
    data: {
      id: PLAN_ID,
      name: `Idempotency probe ${RUN}`,
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
  await prisma.tenant.create({
    data: { id: TENANT_ID, name: `Idempotency probe ${RUN}`, slug: TENANT_ID, country: 'TR' },
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await cleanUp();
});

describe.skipIf(!HAS_DB)('stripe webhook idempotency (live database)', () => {
  test('a redelivered subscription event writes no second audit row', async () => {
    const eventId = `evt-sync-${RUN}`;

    const first = await syncStripeSubscription(fakeSubscription(), eventId);
    expect(first.planId).toBe(PLAN_ID);
    expect(first.status).toBe('ACTIVE');

    const second = await syncStripeSubscription(fakeSubscription(), eventId);

    expect(second.status).toBe('skipped');
    expect(await auditRowsFor(eventId)).toBe(1);
  });

  test('a stale event replayed after a cancellation grants no second allowance', async () => {
    const eventId = `evt-replay-${RUN}`;

    await syncStripeSubscription(fakeSubscription(), eventId);
    const afterFirst = await prisma.creditLedger.count({
      where: { tenantId: TENANT_ID, reason: 'monthly_grant' },
    });

    // What Stripe's retry window makes possible: the tenant cancels, and only
    // then does the earlier `active` event get redelivered.
    await prisma.subscription.update({
      where: { tenantId: TENANT_ID },
      data: { status: 'CANCELED' },
    });

    const replay = await syncStripeSubscription(fakeSubscription(), eventId);

    expect(replay.status).toBe('skipped');
    expect(replay.creditsGranted).toBe(0);
    expect(
      await prisma.creditLedger.count({
        where: { tenantId: TENANT_ID, reason: 'monthly_grant' },
      })
    ).toBe(afterFirst);
    // The cancellation stands: a replayed event must not resurrect it.
    const sub = await prisma.subscription.findUnique({ where: { tenantId: TENANT_ID } });
    expect(sub?.status).toBe('CANCELED');
    expect(await auditRowsFor(eventId)).toBe(1);
  });

  test('a redelivered cancellation event writes no second audit row', async () => {
    const eventId = `evt-cancel-${RUN}`;

    await handleSubscriptionCancellation(fakeSubscription({ status: 'canceled' }), eventId);
    const second = await handleSubscriptionCancellation(
      fakeSubscription({ status: 'canceled' }),
      eventId
    );

    expect(second.status).toBe('skipped');
    expect(await auditRowsFor(eventId)).toBe(1);
  });

  test('a redelivered invoice payment writes no second audit row', async () => {
    const eventId = `evt-invoice-${RUN}`;
    const invoice = {
      id: `in-idem-${RUN}`,
      subscription: `sub-idem-${RUN}`,
      amount_paid: 4900,
      currency: 'usd',
      hosted_invoice_url: 'https://stripe.test/invoice',
      lines: { data: [{ description: 'Fabrika probe' }] },
    } as unknown as Stripe.Invoice;

    await logInvoicePayment(invoice, eventId);
    await logInvoicePayment(invoice, eventId);

    expect(await auditRowsFor(eventId)).toBe(1);
  });
});
