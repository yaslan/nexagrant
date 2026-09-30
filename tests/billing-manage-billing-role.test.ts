import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Role } from '@prisma/client';
import { NextRequest } from 'next/server';

/**
 * TASK-MUNQAXELV83HO (İNCELEME-59 Y-3) — only a role that carries
 * `manage_billing` (src/lib/rbac.ts: the owner) may open a Stripe checkout or
 * the billing portal for the tenant.
 *
 * There is no Stripe key in CI, so Stripe itself is replaced: the route is
 * loaded with a key that looks live and a `stripe` module whose calls are
 * spies. A refused role must get its 403 before any of them — and before the
 * pilot read and the pricing — while the owner reaches Stripe, so a green run
 * cannot mean the route now refuses everybody. The expected answer per role is
 * read from `can()`, not restated.
 */

const m = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit_only_not_a_real_key';
  return {
    auth: vi.fn(),
    checkoutCreate: vi.fn(),
    portalCreate: vi.fn(),
    getPilotState: vi.fn(),
    tierForTenant: vi.fn(),
    priceLineForTenant: vi.fn(),
    taxLineForTenant: vi.fn(),
    withSystemScope: vi.fn(),
    withTenant: vi.fn(),
  };
});

vi.mock('stripe', () => ({
  default: class StripeDouble {
    checkout = { sessions: { create: m.checkoutCreate } };
    billingPortal = { sessions: { create: m.portalCreate } };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/billing/pilot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/pilot')>()),
  getPilotState: m.getPilotState,
}));
vi.mock('@/lib/billing/tenant-tier', () => ({ tierForTenant: m.tierForTenant }));
vi.mock('@/lib/billing/checkout-tax', () => ({ taxLineForTenant: m.taxLineForTenant }));
vi.mock('@/lib/billing/storefront', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/storefront')>()),
  priceLineForTenant: m.priceLineForTenant,
}));
vi.mock('@/lib/system-scope', () => ({ withSystemScope: m.withSystemScope }));
vi.mock('@/lib/db', () => ({ withTenant: m.withTenant, prisma: {} }));

const { can } = await import('@/lib/rbac');
const checkout = await import('@/app/api/billing/checkout/route');
const portal = await import('@/app/api/billing/portal/route');

const ROLES: Role[] = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'];

const sessionFor = (role: Role) => ({
  user: { id: 'user-1', email: 'u@example.test' },
  tenantId: 'tenant-A',
  role,
  workspaceIds: [],
  isPlatformAdmin: false,
});

const checkoutRequest = () =>
  new Request('http://localhost:3000/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ sku: 'plan-pro', billingCycle: 'monthly' }] }),
  });

const portalRequest = () =>
  new NextRequest('http://localhost:3000/api/billing/portal', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  m.getPilotState.mockResolvedValue({ kind: 'none' });
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
  m.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.test/p_1' });
  m.withTenant.mockImplementation(async (_t: string, fn: (tx: unknown) => unknown) =>
    fn({ subscription: { findUnique: async () => ({ providerCustomerId: 'cus_1' }) } }),
  );
});

describe('POST /api/billing/checkout needs manage_billing', () => {
  for (const role of ROLES) {
    const allowed = can(role, 'manage_billing');
    test(`${role}: ${allowed ? 'reaches Stripe' : '403 before the pilot read, the pricing and Stripe'}`, async () => {
      m.auth.mockResolvedValue(sessionFor(role));

      const res = await checkout.POST(checkoutRequest());

      if (allowed) {
        expect(res.status).toBe(200);
        expect(m.checkoutCreate).toHaveBeenCalledTimes(1);
        return;
      }
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
      expect(m.getPilotState).not.toHaveBeenCalled();
      expect(m.tierForTenant).not.toHaveBeenCalled();
      expect(m.priceLineForTenant).not.toHaveBeenCalled();
      expect(m.taxLineForTenant).not.toHaveBeenCalled();
      expect(m.checkoutCreate).not.toHaveBeenCalled();
    });
  }

  test('only the owner carries manage_billing today', () => {
    expect(ROLES.filter((r) => can(r, 'manage_billing'))).toEqual(['TENANT_OWNER']);
  });
});

describe('POST /api/billing/portal needs manage_billing', () => {
  /** The membership read, run against one row of the given role: honours the route's `where`. */
  const membershipOf = (role: Role) => {
    m.withSystemScope.mockImplementation(async (_p: string, _l: string, fn: (tx: unknown) => unknown) =>
      fn({
        membership: {
          findFirst: async ({ where }: { where: { userId: string; role: { in: Role[] } } }) =>
            where.userId === 'user-1' && where.role.in.includes(role)
              ? { tenantId: 'tenant-A', role, tenant: { id: 'tenant-A' } }
              : null,
        },
      }),
    );
  };

  for (const role of ROLES) {
    const allowed = can(role, 'manage_billing');
    test(`${role}: ${allowed ? 'gets a portal session' : '403 before Stripe'}`, async () => {
      m.auth.mockResolvedValue(sessionFor(role));
      membershipOf(role);

      const res = await portal.POST(portalRequest());

      if (allowed) {
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ url: 'https://billing.stripe.test/p_1' });
        expect(m.portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }));
        return;
      }
      expect(res.status).toBe(403);
      expect(m.withTenant).not.toHaveBeenCalled();
      expect(m.portalCreate).not.toHaveBeenCalled();
    });
  }
});
