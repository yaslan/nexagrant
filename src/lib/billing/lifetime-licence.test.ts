import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';
import { lifetimeScarcity, recordLifetimeLicence, isLifetimeCheckout, checkoutSkus } from './lifetime-licence';
import { LIFETIME_LICENCE_CAP } from './catalog';
import { prisma } from '@/lib/db';

/**
 * The one fake client, parked in a hoisted box so the scope helpers below hand it
 * to their callbacks BY REFERENCE. Not `await import('@/lib/db')` inside the
 * helper: a dynamic import of a mocked module re-runs this factory and mints a
 * fresh set of `vi.fn()`s, so an assertion on `.mock.calls` would watch a
 * different object than the code under test just called (TASK-MTVTPVTEBCF5Z).
 */
const dbBox = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('@/lib/db', () => {
  const mod = {
  prisma: {
    tenant: { findUnique: vi.fn() },
    lifetimeLicence: { findFirst: vi.fn(), create: vi.fn() },
  },
  };
  dbBox.client = mod.prisma;
  return mod;
});

/**
 * The cross-tenant path hands its callback the same fake client `prisma`
 * resolves to, exactly as the `withTenant` mocks in this suite do — so the
 * assertions below keep watching the one `vi.fn()` after the code under test
 * moved its query onto `withSystemScope` (TASK-MTVTPVTEBCF5Z). Resolved lazily
 * because `vi.mock` is hoisted above the fixture consts.
 */
vi.mock('@/lib/system-scope', () => ({
  withSystemScope: async <T,>(_purpose: string, _context: string, cb: (tx: never) => Promise<T> | T) =>
    cb(dbBox.client as never),
}));

const mockPrisma = prisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn> };
  lifetimeLicence: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

/** A completed one-time lifetime checkout, shaped the way our own /api/billing/checkout creates it. */
function lifetimeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_lifetime_1',
    object: 'checkout.session',
    amount_total: 128_800,
    currency: 'usd',
    created: 1_760_000_000,
    client_reference_id: 'demo-tenant',
    payment_status: 'paid',
    subscription: null,
    metadata: {
      tenantId: 'demo-tenant',
      skus: 'lifetime-ultra',
      couponCode: 'OMURBOYU20',
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe('lifetimeScarcity', () => {
  it('claims no number at all when the count is unavailable', () => {
    // The bug being fixed is an invented figure; an unreadable count must not
    // quietly become "0 owners", which is just as much a claim.
    expect(lifetimeScarcity(null)).toEqual({ kind: 'unknown', cap: LIFETIME_LICENCE_CAP });
    expect(lifetimeScarcity(undefined)).toEqual({ kind: 'unknown', cap: LIFETIME_LICENCE_CAP });
    expect(lifetimeScarcity(Number.NaN)).toEqual({ kind: 'unknown', cap: LIFETIME_LICENCE_CAP });
    expect(lifetimeScarcity(-1)).toEqual({ kind: 'unknown', cap: LIFETIME_LICENCE_CAP });
  });

  it('reports an honest zero, and the next licence is #1', () => {
    expect(lifetimeScarcity(0, 20)).toEqual({ kind: 'none', owners: 0, next: 1, cap: 20 });
  });

  it('reports the real count and the real next number', () => {
    expect(lifetimeScarcity(1, 20)).toEqual({ kind: 'available', owners: 1, next: 2, cap: 20 });
    expect(lifetimeScarcity(5, 20)).toEqual({ kind: 'available', owners: 5, next: 6, cap: 20 });
    expect(lifetimeScarcity(19, 20)).toEqual({ kind: 'available', owners: 19, next: 20, cap: 20 });
  });

  it('stops promising a next licence once the run is full', () => {
    expect(lifetimeScarcity(20, 20)).toEqual({ kind: 'sold-out', owners: 20, cap: 20 });
  });

  it('is still sold out if more were sold than advertised', () => {
    expect(lifetimeScarcity(21, 20)).toEqual({ kind: 'sold-out', owners: 21, cap: 20 });
  });

  it('treats a nonsense cap as unknown rather than as sold out', () => {
    expect(lifetimeScarcity(3, 0)).toEqual({ kind: 'unknown', cap: LIFETIME_LICENCE_CAP });
  });

  it('defaults to the catalogue cap', () => {
    expect(lifetimeScarcity(LIFETIME_LICENCE_CAP).kind).toBe('sold-out');
    expect(lifetimeScarcity(LIFETIME_LICENCE_CAP - 1).kind).toBe('available');
  });
});

describe('isLifetimeCheckout', () => {
  it('recognises the one-time lifetime session', () => {
    expect(isLifetimeCheckout(lifetimeSession())).toBe(true);
  });

  it('ignores a subscription session even when the metadata mentions the sku', () => {
    // That session belongs to syncStripeSubscription; recording it here too
    // would put a subscriber in the lifetime owner count.
    expect(isLifetimeCheckout(lifetimeSession({ subscription: 'sub_123' } as Partial<Stripe.Checkout.Session>))).toBe(false);
  });

  it('ignores a one-time session for something else', () => {
    expect(
      isLifetimeCheckout(
        lifetimeSession({ metadata: { tenantId: 'demo-tenant', skus: 'addon_credits_250' } })
      )
    ).toBe(false);
  });

  it('reads a multi-line sku list', () => {
    expect(checkoutSkus({ metadata: { skus: 'plan-pro, lifetime-ultra' } })).toEqual([
      'plan-pro',
      'lifetime-ultra',
    ]);
    expect(checkoutSkus({ metadata: null })).toEqual([]);
  });
});

describe('recordLifetimeLicence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'demo-tenant' });
  });

  it('records the first licence as #1 with what was actually charged', async () => {
    mockPrisma.lifetimeLicence.findFirst.mockResolvedValue(null);
    mockPrisma.lifetimeLicence.create.mockResolvedValue({ id: 'lic_1', seq: 1 });

    const result = await recordLifetimeLicence(lifetimeSession(), 'evt_1');

    expect(result).toMatchObject({ status: 'recorded', seq: 1, tenantId: 'demo-tenant' });
    expect(mockPrisma.lifetimeLicence.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.lifetimeLicence.create.mock.calls[0]?.[0].data).toMatchObject({
      tenantId: 'demo-tenant',
      seq: 1,
      sku: 'lifetime-ultra',
      amountMinor: 128_800,
      currency: 'USD',
      providerEventId: 'evt_1',
      providerSessionId: 'cs_test_lifetime_1',
    });
  });

  it('numbers the next licence after the highest one on record', async () => {
    mockPrisma.lifetimeLicence.findFirst
      .mockResolvedValueOnce(null) // idempotency pre-check
      .mockResolvedValueOnce({ seq: 7 }); // highest seq
    mockPrisma.lifetimeLicence.create.mockResolvedValue({ id: 'lic_8', seq: 8 });

    const result = await recordLifetimeLicence(lifetimeSession(), 'evt_2');

    expect(result.seq).toBe(8);
    expect(mockPrisma.lifetimeLicence.create.mock.calls[0]?.[0].data.seq).toBe(8);
  });

  it('writes nothing the second time the same event arrives', async () => {
    // Stripe redelivers; the count must not move.
    mockPrisma.lifetimeLicence.findFirst.mockResolvedValue({
      id: 'lic_1',
      seq: 1,
      tenantId: 'demo-tenant',
    });

    const result = await recordLifetimeLicence(lifetimeSession(), 'evt_1');

    expect(result).toEqual({ status: 'duplicate', tenantId: 'demo-tenant', seq: 1, licenceId: 'lic_1' });
    expect(mockPrisma.lifetimeLicence.create).not.toHaveBeenCalled();
  });

  it('writes nothing when the same session arrives under a new event id', async () => {
    mockPrisma.lifetimeLicence.findFirst.mockResolvedValue({
      id: 'lic_1',
      seq: 1,
      tenantId: 'demo-tenant',
    });

    const result = await recordLifetimeLicence(lifetimeSession(), 'evt_redelivered');

    expect(result.status).toBe('duplicate');
    expect(mockPrisma.lifetimeLicence.create).not.toHaveBeenCalled();
    const where = mockPrisma.lifetimeLicence.findFirst.mock.calls[0]?.[0].where;
    expect(where.OR).toEqual([
      { providerEventId: 'evt_redelivered' },
      { providerSessionId: 'cs_test_lifetime_1' },
    ]);
  });

  it('survives two deliveries racing past the pre-check', async () => {
    // The unique indexes, not the pre-check, are what guarantee one row.
    mockPrisma.lifetimeLicence.findFirst
      .mockResolvedValueOnce(null) // pre-check: nothing yet
      .mockResolvedValueOnce(null) // highest seq
      .mockResolvedValueOnce({ id: 'lic_1', seq: 1, tenantId: 'demo-tenant' }); // after the clash
    mockPrisma.lifetimeLicence.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    const result = await recordLifetimeLicence(lifetimeSession(), 'evt_race');

    expect(result).toMatchObject({ status: 'duplicate', seq: 1 });
    expect(mockPrisma.lifetimeLicence.create).toHaveBeenCalledTimes(1);
  });

  it('does not record a session whose payment has not settled', async () => {
    const result = await recordLifetimeLicence(
      lifetimeSession({ payment_status: 'unpaid' } as Partial<Stripe.Checkout.Session>),
      'evt_unpaid'
    );

    expect(result).toEqual({ status: 'unpaid' });
    expect(mockPrisma.lifetimeLicence.create).not.toHaveBeenCalled();
  });

  it('leaves a subscription checkout alone', async () => {
    const result = await recordLifetimeLicence(
      lifetimeSession({ subscription: 'sub_123' } as Partial<Stripe.Checkout.Session>),
      'evt_sub'
    );

    expect(result).toEqual({ status: 'not-lifetime' });
    expect(mockPrisma.lifetimeLicence.create).not.toHaveBeenCalled();
  });

  it('refuses to guess a tenant rather than recording the sale against the wrong one', async () => {
    await expect(
      recordLifetimeLicence(
        lifetimeSession({ metadata: { skus: 'lifetime-ultra' }, client_reference_id: null }),
        'evt_no_tenant'
      )
    ).rejects.toThrow(/no tenant/i);
    expect(mockPrisma.lifetimeLicence.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown tenant instead of failing on a foreign key later', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);

    await expect(recordLifetimeLicence(lifetimeSession(), 'evt_ghost')).rejects.toThrow(/unknown tenant/i);
    expect(mockPrisma.lifetimeLicence.create).not.toHaveBeenCalled();
  });
});
