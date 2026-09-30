import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Role } from '@prisma/client';
import { NextRequest } from 'next/server';

/**
 * İNCELEME-63 (se-fb, TASK-MUNRAS3B9WBY3) — Y-3 re-test against the REAL isolated DB
 * (sefb-i63-pg :55463). Only auth() and the Stripe SDK are doubles; requireTenantApi,
 * withSystemScope (portal membership lookup), pilot read, tier and pricing are real.
 * NOT for the repo — review evidence only.
 */
const m = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_i63_review_double_not_a_key';
  return { session: null as Record<string, unknown> | null, checkoutCreate: vi.fn(), portalCreate: vi.fn(), customersCreate: vi.fn() };
});
vi.mock('stripe', () => ({
  default: class StripeDouble {
    checkout = { sessions: { create: m.checkoutCreate } };
    billingPortal = { sessions: { create: m.portalCreate } };
    customers = { create: m.customersCreate, retrieve: vi.fn(), search: vi.fn(async () => ({ data: [] })), list: vi.fn(async () => ({ data: [] })) };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => m.session) }));

import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
const checkout = await import('@/app/api/billing/checkout/route');
const portal = await import('@/app/api/billing/portal/route');

const ROLES: Role[] = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'];
const ids: Record<string, string> = {};
const users: Partial<Record<Role, string>> = {};
const as = (role: Role, userId = users[role]!, tenantId = ids.tA) => {
  m.session = { user: { id: userId, email: `${role}@i63.test` }, tenantId, role, workspaceIds: [], isPlatformAdmin: false };
};
const call = async (which: 'checkout' | 'portal') => {
  m.checkoutCreate.mockReset().mockResolvedValue({ id: 'cs_i63', url: 'https://checkout.stripe.test/i63' });
  m.portalCreate.mockReset().mockResolvedValue({ url: 'https://billing.stripe.test/i63' });
  m.customersCreate.mockReset().mockResolvedValue({ id: 'cus_i63' });
  const res =
    which === 'checkout'
      ? await checkout.POST(new Request('http://localhost:3000/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ sku: 'plan-pro', billingCycle: 'monthly' }] }) }))
      : await portal.POST(new NextRequest('http://localhost:3000/api/billing/portal', { method: 'POST' }));
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const stripeCalls = m.checkoutCreate.mock.calls.length + m.portalCreate.mock.calls.length + m.customersCreate.mock.calls.length;
  return { status: res.status, code: body.code ?? null, err: String(body.error ?? '').slice(0, 60), stripeCalls };
};

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith(':55463/fabrika')) throw new Error('refusing: isolated sefb-i63-pg only');
  for (const t of ['A', 'X']) {
    ids[`t${t}`] = (await prisma.tenant.create({ data: { name: `i63 billing ${t}`, slug: `i63-bill-${t.toLowerCase()}-${Date.now()}`, country: 'TR' } })).id;
  }
  for (const role of ROLES) {
    const u = await prisma.user.create({ data: { email: `bill-${role.toLowerCase()}-${Date.now()}@i63.test`, name: `i63 ${role}` } });
    users[role] = u.id;
    await prisma.membership.create({ data: { tenantId: ids.tA, userId: u.id, role } });
  }
  // Cross case: MEMBER of A also owns tenant X.
  await prisma.membership.create({ data: { tenantId: ids.tX, userId: users.MEMBER!, role: 'TENANT_OWNER' } });
});
afterAll(() => console.log('I63_BILLING_FIXTURE', JSON.stringify({ ids, users })));

describe('İNCELEME-63 Y-3 billing, 6 roles × 2 routes, live DB', () => {
  test('refused roles: 403 FORBIDDEN_ROLE / 403, zero Stripe calls; owner passes the gate', async () => {
    const rows: string[] = [];
    for (const role of ROLES) {
      const allowed = can(role, 'manage_billing');
      // Portal lookup is by user, not session tenant: use a user with no other tenant (MEMBER owns X → separate test).
      as(role);
      const c = await call('checkout');
      const p = role === 'MEMBER' ? null : await call('portal');
      rows.push(`${role.padEnd(16)} can(manage_billing)=${String(allowed).padEnd(5)} | checkout → ${c.status} ${c.code ?? ''} stripe=${c.stripeCalls} | portal → ${p ? `${p.status} ${p.err} stripe=${p.stripeCalls}` : '(ayrı test)'}`);
      if (allowed) {
        expect(c.code).not.toBe('FORBIDDEN_ROLE');
        expect(p!.status).not.toBe(403);
      } else {
        expect(c).toMatchObject({ status: 403, code: 'FORBIDDEN_ROLE', stripeCalls: 0 });
        if (p) expect(p).toMatchObject({ status: 403, stripeCalls: 0 });
      }
    }
    console.log(['Y-3 matrix'].concat(rows).join('\n'));
  });

  test('cross case: MEMBER of A who owns X — checkout in A refused; portal opens X (tenant-agnostic lookup)', async () => {
    as('MEMBER');
    const c = await call('checkout');
    const p = await call('portal');
    const portalTenant = (m.portalCreate.mock.calls[0]?.[0] as { customer?: string } | undefined)?.customer ?? null;
    console.log(`CROSS MEMBER(A)+OWNER(X): checkout(A) → ${c.status} ${c.code} stripe=${c.stripeCalls}; portal → ${p.status} stripe=${p.stripeCalls} customer=${portalTenant}`);
    expect(c).toMatchObject({ status: 403, code: 'FORBIDDEN_ROLE', stripeCalls: 0 });
  });
});
