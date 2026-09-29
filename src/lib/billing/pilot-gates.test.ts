/**
 * TASK-MUMABL78X5JLX — the edges the free pilot runs through, against the real
 * database with only the session faked:
 *
 *   - granting is platform-admin only (`grantPilotAction`);
 *   - an expired pilot makes every server action (`requireTenantAction`) and
 *     every write route (`requireTenantApi({ write: true })`) refuse, while
 *     reads still pass;
 *   - checkout is closed to a pilot tenant, running or expired;
 *   - the session-less M11 partner portal (magic token) is refused the same way.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { hashSecretToken } from '@/lib/secret-token';

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prisma } from '@/lib/db';
import { requireTenantAction, requireTenantApi } from '@/lib/tenant';
import { upsertPublicSectorPlans } from './public-sector-plans';
import { PilotExpiredError, grantPilot } from './pilot';
import { grantPilotAction } from '@/app/[locale]/admin/billing/plans/actions';
import { POST as checkout } from '@/app/api/billing/checkout/route';
import { addBudgetLineByToken } from '@/modules/m11/server/actions';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DAY = 86_400_000;

function memberSession(tenantId: string, extra: Record<string, unknown> = {}) {
  return { user: { id: 'pilot-gate-user', email: 'pilot-gate@example.test' }, tenantId, role: 'TENANT_OWNER', ...extra };
}

describe('pilot gates', () => {
  let tenantId: string;

  beforeAll(async () => {
    await upsertPublicSectorPlans(prisma);
  });

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Pilot Gate Test', slug: `pilot-gate-${suffix()}`, country: 'TR', orgType: 'MUNICIPALITY' },
    });
    tenantId = tenant.id;
    session.current = null;
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('only a platform admin can grant a pilot', async () => {
    session.current = memberSession(tenantId); // tenant owner, not platform admin
    const refused = await grantPilotAction(tenantId, false);
    expect(refused).toMatchObject({ ok: false, code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(await prisma.subscription.count({ where: { tenantId } })).toBe(0);

    session.current = { user: { id: 'pilot-gate-admin' }, isPlatformAdmin: true };
    const granted = await grantPilotAction(tenantId, false);
    expect(granted).toMatchObject({ ok: true, data: { outcome: 'granted' } });
    const again = await grantPilotAction(tenantId, false);
    expect(again).toMatchObject({ ok: true, data: { outcome: 'unchanged' } });
  });

  it('an expired pilot refuses server-action writes and write routes; reads still pass', async () => {
    await grantPilot(tenantId, 'admin-1', { now: new Date(Date.now() - 91 * DAY) });
    session.current = memberSession(tenantId);

    await expect(requireTenantAction()).rejects.toBeInstanceOf(PilotExpiredError);
    await expect(requireTenantAction({ readOnly: true })).resolves.toMatchObject({ tenantId });

    const write = await requireTenantApi({ write: true });
    expect(write.ok).toBe(false);
    if (!write.ok) {
      expect(write.response.status).toBe(403);
      expect(await write.response.json()).toMatchObject({ code: 'PILOT_EXPIRED' });
    }
    expect((await requireTenantApi()).ok).toBe(true);
  });

  it('a running pilot writes normally', async () => {
    await grantPilot(tenantId, 'admin-1');
    session.current = memberSession(tenantId);
    await expect(requireTenantAction()).resolves.toMatchObject({ tenantId });
    expect((await requireTenantApi({ write: true })).ok).toBe(true);
  });

  it('checkout answers 403 PILOT_CHECKOUT_CLOSED to a pilot tenant', async () => {
    await grantPilot(tenantId, 'admin-1');
    session.current = memberSession(tenantId);
    const res = await checkout(
      new Request('http://localhost/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ planId: 'ultra', billingCycle: 'yearly' }] }),
      }) as never
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'PILOT_CHECKOUT_CLOSED' });
  });

  it('the partner portal token cannot write into an expired pilot; a running one can', async () => {
    const workspace = await prisma.workspace.create({ data: { tenantId, name: 'Pilot WS', slug: `pilot-ws-${suffix()}` } });
    const opp = await prisma.opportunity.create({ data: { tenantId, workspaceId: workspace.id, title: 'Pilot opp' } });
    const magicToken = `pilot-gate-token-${suffix()}`;
    const part = await prisma.applicationPart.create({
      data: { tenantId, opportunityId: opp.id, part: 'PART_A', content: {}, magicTokenHash: hashSecretToken(magicToken) },
    });
    const budgetOf = async () =>
      ((await prisma.applicationPart.findUniqueOrThrow({ where: { id: part.id } })).content as { budget?: unknown[] })
        .budget ?? [];

    // Session-less: the token is the only credential.
    session.current = null;

    await grantPilot(tenantId, 'admin-1', { now: new Date(Date.now() - 91 * DAY) });
    await expect(addBudgetLineByToken(magicToken, 'Probe Partner', 3)).resolves.toEqual({ success: false });
    expect(await budgetOf()).toEqual([]);

    await grantPilot(tenantId, 'admin-1', { extend: true });
    await expect(addBudgetLineByToken(magicToken, 'Probe Partner', 3)).resolves.toMatchObject({ success: true });
    expect(await budgetOf()).toHaveLength(1);
  });
});
