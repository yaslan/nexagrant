import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Role } from '@prisma/client';
import { NextRequest } from 'next/server';

// crw-fb İNCELEME-74 — billing portal against MY isolated DB (crwfb74-pg :5474). Only auth() and Stripe are doubles.
const m = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_crwfb74_double_not_a_key';
  return { session: null as Record<string, unknown> | null, portalCreate: vi.fn() };
});
vi.mock('stripe', () => ({ default: class { billingPortal = { sessions: { create: m.portalCreate } }; } }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => m.session) }));

import { prisma } from '@/lib/db';
const portal = await import('@/app/api/billing/portal/route');

const T: Record<string, string> = {};
const U: Record<string, string> = {};
const as = (u: string | null, t: string | null, role: Role) => {
  m.session = u ? { user: { id: u, email: 'x@crwfb74.test' }, tenantId: t, role, workspaceIds: [], isPlatformAdmin: false } : null;
};
const call = async (stripeImpl?: (a: { customer: string }) => Promise<unknown>) => {
  m.portalCreate.mockReset().mockImplementation(stripeImpl ?? (async (a: { customer: string }) => ({ url: `https://billing.stripe.test/${a.customer}` })));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await portal.POST(new NextRequest('http://localhost:3000/api/billing/portal', { method: 'POST' }));
  const logged = log.mock.calls.map((c) => c.map(String).join(' ')).join(' | ');
  log.mockRestore();
  const raw = await res.text();
  const customer = (m.portalCreate.mock.calls[0]?.[0] as { customer?: string } | undefined)?.customer ?? null;
  return { status: res.status, raw, customer, stripe: m.portalCreate.mock.calls.length, logged };
};
const line = (s: string) => console.log(`[i74] ${s}`);

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes(':5474/')) throw new Error('refusing: isolated crwfb74-pg only');
  const stamp = Date.now();
  for (const t of ['A', 'X', 'N', 'S']) T[t] = (await prisma.tenant.create({ data: { name: `crwfb74 ${t}`, slug: `crwfb74-${t.toLowerCase()}-${stamp}`, country: 'TR' } })).id;
  await prisma.subscription.create({ data: { tenantId: T.A!, planId: 'plan-pro', providerCustomerId: 'cus_A74' } });
  await prisma.subscription.create({ data: { tenantId: T.X!, planId: 'plan-pro', providerCustomerId: 'cus_X74' } });
  await prisma.subscription.create({ data: { tenantId: T.S!, planId: 'plan-pro', providerCustomerId: 'cus_S74' } });
  for (const u of ['ownerAX', 'adminAownerX', 'stranger', 'ownerN', 'ownerS']) U[u] = (await prisma.user.create({ data: { email: `${u.toLowerCase()}-${stamp}@crwfb74.test`, name: u } })).id;
  await prisma.membership.createMany({ data: [
    { tenantId: T.A!, userId: U.ownerAX!, role: 'TENANT_OWNER' },
    { tenantId: T.X!, userId: U.ownerAX!, role: 'TENANT_OWNER' },
    { tenantId: T.A!, userId: U.adminAownerX!, role: 'TENANT_ADMIN' },
    { tenantId: T.X!, userId: U.adminAownerX!, role: 'TENANT_OWNER' },
    { tenantId: T.X!, userId: U.stranger!, role: 'TENANT_OWNER' },
    { tenantId: T.N!, userId: U.ownerN!, role: 'TENANT_OWNER' },
    { tenantId: T.S!, userId: U.ownerS!, role: 'TENANT_OWNER' },
  ] });
});
afterAll(async () => {
  await prisma.membership.deleteMany({ where: { tenantId: { in: Object.values(T) } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: Object.values(T) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(U) } } });
  await prisma.tenant.deleteMany({ where: { id: { in: Object.values(T) } } });
});

describe('İNCELEME-74 billing portal (live)', () => {
  test('P1 owner of A and X: session A → cus_A, session X → cus_X, 5 alternations', async () => {
    for (let i = 0; i < 5; i++) {
      as(U.ownerAX!, T.A!, 'TENANT_OWNER'); const a = await call();
      as(U.ownerAX!, T.X!, 'TENANT_OWNER'); const x = await call();
      line(`P1#${i} session=A → ${a.status} ${a.customer}; session=X → ${x.status} ${x.customer}`);
      expect([a.status, a.customer, x.status, x.customer]).toEqual([200, 'cus_A74', 200, 'cus_X74']);
    }
  });
  test('P2 ADMIN of A who owns X, session=A → 403, Stripe 0 (manage_billing is owner-only)', async () => {
    as(U.adminAownerX!, T.A!, 'TENANT_ADMIN'); const r = await call();
    line(`P2 → ${r.status} ${r.raw} stripe=${r.stripe}`);
    expect([r.status, r.stripe]).toEqual([403, 0]);
  });
  test('P3 session names A, user has NO membership in A (owns X) → 403; JWT role claim ignored', async () => {
    as(U.stranger!, T.A!, 'TENANT_OWNER'); const r = await call();
    line(`P3 → ${r.status} ${r.raw} stripe=${r.stripe}`);
    expect([r.status, r.stripe]).toEqual([403, 0]);
  });
  test('P4 no session / session without tenant → 401, Stripe 0', async () => {
    as(null, null, 'MEMBER'); const a = await call();
    as(U.ownerAX!, null, 'TENANT_OWNER'); const b = await call();
    line(`P4 none → ${a.status} ${a.raw}; tenantless → ${b.status} ${b.raw}`);
    expect([a.status, b.status, a.stripe + b.stripe]).toEqual([401, 401, 0]);
  });
  test('P5 no Stripe customer → 500 fixed sentence; tenant id only in the log', async () => {
    as(U.ownerN!, T.N!, 'TENANT_OWNER'); const r = await call();
    line(`P5 → ${r.status} ${r.raw} bodyHasTenant=${r.raw.includes(T.N!)} logHasTenant=${r.logged.includes(T.N!)}`);
    expect(r.status).toBe(500);
    expect(JSON.parse(r.raw)).toEqual({ error: 'Failed to create portal session' });
    expect(r.raw.includes(T.N!)).toBe(false);
    expect(r.logged.includes(T.N!)).toBe(true);
  });
  test('P6 Stripe throws with its own text (key fragment, customer id) → 500 fixed sentence, nothing of it in the body', async () => {
    as(U.ownerS!, T.S!, 'TENANT_OWNER');
    const r = await call(async () => { throw new Error('Invalid API Key provided: sk_test_crwf****74 for customer cus_S74'); });
    line(`P6 → ${r.status} ${r.raw} bodyHasStripeText=${/sk_test|cus_S74|Invalid API/.test(r.raw)} logHasStripeText=${r.logged.includes('Invalid API Key')}`);
    expect(r.status).toBe(500);
    expect(JSON.parse(r.raw)).toEqual({ error: 'Failed to create portal session' });
  });
});
