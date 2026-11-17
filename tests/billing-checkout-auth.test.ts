import { describe, test, expect, vi, beforeEach } from 'vitest';
import { suiteHasDatabase } from './helpers/database-availability';

/**
 * TASK-MTUI9F5YBHTDC — "the payment route has no session gate".
 *
 * `POST /api/billing/checkout` resolved its tenant as
 * `session?.tenantId || 'default-tenant'`. That fallback names a tenant that
 * exists nowhere in the repo — not in the seed, not in a script, not in the
 * schema — so an anonymous POST did not read another tenant's data. What it
 * did do is worse in one specific way: it could **create a real Stripe
 * Checkout Session**. If someone paid it, the webhook would refuse the unknown
 * tenant (`lifetime-licence.ts`), answer 500, and Stripe would retry a payment
 * that can never be recorded — an unauthenticated cost surface with an
 * unbookable charge at the end of it.
 *
 * What is pinned here is therefore two things, not one:
 *   1. an anonymous POST is refused with 401, and
 *   2. the refusal costs nothing — no tier is looked up, no line is priced, no
 *      tax is computed. A gate that runs after the pricing code still queries
 *      the database on behalf of a caller who has no tenant.
 *
 * The signed-in case is asserted too, so a "passing" suite cannot mean the
 * route simply refuses everybody, and so the tenant it prices under is the
 * session's own id rather than any fallback.
 */

const { authMock, tierForTenantMock, priceLineForTenantMock, taxLineForTenantMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  tierForTenantMock: vi.fn(),
  priceLineForTenantMock: vi.fn(),
  taxLineForTenantMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/billing/tenant-tier', () => ({ tierForTenant: tierForTenantMock }));
vi.mock('@/lib/billing/checkout-tax', () => ({ taxLineForTenant: taxLineForTenantMock }));
vi.mock('@/lib/billing/storefront', async (importOriginal) => ({
  // `PlanNotAvailableError` is matched with `instanceof` in the route, so the
  // real class is kept; only the database-touching function is replaced.
  ...(await importOriginal<typeof import('@/lib/billing/storefront')>()),
  priceLineForTenant: priceLineForTenantMock,
}));

const { POST } = await import('@/app/api/billing/checkout/route');
const HAS_DB = await suiteHasDatabase('billing-checkout-auth');

const TENANT_SESSION = {
  user: { id: 'user-1', email: 'owner@example.com' },
  tenantId: 'demo-tenant',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: false,
};

/** A signed-in user whose session carries no workspace — a real state after an invite is revoked. */
const SESSION_WITHOUT_TENANT = {
  user: { id: 'user-2', email: 'orphan@example.com' },
  role: 'MEMBER',
};

function checkoutRequest(): Request {
  return new Request('http://localhost:3000/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ sku: 'plan-pro', billingCycle: 'monthly' }] }),
  });
}

beforeEach(() => {
  authMock.mockReset();
  tierForTenantMock.mockReset().mockResolvedValue({
    shopfront: { code: 'NONE', percentOff: 0 },
    effective: { code: 'NONE', percentOff: 0 },
    locked: false,
  });
  priceLineForTenantMock.mockReset().mockResolvedValue({
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
  taxLineForTenantMock.mockReset().mockResolvedValue({
    country: 'TR',
    ratePercent: 20,
    vatMinor: 1_740,
    resolved: true,
  });
});

describe('POST /api/billing/checkout', () => {
  test('refuses an anonymous checkout with 401 and prices nothing', async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(checkoutRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized', code: 'TENANT_SCOPE_REQUIRED' });
    // The fallback tenant is gone, not merely hidden behind a different status.
    expect(JSON.stringify(body)).not.toContain('default-tenant');
    // The refusal spends nothing: no tier read, no line priced, no tax computed.
    expect(tierForTenantMock).not.toHaveBeenCalled();
    expect(priceLineForTenantMock).not.toHaveBeenCalled();
    expect(taxLineForTenantMock).not.toHaveBeenCalled();
  });

  test('refuses a signed-in session that carries no tenant, for the same reason', async () => {
    authMock.mockResolvedValue(SESSION_WITHOUT_TENANT);

    const res = await POST(checkoutRequest());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'TENANT_SCOPE_REQUIRED' });
    expect(tierForTenantMock).not.toHaveBeenCalled();
  });

  // NG-180: the route reads the tenant (checkoutBlocker, withTenant) before it prices; with no database that read is a 500.
  test.skipIf(!HAS_DB)('a signed-in tenant still checks out, priced under its own tenant id', async () => {
    authMock.mockResolvedValue(TENANT_SESSION);

    const res = await POST(checkoutRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    // Stripe keys are not live in the test environment, so the route answers
    // with the amounts it computed — which is what makes this assertion
    // readable without a Stripe double.
    expect(body).toMatchObject({ demoMode: true, tenantId: 'demo-tenant', totalMinor: 8_700 });
    expect(tierForTenantMock).toHaveBeenCalledWith('demo-tenant');
    expect(priceLineForTenantMock).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'plan-pro' }),
      expect.anything(),
      'demo-tenant'
    );
  });
});
