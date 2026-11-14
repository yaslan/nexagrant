import { suiteHasDatabase } from '../../../tests/helpers/database-availability';
/**
 * TASK-MVCH26OXNVLKR — internal plan assignment, against the real database
 * (as pilot.test.ts: a mocked delegate cannot prove that the row
 * `getEntitlements` reads was written, or that Stripe left it alone).
 * TASK-MVIB6KITO9U5I: a pilot grant and an unbacked trial cannot replace it.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';
import { prisma, withTenant } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { LiveProviderSubscriptionError } from './plan-repository';
import { assignInternalPlan, InternalPlanNoteRequiredError, listInternalPlans } from './internal-plan';
import {
  checkoutBlocker,
  INTERNAL_PROVIDER,
  internalPlanBlocker,
  isInternalPlanSubscription,
  isUnbackedTrial,
  pilotGrantBlocker,
  stripeSyncBlocker,
  SubscriptionOwnedError,
} from './subscription-owner';
import { grantPilot, PILOT_PROVIDER } from './pilot';
import { upsertPublicSectorPlans } from './public-sector-plans';
import { PUBLIC_SECTOR_PLANS_LOCK, withTestDbLock } from '../../../tests/helpers/test-db-lock';
import { handleSubscriptionCancellation, syncStripeSubscription } from './subscription-sync';
import { presentIds, requireId } from '../../../tests/helpers/teardown-guard';

const entitlements = (tenantId: string) => withTenant(tenantId, (tx) => getEntitlements(tenantId, tx));
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const HAS_DB = await suiteHasDatabase('internal-plan');

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

describe('admin grants — which rows they may not replace', () => {
  it('a pilot may not replace an active internal plan; a cancelled one is free', () => {
    expect(pilotGrantBlocker({ status: 'ACTIVE', provider: INTERNAL_PROVIDER, providerSubId: null })).toBe(
      'INTERNAL_PLAN_PROTECTED'
    );
    expect(pilotGrantBlocker({ status: 'CANCELED', provider: INTERNAL_PROVIDER, providerSubId: null })).toBeNull();
    expect(pilotGrantBlocker(null)).toBeNull();
  });

  it('a pilot may not replace a trial with no Stripe subscription behind it either', () => {
    const beta = { status: 'TRIALING', provider: 'stripe', providerSubId: null };
    expect(pilotGrantBlocker(beta)).toBe('TRIAL_PROTECTED');
    expect(pilotGrantBlocker({ ...beta, status: 'CANCELED' })).toBeNull();
    expect(pilotGrantBlocker({ ...beta, provider: PILOT_PROVIDER })).toBeNull();
  });

  it('an internal plan may not replace a trial with no Stripe subscription behind it', () => {
    const beta = { status: 'TRIALING', provider: 'stripe', providerSubId: null };
    expect(isUnbackedTrial(beta)).toBe(true);
    expect(internalPlanBlocker(beta)).toBe('TRIAL_PROTECTED');
    expect(internalPlanBlocker({ ...beta, status: 'CANCELED' })).toBeNull();
    expect(internalPlanBlocker({ ...beta, providerSubId: 'sub_1' })).toBeNull();
    expect(internalPlanBlocker({ ...beta, provider: PILOT_PROVIDER })).toBeNull();
    expect(internalPlanBlocker(null)).toBeNull();
  });
});

describe.skipIf(!HAS_DB)('assignInternalPlan (live DB)', () => {
  let tenantId: string;

  beforeAll(async () => {
    await withTestDbLock(process.env.DATABASE_URL!, PUBLIC_SECTOR_PLANS_LOCK, () => upsertPublicSectorPlans(prisma));
  });

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

  it('Pro opens M4; Discover takes it back; both are audited with old → new and the note', async () => {
    expect((await entitlements(tenantId)).allowedModules).not.toContain('M4');

    const assigned = await assignInternalPlan(tenantId, 'pro', 'admin-1', '  M1 lock test  ');
    expect(assigned).toEqual({ outcome: 'assigned', before: 'free', after: 'pro' });
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub).toMatchObject({ planId: 'pro', status: 'ACTIVE', provider: INTERNAL_PROVIDER, providerSubId: null });
    expect((await entitlements(tenantId)).allowedModules).toContain('M4');
    expect(await prisma.planAssignment.findMany({ where: { tenantId }, select: { planId: true, note: true, assignedBy: true } }))
      .toEqual([{ planId: 'pro', note: 'M1 lock test', assignedBy: 'admin-1' }]);
    expect((await listInternalPlans()).get(tenantId)).toBe('pro');

    const revoked = await assignInternalPlan(tenantId, 'free', 'admin-1', 'done testing');
    expect(revoked).toEqual({ outcome: 'revoked', before: 'pro', after: 'free' });
    expect((await entitlements(tenantId)).allowedModules).not.toContain('M4');
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

  it('a pilot grant leaves an internal plan alone', async () => {
    await assignInternalPlan(tenantId, 'ultra', 'admin-1', 'pilot guard');

    const refused = await grantPilot(tenantId, 'admin-1').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SubscriptionOwnedError);
    expect(refused).toMatchObject({ code: 'INTERNAL_PLAN_PROTECTED' });
    await expect(grantPilot(tenantId, 'admin-1', { extend: true })).rejects.toBeInstanceOf(SubscriptionOwnedError);

    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({
      planId: 'ultra',
      status: 'ACTIVE',
      provider: INTERNAL_PROVIDER,
      trialEndsAt: null,
    });
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'billing.pilot.' } } })).toBe(0);

    // Taken back, the tenant is free for a pilot again.
    await assignInternalPlan(tenantId, 'free', 'admin-1', 'pilot next');
    expect(await grantPilot(tenantId, 'admin-1')).toMatchObject({ outcome: 'granted' });
  });

  it('a pilot grant is refused over a trial with no Stripe subscription, and the trial is kept', async () => {
    // As scripts/beta-onboarding.ts writes it: BETA_PLAN_ID (ultra), provider left at the column default, no subscription id.
    const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
    await prisma.subscription.create({
      data: { tenantId, planId: 'ultra', status: 'TRIALING', provider: 'stripe', providerSubId: null, trialEndsAt },
    });
    const before = await entitlements(tenantId);

    const refused = await grantPilot(tenantId, 'admin-1').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SubscriptionOwnedError);
    expect(refused).toMatchObject({ code: 'TRIAL_PROTECTED' });
    await expect(grantPilot(tenantId, 'admin-1', { extend: true })).rejects.toMatchObject({ code: 'TRIAL_PROTECTED' });

    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({
      planId: 'ultra',
      status: 'TRIALING',
      provider: 'stripe',
      providerSubId: null,
      trialEndsAt,
    });
    expect((await entitlements(tenantId)).allowedModules).toEqual(before.allowedModules);
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'billing.pilot.' } } })).toBe(0);

    // Once the trial has ended, the tenant is free for a pilot.
    await prisma.subscription.update({ where: { tenantId }, data: { status: 'CANCELED' } });
    expect(await grantPilot(tenantId, 'admin-1')).toMatchObject({ outcome: 'granted' });
  });

  it('an internal plan is refused over a trial with no Stripe subscription, and the trial is kept', async () => {
    // As scripts/beta-onboarding.ts writes it: BETA_PLAN_ID (ultra), provider left at the column default, no subscription id.
    const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
    await prisma.subscription.create({
      data: { tenantId, planId: 'ultra', status: 'TRIALING', provider: 'stripe', providerSubId: null, trialEndsAt },
    });
    const before = await entitlements(tenantId);

    const refused = await assignInternalPlan(tenantId, 'pro', 'admin-1', 'over beta').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SubscriptionOwnedError);
    expect(refused).toMatchObject({ code: 'TRIAL_PROTECTED' });
    // Discover is refused too, as over a live Stripe subscription: the trial is not the admin's to end.
    await expect(assignInternalPlan(tenantId, 'free', 'admin-1', 'x')).rejects.toMatchObject({ code: 'TRIAL_PROTECTED' });

    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({
      planId: 'ultra',
      status: 'TRIALING',
      provider: 'stripe',
      providerSubId: null,
      trialEndsAt,
    });
    expect((await entitlements(tenantId)).allowedModules).toEqual(before.allowedModules);
    expect(await prisma.planAssignment.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'plan.internal.' } } })).toBe(0);

    // Once the trial has ended the row is nobody's, and the assignment goes through.
    await prisma.subscription.update({ where: { tenantId }, data: { status: 'CANCELED' } });
    expect(await assignInternalPlan(tenantId, 'pro', 'admin-1', 'after beta')).toMatchObject({ outcome: 'assigned' });
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
      await prisma.systemAlert.deleteMany({ where: { id: { in: presentIds(alerts.map((a) => a.id)) } } });
    }
  });
});
