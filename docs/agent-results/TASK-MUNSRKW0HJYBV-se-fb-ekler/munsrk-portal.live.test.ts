import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { Role } from '@prisma/client';
import { NextRequest } from 'next/server';

/**
 * TASK-MUNSRKW0HJYBV (se-fb) — İNCELEME-63 Ö-A/Ö-B re-test against the REAL isolated DB
 * (sefb-munsrk-pg :55464). Only auth() and the Stripe SDK are doubles; requireTenantApi,
 * withSystemScope (membership read), withTenant (subscription read) are real.
 * NOT for the repo — evidence only (docs/agent-results/TASK-MUNSRKW0HJYBV-se-fb-ekler/).
 */
const m = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_munsrk_evidence_double_not_a_key';
  return { session: null as Record<string, unknown> | null, portalCreate: vi.fn() };
});
vi.mock('stripe', () => ({
  default: class StripeDouble {
    billingPortal = { sessions: { create: m.portalCreate } };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => m.session) }));

import { prisma } from '@/lib/db';
const portal = await import('@/app/api/billing/portal/route');

const ids: Record<string, string> = {};
const users: Record<string, string> = {};
const as = (userId: string, tenantId: string, role: Role) => {
  m.session = { user: { id: userId, email: 'x@munsrk.test' }, tenantId, role, workspaceIds: [], isPlatformAdmin: false };
};
const callPortal = async () => {
  m.portalCreate.mockReset().mockImplementation(async (a: { customer: string }) => ({ url: `https://billing.stripe.test/${a.customer}` }));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await portal.POST(new NextRequest('http://localhost:3000/api/billing/portal', { method: 'POST' }));
  const logged = log.mock.calls.map((c) => String(c[1])).join(' | ');
  log.mockRestore();
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const customer = (m.portalCreate.mock.calls[0]?.[0] as { customer?: string } | undefined)?.customer ?? null;
  return { status: res.status, body, customer, stripeCalls: m.portalCreate.mock.calls.length, logged };
};

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith(':55464/fabrika')) throw new Error('refusing: isolated sefb-munsrk-pg only');
  const stamp = Date.now();
  for (const t of ['A', 'X', 'N']) {
    ids[t] = (await prisma.tenant.create({ data: { name: `munsrk ${t}`, slug: `munsrk-${t.toLowerCase()}-${stamp}`, country: 'TR' } })).id;
  }
  // A and X have a Stripe customer; N (no subscription) is for the 500 case.
  await prisma.subscription.create({ data: { tenantId: ids.A!, planId: 'plan-pro', providerCustomerId: 'cus_A' } });
  await prisma.subscription.create({ data: { tenantId: ids.X!, planId: 'plan-pro', providerCustomerId: 'cus_X' } });
  for (const u of ['memberAownerX', 'ownerBoth', 'ownerN']) {
    users[u] = (await prisma.user.create({ data: { email: `${u.toLowerCase()}-${stamp}@munsrk.test`, name: u } })).id;
  }
  await prisma.membership.createMany({
    data: [
      // Cross case (İNCELEME-63 §5): MEMBER in A, OWNER in X.
      { tenantId: ids.X!, userId: users.memberAownerX!, role: 'TENANT_OWNER' },
      { tenantId: ids.A!, userId: users.memberAownerX!, role: 'MEMBER' },
      // Owner of both: which portal opens must follow the session.
      { tenantId: ids.X!, userId: users.ownerBoth!, role: 'TENANT_OWNER' },
      { tenantId: ids.A!, userId: users.ownerBoth!, role: 'TENANT_OWNER' },
      { tenantId: ids.N!, userId: users.ownerN!, role: 'TENANT_OWNER' },
    ],
  });
});

describe('billing portal follows the session tenant (Ö-A) and hides internals (Ö-B), live DB', () => {
  test('cross case: MEMBER of A who owns X → 403, Stripe never called', async () => {
    as(users.memberAownerX!, ids.A!, 'MEMBER');
    const r = await callPortal();
    console.log(`CROSS MEMBER(A)+OWNER(X) session=A → ${r.status} ${JSON.stringify(r.body)} stripe=${r.stripeCalls} customer=${r.customer}`);
    expect(r).toMatchObject({ status: 403, stripeCalls: 0, customer: null });
  });

  test('same user with session in X (where they own) → the portal of X', async () => {
    as(users.memberAownerX!, ids.X!, 'TENANT_OWNER');
    const r = await callPortal();
    console.log(`CROSS same user session=X → ${r.status} customer=${r.customer}`);
    expect(r).toMatchObject({ status: 200, customer: 'cus_X' });
  });

  test('owner of A and X: session A → cus_A, session X → cus_X', async () => {
    as(users.ownerBoth!, ids.A!, 'TENANT_OWNER');
    const a = await callPortal();
    as(users.ownerBoth!, ids.X!, 'TENANT_OWNER');
    const x = await callPortal();
    console.log(`OWNER-BOTH session=A → ${a.status} customer=${a.customer}; session=X → ${x.status} customer=${x.customer}`);
    expect(a).toMatchObject({ status: 200, customer: 'cus_A' });
    expect(x).toMatchObject({ status: 200, customer: 'cus_X' });
  });

  test('Ö-B: no Stripe customer → 500 with a fixed sentence; the tenant id stays in the log', async () => {
    as(users.ownerN!, ids.N!, 'TENANT_OWNER');
    const r = await callPortal();
    console.log(`O-B session=N → ${r.status} body=${JSON.stringify(r.body)} bodyHasTenantId=${JSON.stringify(r.body).includes(ids.N!)} logHasTenantId=${r.logged.includes(ids.N!)}`);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Failed to create portal session' });
    expect(r.logged).toContain(ids.N!);
  });
});
