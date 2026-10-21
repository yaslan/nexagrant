/**
 * TASK-MVCH26OXNVLKR — internal plan assignment, against the real database
 * (as pilot.test.ts: a mocked delegate cannot prove that the row
 * `getEntitlements` reads was written, or that Stripe left it alone).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';
import { prisma, withTenant } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { LiveProviderSubscriptionError } from './plan-repository';
import { assignInternalPlan, InternalPlanNoteRequiredError, listInternalPlans } from './internal-plan';
import { INTERNAL_PROVIDER, isInternalPlanSubscription, stripeSyncBlocker } from './subscription-owner';
import { PILOT_PROVIDER } from './pilot';
import { handleSubscriptionCancellation, syncStripeSubscription } from './subscription-sync';
import { requireId } from '../../../tests/helpers/teardown-guard';

const entitlements = (tenantId: string) => withTenant(tenantId, (tx) => getEntitlements(tenantId, tx));
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('stripeSyncBlocker — which source owns the row', () => {
  it('Stripe owns no row, a Stripe row, a cancelled internal row and a Stripe trial', () => {
    expect(stripeSyncBlocker(null)).toBeNull();
    expect(stripeSyncBlocker({ status: 'ACTIVE', provider: 'stripe', trialEndsAt: null })).toBeNull();
    expect(stripeSyncBlocker({ status: 'CANCELED', provider: INTERNAL_PROVIDER, trialEndsAt: null })).toBeNull();
    expect(stripeSyncBlocker({ status: 'TRIALING', provider: 'stripe', trialEndsAt: new Date() })).toBeNull();
  });

  it('an active internal plan and a pilot are protected', () => {
    expect(stripeSyncBlocker({ status: 'ACTIVE', provider: INTERNAL_PROVIDER, trialEndsAt: null })).toBe(
      'INTERNAL_PLAN_PROTECTED'
    );
    expect(stripeSyncBlocker({ status: 'TRIALING', provider: PILOT_PROVIDER, trialEndsAt: new Date() })).toBe(
      'PILOT_PROTECTED'
    );
    expect(isInternalPlanSubscription({ status: 'ACTIVE', provider: INTERNAL_PROVIDER })).toBe(true);
  });
});

import { skipOrFailInCi } from '../../../tests/helpers/live-db-role';

describe('assignInternalPlan (live DB)', () => {
  let tenantId!: string;
  let ready = false;

  beforeEach(async (ctx) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      ready = true;
    } catch {
      ready = false;
      skipOrFailInCi('assignInternalPlan (live DB)', 'Postgres is unreachable');
      ctx.skip();
      return;
    }

    const tenant = await prisma.tenant.create({
      data: { name: 'Internal Plan Test', slug: `internal-plan-${suffix()}`, country: 'TR', orgType: 'SME' },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    if (!ready || !tenantId) return;
    await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.stripeEventLog.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.subscription.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.planAssignment.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
  });

  it('Pro opens M1; Discover takes it back; both are audited with old → new and the note', async (ctx) => {
    if (!ready) ctx.skip();
    expect((await entitlements(tenantId!)).allowedModules).not.toContain('M1');

    const assigned = await assignInternalPlan(tenantId, 'pro', 'admin-1', '  M1 lock test  ');
    expect(assigned).toEqual({ outcome: 'assigned', before: 'free', after: 'pro' });
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub).toMatchObject({ planId: 'pro', status: 'ACTIVE', provider: INTERNAL_PROVIDER, providerSubId: null });
    expect((await entitlements(tenantId)).allowedModules).toContain('M1');
    expect(await prisma.planAssignment.findMany({ where: { tenantId }, select: { planId: true, note: true, assignedBy: true } }))
      .toEqual([{ planId: 'pro', note: 'M1 lock test', assignedBy: 'admin-1' }]);
    expect((await listInternalPlans()).get(tenantId)).toBe('pro');

    const revoked = await assignInternalPlan(tenantId, 'free', 'admin-1', 'done testing');
    expect(revoked).toEqual({ outcome: 'revoked', before: 'pro', after: 'free' });
    expect((await entitlements(tenantId)).allowedModules).not.toContain('M1');
    expect(await prisma.planAssignment.count({ where: { tenantId } })).toBe(0);
    expect((await listInternalPlans()).has(tenantId)).toBe(false);

    const audit = await prisma.auditEvent.findMany({
      where: { tenantId, type: { startsWith: 'plan.internal.' } },
      orderBy: { createdAt: 'asc' },
      select: { type: true, actorId: true, data: true },
    });
    expect(audit).toMatchObject([
      { type: 'plan.internal.assigned', actorId: 'admin-1', data: { before: 'free', after: 'pro', note: 'M1 lock test' } },
      { type: 'plan.internal.revoked', actorId: 'admin-1', data: { before: 'pro', after: 'free', note: 'done testing' } },
    ]);
  });

  it('moving Pro → Ultra keeps one assignment row; repeating a choice writes nothing', async (ctx) => {
    if (!ready) ctx.skip();
    await assignInternalPlan(tenantId!, 'pro', 'admin-1', 'a');
    await assignInternalPlan(tenantId!, 'ultra', 'admin-1', 'b');
    expect((await prisma.planAssignment.findMany({ where: { tenantId }, select: { planId: true } })).map((r) => r.planId))
      .toEqual(['ultra']);
    expect(await assignInternalPlan(tenantId!, 'ultra', 'admin-1', 'c')).toMatchObject({ outcome: 'unchanged' });
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'plan.internal.' } } })).toBe(2);
  });

  it('requires a note, and refuses over a live Stripe subscription or a pilot', async (ctx) => {
    if (!ready) ctx.skip();
    await expect(assignInternalPlan(tenantId!, 'pro', 'admin-1', '   ')).rejects.toBeInstanceOf(
      InternalPlanNoteRequiredError
    );

    await prisma.subscription.create({
      data: { tenantId: tenantId!, planId: 'basic', status: 'ACTIVE', provider: 'stripe', providerSubId: 'sub_internal_test' },
    });
    await expect(assignInternalPlan(tenantId!, 'ultra', 'admin-1', 'x')).rejects.toBeInstanceOf(
      LiveProviderSubscriptionError
    );
    await prisma.subscription.update({
      where: { tenantId },
      data: { planId: 'public-team', status: 'TRIALING', provider: PILOT_PROVIDER, providerSubId: null, trialEndsAt: new Date(Date.now() + 86_400_000) },
    });
    await expect(assignInternalPlan(tenantId!, 'ultra', 'admin-1', 'x')).rejects.toBeInstanceOf(
      LiveProviderSubscriptionError
    );
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'plan.internal.' } } })).toBe(0);
  });

  it('the Stripe sync and cancellation leave an internal plan alone', async (ctx) => {
    if (!ready) ctx.skip();
    await assignInternalPlan(tenantId!, 'ultra', 'admin-1', 'stripe guard');

    const fake = {
      id: 'sub_over_internal',
      status: 'active',
      customer: 'cus_over_internal',
      metadata: { tenantId },
      items: { data: [] },
    } as unknown as Stripe.Subscription;

    expect(await syncStripeSubscription(fake, `evt_internal_sync_${suffix()}`)).toMatchObject({
      status: 'skipped',
      planId: 'ultra',
      error: 'INTERNAL_PLAN_PROTECTED',
    });
    expect(await handleSubscriptionCancellation(fake, `evt_internal_cancel_${suffix()}`)).toMatchObject({
      status: 'skipped',
      planId: 'ultra',
      error: 'INTERNAL_PLAN_PROTECTED',
    });

    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({
      planId: 'ultra',
      status: 'ACTIVE',
      provider: INTERNAL_PROVIDER,
      providerSubId: null,
    });
    // Not claimed, so either event can be replayed once the internal plan is taken back.
    expect(await prisma.stripeEventLog.count({ where: { tenantId } })).toBe(0);
  });
});
