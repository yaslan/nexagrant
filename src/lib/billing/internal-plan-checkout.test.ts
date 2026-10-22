import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MVCH26OXNVLKR (FO-59, review B1) — checkout is closed while the tenant
 * is on an internal plan. The Stripe sync leaves such a row alone
 * (`INTERNAL_PLAN_PROTECTED`) and nothing replays the skipped event, so a
 * session opened here would be a payment recorded nowhere. The answer must
 * come before Stripe is called; a pilot and an ordinary tenant behave as before.
 *
 * Stripe is a spy behind a key that looks live; the tenant's `Subscription` row
 * is the only thing each case changes, judged by the real `checkoutBlocker`
 * (subscription-owner.ts).
 */

const m = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit_only_not_a_real_key';
  return {
    auth: vi.fn(),
    checkoutCreate: vi.fn(),
    tierForTenant: vi.fn(),
    priceLineForTenant: vi.fn(),
    taxLineForTenant: vi.fn(),
    withTenant: vi.fn(),
    subscription: null as Record<string, unknown> | null,
  };
});

vi.mock('stripe', () => ({
  default: class StripeDouble {
    checkout = { sessions: { create: m.checkoutCreate } };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/billing/tenant-tier', () => ({ tierForTenant: m.tierForTenant }));
vi.mock('@/lib/billing/checkout-tax', () => ({ taxLineForTenant: m.taxLineForTenant }));
vi.mock('@/lib/billing/storefront', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/storefront')>()),
  priceLineForTenant: m.priceLineForTenant,
}));
vi.mock('@/lib/db', () => ({ withTenant: m.withTenant, prisma: {} }));

const checkout = await import('@/app/api/billing/checkout/route');

const request = () =>
  new Request('http://localhost:3000/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ sku: 'plan-pro', billingCycle: 'monthly' }] }),
  });

const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  m.subscription = null;
  m.auth.mockResolvedValue({
    user: { id: 'user-1', email: 'u@example.test' },
    tenantId: 'tenant-A',
    role: 'TENANT_OWNER',
    workspaceIds: [],
    isPlatformAdmin: false,
  });
  m.withTenant.mockImplementation(async (_t: string, fn: (tx: unknown) => unknown) =>
    fn({ subscription: { findUnique: async () => m.subscription } })
  );
  m.tierForTenant.mockResolvedValue({
    shopfront: { code: 'NONE', percentOff: 0 },
    effective: { code: 'NONE', percentOff: 0 },
    locked: false,
  });
  m.priceLineForTenant.mockResolvedValue({
    sku: 'plan-pro',
    name: 'Pro',
    kind: 'plan',
    billingCycle: 'monthly',
    quantity: 1,
    currency: 'USD',
    amountMinor: 8_700,
    listAmountMinor: 8_700,
    totalMinor: 8_700,
    percentOff: 0,
    campaignCode: 'NONE',
    recurringInterval: 'month',
  });
  m.taxLineForTenant.mockResolvedValue({ country: 'TR', ratePercent: 20, vatMinor: 1_740, resolved: true });
  m.checkoutCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' });
});

describe('POST /api/billing/checkout and the internal plan', () => {
  test('an active internal plan: 403 INTERNAL_PLAN_CHECKOUT_CLOSED, no pricing, no Stripe session', async () => {
    m.subscription = { planId: 'pro', status: 'ACTIVE', provider: 'internal', trialEndsAt: null };
    const res = await checkout.POST(request());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'INTERNAL_PLAN_CHECKOUT_CLOSED' });
    expect(m.tierForTenant).not.toHaveBeenCalled();
    expect(m.priceLineForTenant).not.toHaveBeenCalled();
    expect(m.checkoutCreate).not.toHaveBeenCalled();
  });

  test('an internal plan taken back (CANCELED) opens checkout again', async () => {
    m.subscription = { planId: 'pro', status: 'CANCELED', provider: 'internal', trialEndsAt: null };
    const res = await checkout.POST(request());
    expect(res.status).toBe(200);
    expect(m.checkoutCreate).toHaveBeenCalledTimes(1);
  });

  test('a pilot tenant still gets PILOT_CHECKOUT_CLOSED', async () => {
    m.subscription = {
      planId: 'public-team',
      status: 'TRIALING',
      provider: 'pilot',
      trialEndsAt: new Date(Date.now() + 30 * DAY),
    };
    const res = await checkout.POST(request());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'PILOT_CHECKOUT_CLOSED' });
    expect(m.checkoutCreate).not.toHaveBeenCalled();
  });

  test.each([
    ['no subscription', null],
    ['a Stripe subscription', { planId: 'basic', status: 'ACTIVE', provider: 'stripe', trialEndsAt: null }],
  ])('%s: reaches Stripe as before', async (_label, row) => {
    m.subscription = row;
    const res = await checkout.POST(request());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ url: 'https://checkout.stripe.test/cs_test_1' });
    expect(m.checkoutCreate).toHaveBeenCalledTimes(1);
  });
});
