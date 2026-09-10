import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * TASK-MTVRACMDFRGKV — the Stripe webhook's tenant-scoped queries go through
 * `withTenant`, and nothing inside the wrapper reaches the bare client.
 *
 * Two separate guarantees, both structural, both measured here rather than
 * asserted in prose:
 *
 * 1. **The wrapper is used.** The `prisma` this file mocks has no
 *    `subscription`, `addOn`, `creditLedger` or `moduleState` delegate at all.
 *    A regression that writes one of those on the singleton therefore dies on
 *    the call itself — it cannot pass quietly the way a spy-count assertion can.
 *
 * 2. **The wrapper never waits on a second connection.** `withTenant` opens a
 *    transaction, which holds one connection from a pool of ten (pg's default,
 *    `createDbClient` sets no `max`). A call to the bare singleton from inside
 *    that callback asks for a *second* connection while still holding the
 *    first; at a burst of ten webhooks that is a deadlock, not a slow query.
 *    The `prisma` mock below is a Proxy that throws the moment it is touched
 *    while a wrapper is open, so the rule is enforced instead of remembered.
 *
 * The third thing pinned here is what the card forbade changing: the audit row
 * that makes a Stripe redelivery a no-op is still written on the bare client,
 * *after* the wrapper has closed. If it ever moves inside the transaction, the
 * `auditWrittenWhileWrapperOpen` assertion fails — because that would change
 * what a crash mid-handler leaves behind, which is idempotency behaviour.
 */

const state = vi.hoisted(() => ({
  /** True while a `withTenant` callback is executing. */
  inWrapper: false,
  /** Tenant ids `withTenant` was entered with, in order. */
  entered: [] as string[],
  /** Bare-singleton delegates touched while a wrapper was open. */
  leaks: [] as string[],
  /** True if the audit row was written from inside a wrapper. */
  auditWrittenWhileWrapperOpen: false,
}));

vi.mock('@/lib/db', () => {
  const auditCreate = vi.fn(async () => {
    if (state.inWrapper) state.auditWrittenWhileWrapperOpen = true;
    return { id: 'audit_1' };
  });

  // Only the platform tables live here. The four tenant-scoped models are
  // deliberately absent: reaching for one is a TypeError, not a silent pass.
  const delegates: Record<string, unknown> = {
    plan: {
      findFirst: vi.fn(async () => ({ id: 'plan_pro' })),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'free'
          ? { id: 'free', modules: ['M1'], aiCreditsMonthly: 0 }
          : { id: where.id, modules: ['M1', 'M6'], aiCreditsMonthly: 500 }
      ),
    },
    planVersion: { findFirst: vi.fn(async () => null) },
    addOnCatalog: { findMany: vi.fn(async () => []) },
    moduleCatalog: { findMany: vi.fn(async () => [{ id: 'M1' }, { id: 'M6' }]) },
    tenant: { findUnique: vi.fn(async () => ({ id: 'tenant_1', locale: 'tr' })) },
    auditEvent: { findFirst: vi.fn(async () => null), create: auditCreate },
  };

  const prisma = new Proxy(delegates, {
    get(target, prop: string) {
      if (state.inWrapper) state.leaks.push(prop);
      return target[prop];
    },
  });

  const tx = {
    subscription: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    addOn: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    creditLedger: { create: vi.fn(async () => ({})) },
    moduleState: { upsert: vi.fn(async () => ({})) },
  };

  const withTenant = vi.fn(
    async (tenantId: string, callback: (client: typeof tx) => Promise<unknown>) => {
      state.entered.push(tenantId);
      state.inWrapper = true;
      try {
        return await callback(tx);
      } finally {
        state.inWrapper = false;
      }
    }
  );

  return { prisma, withTenant, __tx: tx };
});

vi.mock('stripe', () => ({
  default: class {
    subscriptions = { retrieve: vi.fn() };
  },
}));

import type Stripe from 'stripe';
import {
  syncStripeSubscription,
  handleSubscriptionCancellation,
} from './subscription-sync';
import * as db from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */
const tx = (db as any).__tx;
const withTenant = (db as any).withTenant;
const prismaDelegates = (db as any).prisma;

const TENANT = 'tenant_1';

function stripeSubscription(over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    metadata: { tenantId: TENANT },
    billing_cycle_anchor: 0,
    current_period_end: 1_800_000_000,
    items: {
      data: [{ id: 'si_1', quantity: 1, price: { id: 'price_1', unit_amount: 4900, currency: 'usd' } }],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.inWrapper = false;
  state.entered = [];
  state.leaks = [];
  state.auditWrittenWhileWrapperOpen = false;
  // `vi.clearAllMocks` clears calls, not implementations, so every stub a test
  // steers has to be steered back here or it leaks into the next one.
  prismaDelegates.auditEvent.findFirst.mockResolvedValue(null);
  prismaDelegates.plan.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === 'free'
      ? { id: 'free', modules: ['M1'], aiCreditsMonthly: 0 }
      : { id: where.id, modules: ['M1', 'M6'], aiCreditsMonthly: 500 }
  );
  tx.subscription.findUnique.mockResolvedValue(null);
  tx.addOn.findMany.mockResolvedValue([]);
  tx.addOn.findFirst.mockResolvedValue(null);
  prismaDelegates.planVersion.findFirst.mockResolvedValue(null);
  prismaDelegates.moduleCatalog.findMany.mockResolvedValue([{ id: 'M1' }, { id: 'M6' }]);
});

describe('syncStripeSubscription — tenant scope', () => {
  it('writes the subscription, the credit grant and the add-ons through withTenant', async () => {
    const result = await syncStripeSubscription(stripeSubscription(), 'evt_1');

    expect(state.entered).toEqual([TENANT, TENANT]);
    expect(tx.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(tx.creditLedger.create).toHaveBeenCalledTimes(1);
    expect(tx.creditLedger.create.mock.calls[0][0].data).toMatchObject({
      tenantId: TENANT,
      delta: 500,
      reason: 'monthly_grant',
    });
    expect(result.creditsGranted).toBe(500);
  });

  it('never reaches the bare client while a wrapper is open', async () => {
    await syncStripeSubscription(stripeSubscription(), 'evt_2');

    // A second connection asked for while the first is held is how a burst of
    // webhooks deadlocks against a ten-connection pool.
    expect(state.leaks).toEqual([]);
  });

  it('still writes the idempotency audit row outside the transaction', async () => {
    await syncStripeSubscription(stripeSubscription(), 'evt_3');

    expect(prismaDelegates.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(state.auditWrittenWhileWrapperOpen).toBe(false);
  });

  it('turns off the dropped modules through the wrapper on a downgrade', async () => {
    // The tenant was on a plan carrying M6; the incoming plan does not.
    tx.subscription.findUnique.mockResolvedValue({
      tenantId: TENANT,
      planId: 'plan_old',
      status: 'ACTIVE',
    });
    prismaDelegates.plan.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'plan_old'
        ? { id: 'plan_old', modules: ['M1', 'M6'], aiCreditsMonthly: 500 }
        : { id: where.id, modules: ['M1'], aiCreditsMonthly: 500 }
    );

    await syncStripeSubscription(stripeSubscription(), 'evt_4');

    expect(state.leaks).toEqual([]);
    expect(tx.moduleState.upsert).toHaveBeenCalledTimes(1);
    expect(tx.moduleState.upsert.mock.calls[0][0].where).toEqual({
      tenantId_moduleId: { tenantId: TENANT, moduleId: 'M6' },
    });
  });

  it('does nothing at all when the event was already processed', async () => {
    prismaDelegates.auditEvent.findFirst.mockResolvedValue({ tenantId: TENANT });

    const result = await syncStripeSubscription(stripeSubscription(), 'evt_5');

    expect(result.status).toBe('skipped');
    expect(withTenant).not.toHaveBeenCalled();
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
  });
});

describe('handleSubscriptionCancellation — tenant scope', () => {
  it('cancels, ends the add-ons and turns the modules off in one wrapper', async () => {
    await handleSubscriptionCancellation(
      stripeSubscription({ status: 'canceled' }),
      'evt_c1'
    );

    // One wrapper, not three: a cancellation that lands half-applied leaves a
    // tenant paying nothing with its add-ons still active.
    expect(state.entered).toEqual([TENANT]);
    expect(tx.subscription.update).toHaveBeenCalledTimes(1);
    expect(tx.addOn.updateMany).toHaveBeenCalledTimes(1);
    // M1 is on the free plan and stays; M6 is not and is turned off.
    expect(tx.moduleState.upsert).toHaveBeenCalledTimes(1);
    expect(tx.moduleState.upsert.mock.calls[0][0].where).toEqual({
      tenantId_moduleId: { tenantId: TENANT, moduleId: 'M6' },
    });
    expect(state.leaks).toEqual([]);
    expect(state.auditWrittenWhileWrapperOpen).toBe(false);
  });

  it('does nothing at all when the cancellation was already processed', async () => {
    prismaDelegates.auditEvent.findFirst.mockResolvedValue({ tenantId: TENANT });

    const result = await handleSubscriptionCancellation(
      stripeSubscription({ status: 'canceled' }),
      'evt_c2'
    );

    expect(result.status).toBe('skipped');
    expect(withTenant).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });
});
