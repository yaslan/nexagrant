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
 * subscription read and the pricing — while the owner reaches Stripe, so a green run
 * cannot mean the route now refuses everybody. The expected answer per role is
 * read from `can()`, not restated.
 */

const m = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit_only_not_a_real_key';
  return {
    auth: vi.fn(),
    checkoutCreate: vi.fn(),
    portalCreate: vi.fn(),
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
    test(`${role}: ${allowed ? 'reaches Stripe' : '403 before the subscription read, the pricing and Stripe'}`, async () => {
      m.auth.mockResolvedValue(sessionFor(role));

      const res = await checkout.POST(checkoutRequest());

      if (allowed) {
        expect(res.status).toBe(200);
        expect(m.checkoutCreate).toHaveBeenCalledTimes(1);
        return;
      }
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
      expect(m.withTenant).not.toHaveBeenCalled();
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
  type Where = { userId: string; tenantId?: string; role: { in: Role[] } };
  /** The membership read, run against the given rows: honours the route's `where`, first match wins. */
  const membershipsOf = (rows: { tenantId: string; role: Role }[]) => {
    m.withSystemScope.mockImplementation(async (_p: string, _l: string, fn: (tx: unknown) => unknown) =>
      fn({
        membership: {
          findFirst: async ({ where }: { where: Where }) => {
            const row = rows.find(
              (r) =>
                where.userId === 'user-1' &&
                (where.tenantId === undefined || where.tenantId === r.tenantId) &&
                where.role.in.includes(r.role),
            );
            return row ? { ...row, tenant: { id: row.tenantId } } : null;
          },
        },
      }),
    );
  };
  const membershipOf = (role: Role) => membershipsOf([{ tenantId: 'tenant-A', role }]);

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

  // TASK-MUNSRKW0HJYBV (İNCELEME-63 Ö-A): the portal opens the tenant the
  // session is in. It used to take whichever tenant the user owns, so a MEMBER
  // of A who owns X got X's portal from inside A — and a user owning two
  // tenants got one of them at the database's whim.
  test('opens the session tenant only: a MEMBER of A who owns X gets 403, not X', async () => {
    m.auth.mockResolvedValue(sessionFor('MEMBER'));
    membershipsOf([
      { tenantId: 'tenant-X', role: 'TENANT_OWNER' },
      { tenantId: 'tenant-A', role: 'MEMBER' },
    ]);

    const res = await portal.POST(portalRequest());

    expect(res.status).toBe(403);
    expect(m.withTenant).not.toHaveBeenCalled();
    expect(m.portalCreate).not.toHaveBeenCalled();
  });

  test('the owner of two tenants gets the portal of the one the session is in', async () => {
    m.auth.mockResolvedValue(sessionFor('TENANT_OWNER'));
    membershipsOf([
      { tenantId: 'tenant-X', role: 'TENANT_OWNER' },
      { tenantId: 'tenant-A', role: 'TENANT_OWNER' },
    ]);

    const res = await portal.POST(portalRequest());

    expect(res.status).toBe(200);
    expect(m.withTenant).toHaveBeenCalledWith('tenant-A', expect.any(Function));
  });

  test('a session without a tenant gets 401 before any read', async () => {
    m.auth.mockResolvedValue({ user: { id: 'user-1' } });
    membershipOf('TENANT_OWNER');

    const res = await portal.POST(portalRequest());

    expect(res.status).toBe(401);
    expect(m.withSystemScope).not.toHaveBeenCalled();
    expect(m.portalCreate).not.toHaveBeenCalled();
  });

  // İNCELEME-63 Ö-B: a failure answers with a fixed sentence; the tenant id and
  // Stripe's own text stay in the server log.
  test('a failure answers 500 without the internal message', async () => {
    m.auth.mockResolvedValue(sessionFor('TENANT_OWNER'));
    membershipOf('TENANT_OWNER');
    m.withTenant.mockImplementation(async (_t: string, fn: (tx: unknown) => unknown) =>
      fn({ subscription: { findUnique: async () => null } }),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await portal.POST(portalRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Failed to create portal session' });
    expect(JSON.stringify(body)).not.toContain('tenant-A');
    expect(String(log.mock.calls[0]?.[1])).toContain('tenant-A');
    log.mockRestore();
  });
});
