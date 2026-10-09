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
 * The third thing pinned here is idempotency, and it is the assertion that
 * changed direction in TASK-MTVSBEO7VX6Y4 / ADR-0003. It used to read "the
 * audit row is still written on the bare client, after the wrapper closed",
 * because the card that wrote it was forbidden from touching idempotency. That
 * arrangement is exactly the defect this file now pins the fix for: the row
 * carried the idempotency key, `AuditEvent` takes the `tenant_or_shared`
 * policy, and outside a tenant transaction that policy refuses a row that has
 * a tenant. Under `fabrika_app` the money committed and the key did not.
 *
 * So the assertion is inverted rather than relaxed: nothing that decides
 * whether a redelivery is a no-op may be written outside the wrapper, and the
 * key is claimed as the FIRST statement inside it. `auditWrittenOnBareClient`
 * and `keyWrittenOutsideWrapper` both have to stay false, and
 * `claimWasFirstInWrapper` has to stay true.
 */

const state = vi.hoisted(() => ({
  /** True while a `withTenant` callback is executing. */
  inWrapper: false,
  /** Tenant ids `withTenant` was entered with, in order. */
  entered: [] as string[],
  /** Bare-singleton delegates touched while a wrapper was open. */
  leaks: [] as string[],
  /** True if an audit row was written on the bare client (it must not be). */
  auditWrittenOnBareClient: false,
  /** Statements seen inside the current wrapper, in order. */
  wrapperStatements: [] as string[],
}));

vi.mock('@/lib/db', () => {
  // On the bare client an audit create is a defect now, not a step: outside a
  // tenant transaction the `tenant_or_shared` policy refuses a row that has a
  // tenant, so any handler still doing this writes the money and loses the row.
  const auditCreate = vi.fn(async () => {
    state.auditWrittenOnBareClient = true;
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

  /** Records the order statements reach the transaction, so "first" is measurable. */
  const step = <T>(name: string, impl: () => T) => vi.fn(async () => {
    state.wrapperStatements.push(name);
    return impl();
  });

  const tx = {
    // The pilot advisory lock (`lockPilotRow`), taken after the claim.
    $executeRaw: step('$executeRaw', () => 1),
    stripeEventLog: {
      findUnique: step('stripeEventLog.findUnique', () => null as { id: string } | null),
      create: step('stripeEventLog.create', () => ({ id: 'sel_1' })),
    },
    subscription: {
      findUnique: step('subscription.findUnique', () => null as { tenantId: string; planId: string; status: string } | null),
      upsert: step('subscription.upsert', () => ({})),
      update: step('subscription.update', () => ({})),
    },
    addOn: {
      findMany: step('addOn.findMany', () => [] as Array<{ sku: string; quantity: number; id: string }>),
      findFirst: step('addOn.findFirst', () => null as { id: string; quantity: number } | null),
      create: step('addOn.create', () => ({})),
      update: step('addOn.update', () => ({})),
      updateMany: step('addOn.updateMany', () => ({ count: 1 })),
    },
    creditLedger: { create: step('creditLedger.create', () => ({})) },
    moduleState: { upsert: step('moduleState.upsert', () => ({})) },
    auditEvent: { create: step('auditEvent.create', () => ({ id: 'audit_tx_1' })) },
  };

  const withTenant = vi.fn(
    async (tenantId: string, callback: (client: typeof tx) => Promise<unknown>) => {
      state.entered.push(tenantId);
      state.inWrapper = true;
      state.wrapperStatements = [];
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
  state.auditWrittenOnBareClient = false;
  state.wrapperStatements = [];
  // `vi.clearAllMocks` clears calls, not implementations, so every stub a test
  // steers has to be steered back here or it leaks into the next one.
  prismaDelegates.auditEvent.findFirst.mockResolvedValue(null);
  // The fast-path guard read. `stripeEventLog.create` is deliberately NOT
  // re-stubbed here: it keeps the recording implementation, which is what makes
  // "the claim is the first statement in the wrapper" measurable.
  tx.stripeEventLog.findUnique.mockResolvedValue(null);
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

    // Three wrappers now, not two: the fast-path guard read is tenant-scoped
    // as well, because the key it reads lives in a tenant-scoped table.
    expect(state.entered).toEqual([TENANT, TENANT, TENANT]);
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

  it('claims the idempotency key as the first statement of the money transaction', async () => {
    await syncStripeSubscription(stripeSubscription(), 'evt_3');

    // ADR-0003. Not "somewhere inside": first. A claim written after the money
    // is a claim a crash can lose, which is the state this card removed.
    expect(state.wrapperStatements[0]).toBe('stripeEventLog.create');
    expect(tx.stripeEventLog.create).toHaveBeenCalledTimes(1);
    expect(tx.stripeEventLog.create.mock.calls[0][0].data).toEqual({
      tenantId: TENANT,
      stripeEventId: 'evt_3',
      handler: 'subscription.sync',
    });
  });

  it('writes the audit row inside the transaction and never on the bare client', async () => {
    await syncStripeSubscription(stripeSubscription(), 'evt_3b');

    // The inverse of what this file asserted before ADR-0003. `AuditEvent`
    // carries `tenant_or_shared`; a tenant row written outside a tenant
    // transaction is refused, and that refusal came after the money.
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(state.auditWrittenOnBareClient).toBe(false);
    expect(prismaDelegates.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rolls the money back when a concurrent delivery claimed the event first', async () => {
    // Postgres refusing the second of two simultaneous deliveries on the UNIQUE
    // index — the race a read-then-write guard cannot settle.
    tx.stripeEventLog.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    const result = await syncStripeSubscription(stripeSubscription(), 'evt_3c');

    expect(result.status).toBe('skipped');
    expect(result.creditsGranted).toBe(0);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
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
    tx.stripeEventLog.findUnique.mockResolvedValue({ id: 'sel_old' });

    const result = await syncStripeSubscription(stripeSubscription(), 'evt_5');

    expect(result.status).toBe('skipped');
    expect(result.tenantId).toBe(TENANT);
    // One wrapper — the guard read itself — and nothing else. The guard cannot
    // be read outside a tenant scope any more, so "no wrapper at all" is no
    // longer the right shape for this assertion.
    expect(state.entered).toEqual([TENANT]);
    expect(tx.stripeEventLog.create).not.toHaveBeenCalled();
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
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
    // Two: the tenant-scoped guard read, then the one write wrapper.
    expect(state.entered).toEqual([TENANT, TENANT]);
    expect(state.wrapperStatements[0]).toBe('stripeEventLog.create');
    expect(tx.subscription.update).toHaveBeenCalledTimes(1);
    expect(tx.addOn.updateMany).toHaveBeenCalledTimes(1);
    // M1 is on the free plan and stays; M6 is not and is turned off.
    expect(tx.moduleState.upsert).toHaveBeenCalledTimes(1);
    expect(tx.moduleState.upsert.mock.calls[0][0].where).toEqual({
      tenantId_moduleId: { tenantId: TENANT, moduleId: 'M6' },
    });
    expect(state.leaks).toEqual([]);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(state.auditWrittenOnBareClient).toBe(false);
  });

  it('does nothing at all when the cancellation was already processed', async () => {
    tx.stripeEventLog.findUnique.mockResolvedValue({ id: 'sel_old' });

    const result = await handleSubscriptionCancellation(
      stripeSubscription({ status: 'canceled' }),
      'evt_c2'
    );

    expect(result.status).toBe('skipped');
    expect(state.entered).toEqual([TENANT]);
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.stripeEventLog.create).not.toHaveBeenCalled();
  });

  it('leaves the subscription alone when a concurrent delivery won the claim', async () => {
    tx.stripeEventLog.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    const result = await handleSubscriptionCancellation(
      stripeSubscription({ status: 'canceled' }),
      'evt_c3'
    );

    expect(result.status).toBe('skipped');
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.addOn.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
