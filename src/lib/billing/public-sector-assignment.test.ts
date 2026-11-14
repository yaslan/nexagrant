import { suiteHasDatabase } from '../../../tests/helpers/database-availability';
/**
 * FB KAMU B11 (TASK-MULRSG6T55LO0) — assigning a public-sector package, against
 * the real database (the same reason as plan-admin.test.ts: a mocked delegate
 * cannot prove the row `getEntitlements` reads was written).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { prisma, withTenant } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { grantsFor } from './catalog';
import {
  CONTRACT_PROVIDER,
  LiveProviderSubscriptionError,
  assignPlanToTenant,
  unassignPlanFromTenant,
} from './plan-repository';
import { upsertPublicSectorPlans } from './public-sector-plans';
import { SeatLimitReachedError, assertSeatAvailable, readSeatUsage } from './seat-limit';
import { storefrontPlans } from './storefront';
import { presentIds, requireId } from '../../../tests/helpers/teardown-guard';
import { PUBLIC_SECTOR_PLANS_LOCK, withTestDbLock } from '../../../tests/helpers/test-db-lock';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const HAS_DB = await suiteHasDatabase('public-sector-assignment');

describe.skipIf(!HAS_DB)('public-sector package assignment', () => {
  let tenantId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    await withTestDbLock(process.env.DATABASE_URL!, PUBLIC_SECTOR_PLANS_LOCK, () => upsertPublicSectorPlans(prisma));
  });

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Kamu B11 Test', slug: `kamu-b11-${suffix()}`, country: 'TR', orgType: 'MUNICIPALITY' },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.invitation.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.membership.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.subscription.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.planAssignment.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
    await prisma.user.deleteMany({ where: { id: { in: presentIds(userIds.splice(0)) } } });
  });

  it('seeding twice leaves the same rows (idempotent)', async () =>
    // Other files seed the same rows in parallel (TASK-MUN7B4ZIEBJML).
    withTestDbLock(process.env.DATABASE_URL!, PUBLIC_SECTOR_PLANS_LOCK, async () => {
      await upsertPublicSectorPlans(prisma);
      const ids = ['public-starter', 'public-team', 'public-institution'];
      const versions = await prisma.planVersion.findMany({
        where: { planId: { in: ids } },
        include: { _count: { select: { features: true } } },
        orderBy: { yearlyCents: 'asc' },
      });
      expect(versions.map((v: { planId: string }) => v.planId)).toEqual(ids);
      expect(versions.map((v: { yearlyCents: number }) => v.yearlyCents)).toEqual([9_000_000, 24_000_000, 48_000_000]);
      expect(versions.every((v: { currency: string; status: string }) => v.currency === 'TRY' && v.status === 'published')).toBe(true);
      expect(versions.map((v: { _count: { features: number } }) => v._count.features)).toEqual([3, 4, 4]);
      const plans = await prisma.plan.findMany({ where: { id: { in: ids } }, select: { visibility: true } });
      expect(plans.map((p: { visibility: string }) => p.visibility)).toEqual(['private', 'private', 'private']);
    }));

  it('assigning public-team puts the tenant on it: pro modules, 6 seats, contract provider', async () => {
    const before = await withTenant(tenantId, (tx) => getEntitlements(tenantId, tx));
    expect(before.allowedModules).not.toContain('M4');

    await assignPlanToTenant('public-team', tenantId, 'admin-1', 'İlkadım pilot sözleşmesi');

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub).toMatchObject({
      planId: 'public-team',
      status: 'ACTIVE',
      billingInterval: 'year',
      provider: CONTRACT_PROVIDER,
      planVersionId: 'pv_public-team_1',
    });

    const after = await withTenant(tenantId, (tx) => getEntitlements(tenantId, tx));
    expect(after.source).toBe('plan-version');
    expect(after.seats).toBe(6);
    expect([...after.allowedModules].sort()).toEqual([...grantsFor('pro')!.moduleIds].sort());
    expect(after.allowedModules).not.toContain('M7');

    const event = await prisma.auditEvent.findFirst({ where: { tenantId, type: 'plan.assigned' } });
    expect((event?.data as Record<string, unknown>).contract).toBe(true);
  });

  it('never offers the assigned package as a checkout plan', async () => {
    await assignPlanToTenant('public-team', tenantId, 'admin-1', null);
    const visible = await storefrontPlans(tenantId);
    expect(visible.map((p) => p.planId)).not.toContain('public-team');
  });

  it('refuses to overwrite a live Stripe subscription', async () => {
    await prisma.subscription.create({
      data: { tenantId, planId: 'pro', status: 'ACTIVE', provider: 'stripe', providerSubId: 'sub_test_b11' },
    });
    await expect(assignPlanToTenant('public-team', tenantId, 'admin-1', null)).rejects.toBeInstanceOf(
      LiveProviderSubscriptionError
    );
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub?.planId).toBe('pro');
    expect(await prisma.planAssignment.count({ where: { tenantId } })).toBe(0);
  });

  it('unassigning cancels the contract subscription and drops the tenant to the fallback', async () => {
    await assignPlanToTenant('public-team', tenantId, 'admin-1', null);
    await unassignPlanFromTenant('public-team', tenantId, 'admin-1');
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub?.status).toBe('CANCELED');
    const ent = await withTenant(tenantId, (tx) => getEntitlements(tenantId, tx));
    expect(ent.seats).toBe(grantsFor('free')!.seats);
  });

  it('enforces the seat limit: public-starter allows 2 seats (members + pending invitations)', async () => {
    await assignPlanToTenant('public-starter', tenantId, 'admin-1', null);
    const user = await prisma.user.create({ data: { email: `b11-owner-${suffix()}@example.test` } });
    userIds.push(user.id);
    await prisma.membership.create({ data: { tenantId, userId: user.id, role: 'TENANT_OWNER', workspaceIds: [] } });

    const expires = new Date(Date.now() + 86_400_000);
    await withTenant(tenantId, async (tx) => {
      // Seat 2 of 2 is free: the first invitation goes through.
      await assertSeatAvailable(tx, tenantId, 'first@example.test');
      await tx.invitation.create({
        data: { email: 'first@example.test', tenantId, tokenHash: `b11-${suffix()}`, role: 'MEMBER', expires },
      });
    });

    await withTenant(tenantId, async (tx) => {
      expect(await readSeatUsage(tx, tenantId, 'second@example.test')).toEqual({
        limit: 2,
        members: 1,
        pendingInvitations: 1,
      });
      // A third person is refused …
      await expect(assertSeatAvailable(tx, tenantId, 'second@example.test')).rejects.toBeInstanceOf(
        SeatLimitReachedError
      );
      // … but re-sending the pending invitation takes no new seat.
      await expect(assertSeatAvailable(tx, tenantId, 'first@example.test')).resolves.toMatchObject({
        pendingInvitations: 0,
      });
    });
  });
});
