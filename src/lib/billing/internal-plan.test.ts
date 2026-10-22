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
import { checkoutBlocker, INTERNAL_PROVIDER, isInternalPlanSubscription, stripeSyncBlocker } from './subscription-owner';
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

  it('checkout is closed exactly where Stripe may not write', () => {
    const rows = [
      null,
      { status: 'ACTIVE', provider: 'stripe', trialEndsAt: null },
      { status: 'CANCELED', provider: INTERNAL_PROVIDER, trialEndsAt: null },
      { status: 'ACTIVE', provider: INTERNAL_PROVIDER, trialEndsAt: null },
      { status: 'TRIALING', provider: PILOT_PROVIDER, trialEndsAt: new Date(Date.now() - 86_400_000) },
    ];
    expect(rows.map(checkoutBlocker)).toEqual([
      null,
      null,
      null,
      'INTERNAL_PLAN_CHECKOUT_CLOSED',
      'PILOT_CHECKOUT_CLOSED',
    ]);
    for (const row of rows) expect(checkoutBlocker(row) === null).toBe(stripeSyncBlocker(row) === null);
  });
});

describe('assignInternalPlan (live DB)', () => {
  let tenantId: string;

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Internal Plan Test', slug: `internal-plan-${suffix()}`, country: 'TR', orgType: 'SME' },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.stripeEventLog.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.subscription.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.planAssignment.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
  });

  it('Pro opens M1; Discover takes it back; both are audited with old → new and the note', async () => {
    expect((await entitlements(tenantId)).allowedModules).not.toContain('M1');

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

  it('moving Pro → Ultra keeps one assignment row; repeating a choice writes nothing', async () => {
    await assignInternalPlan(tenantId, 'pro', 'admin-1', 'a');
    await assignInternalPlan(tenantId, 'ultra', 'admin-1', 'b');
    expect((await prisma.planAssignment.findMany({ where: { tenantId }, select: { planId: true } })).map((r) => r.planId))
      .toEqual(['ultra']);
    expect(await assignInternalPlan(tenantId, 'ultra', 'admin-1', 'c')).toMatchObject({ outcome: 'unchanged' });
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'plan.internal.' } } })).toBe(2);
  });

  it('requires a note, and refuses over a live Stripe subscription or a pilot', async () => {
    await expect(assignInternalPlan(tenantId, 'pro', 'admin-1', '   ')).rejects.toBeInstanceOf(
      InternalPlanNoteRequiredError
    );

    await prisma.subscription.create({
      data: { tenantId, planId: 'basic', status: 'ACTIVE', provider: 'stripe', providerSubId: 'sub_internal_test' },
    });
    await expect(assignInternalPlan(tenantId, 'ultra', 'admin-1', 'x')).rejects.toBeInstanceOf(
      LiveProviderSubscriptionError
    );
    await prisma.subscription.update({
      where: { tenantId },
      data: { planId: 'public-team', status: 'TRIALING', provider: PILOT_PROVIDER, providerSubId: null, trialEndsAt: new Date(Date.now() + 86_400_000) },
    });
    await expect(assignInternalPlan(tenantId, 'ultra', 'admin-1', 'x')).rejects.toBeInstanceOf(
      LiveProviderSubscriptionError
    );
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'plan.internal.' } } })).toBe(0);
  });

  it('the Stripe sync and cancellation leave an internal plan alone, and raise an operator alert', async () => {
    const readRow = () => prisma.subscription.findUnique({ where: { tenantId } });
    expect(checkoutBlocker(await readRow())).toBeNull();
    await assignInternalPlan(tenantId, 'ultra', 'admin-1', 'stripe guard');
    expect(checkoutBlocker(await readRow())).toBe('INTERNAL_PLAN_CHECKOUT_CLOSED');
    const syncEvent = `evt_internal_sync_${suffix()}`;
    const cancelEvent = `evt_internal_cancel_${suffix()}`;

    const fake = {
      id: 'sub_over_internal',
      status: 'active',
      customer: 'cus_over_internal',
      metadata: { tenantId },
      items: { data: [] },
    } as unknown as Stripe.Subscription;

    expect(await syncStripeSubscription(fake, syncEvent)).toMatchObject({
      status: 'skipped',
      planId: 'ultra',
      error: 'INTERNAL_PLAN_PROTECTED',
    });
    expect(await handleSubscriptionCancellation(fake, cancelEvent)).toMatchObject({
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
    // Not claimed — but nothing replays it either: the webhook answers 200, so
    // Stripe does not retry. Checkout is closed for an internal plan, and a skip
    // that still happens is an operator alert, one per event, carrying Stripe
    // ids and no tenant id (SystemAlert has no RLS).
    expect(await prisma.stripeEventLog.count({ where: { tenantId } })).toBe(0);
    const alerts = await prisma.systemAlert.findMany({
      where: {
        source: 'stripe-webhook',
        OR: [syncEvent, cancelEvent].map((id) => ({ meta: { path: ['eventId'], equals: id } })),
      },
      select: { id: true, level: true, meta: true },
    });
    try {
      expect(alerts).toHaveLength(2);
      for (const alert of alerts) {
        expect(alert.level).toBe('error');
        expect(alert.meta).toMatchObject({ code: 'INTERNAL_PLAN_PROTECTED', stripeSubscriptionId: 'sub_over_internal' });
        expect(JSON.stringify(alert.meta)).not.toContain(tenantId);
      }
    } finally {
      await prisma.systemAlert.deleteMany({ where: { id: { in: alerts.map((a) => a.id) } } });
    }
  });
});
