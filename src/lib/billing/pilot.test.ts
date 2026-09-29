/**
 * TASK-MUMABL78X5JLX — the free 90-day pilot, against the real database (the
 * same reason as public-sector-assignment.test.ts: a mocked delegate cannot
 * prove the row `getEntitlements` reads was written).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';
import { prisma, withTenant } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { grantsFor } from './catalog';
import { assignPlanToTenant, LiveProviderSubscriptionError } from './plan-repository';
import { upsertPublicSectorPlans } from './public-sector-plans';
import {
  ContractSubscriptionError,
  PILOT_PROVIDER,
  PilotExpiredError,
  assertTenantWritable,
  getPilotState,
  grantPilot,
  pilotEndsAt,
  pilotStateOf,
} from './pilot';
import { handleSubscriptionCancellation, syncStripeSubscription } from './subscription-sync';
import { readSeatUsage } from './seat-limit';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DAY = 86_400_000;

describe('pilotEndsAt — 90 Istanbul calendar days', () => {
  it('counts the Istanbul date, not the UTC one: 1 Oct 00:00 and 23:59 Istanbul end together', () => {
    const early = new Date('2026-09-30T21:00:00Z'); // 1 Oct 00:00 Istanbul (still 30 Sep in UTC)
    const late = new Date('2026-10-01T20:59:59Z'); // 1 Oct 23:59:59 Istanbul
    // 1 Oct is day 1, so day 90 is 29 Dec and the pilot ends at 30 Dec 00:00 Istanbul.
    expect(pilotEndsAt(early).toISOString()).toBe('2026-12-29T21:00:00.000Z');
    expect(pilotEndsAt(late).toISOString()).toBe('2026-12-29T21:00:00.000Z');
  });

  it('one second past Istanbul midnight is the next day, and ends one day later', () => {
    const nextDay = new Date('2026-10-01T21:00:00Z'); // 2 Oct 00:00 Istanbul
    expect(pilotEndsAt(nextDay).toISOString()).toBe('2026-12-30T21:00:00.000Z');
  });

  it('the end instant itself is expired; one millisecond before it is not', () => {
    const endsAt = new Date('2026-12-29T21:00:00Z');
    const sub = { status: 'TRIALING', provider: PILOT_PROVIDER, trialEndsAt: endsAt };
    expect(pilotStateOf(sub, new Date(endsAt.getTime() - 1)).kind).toBe('active');
    expect(pilotStateOf(sub, endsAt).kind).toBe('expired');
  });

  it('a Stripe trial is not a pilot, whatever its trialEndsAt says', () => {
    const sub = { status: 'TRIALING', provider: 'stripe', trialEndsAt: new Date(0) };
    expect(pilotStateOf(sub).kind).toBe('none');
  });
});

describe('grantPilot (live DB)', () => {
  let tenantId: string;

  beforeAll(async () => {
    await upsertPublicSectorPlans(prisma);
  });

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Pilot Test', slug: `pilot-test-${suffix()}`, country: 'TR', orgType: 'MUNICIPALITY' },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { tenantId } });
    await prisma.stripeEventLog.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.planAssignment.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('puts the tenant on Ekip for 90 days: TRIALING, pilot provider, no PSP id, 6 seats, audited', async () => {
    const now = new Date('2026-10-01T09:00:00Z');
    const result = await grantPilot(tenantId, 'admin-1', { now });
    expect(result.outcome).toBe('granted');
    expect(result.endsAt.toISOString()).toBe('2026-12-29T21:00:00.000Z');

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub).toMatchObject({
      planId: 'public-team',
      planVersionId: 'pv_public-team_1',
      status: 'TRIALING',
      provider: PILOT_PROVIDER,
      providerSubId: null,
      providerCustomerId: null,
    });
    expect(sub?.trialEndsAt?.toISOString()).toBe('2026-12-29T21:00:00.000Z');

    const ent = await getEntitlements(tenantId);
    expect(ent.seats).toBe(6);
    expect(ent.source).toBe('plan-version');
    expect([...ent.allowedModules].sort()).toEqual([...grantsFor('pro')!.moduleIds].sort());

    const events = await prisma.auditEvent.findMany({ where: { tenantId, type: 'billing.pilot.granted' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.actorId).toBe('admin-1');
    expect((events[0]!.data as Record<string, unknown>).endsAt).toBe('2026-12-29T21:00:00.000Z');
  });

  it('pilot scope: 6 seats for invitations, and the Ekip modules (M5 dashboard with the karne card) are granted', async () => {
    // Karne (/fon-hazirlik + the dashboard readiness card), radar (/belediye-cagrilari)
    // and the agency invite codes sit behind no module gate at all (ADR-0001 gate
    // is not called on those routes), so the plan can neither open nor close them.
    // What the plan does decide is the seat limit an invitation is checked against.
    await grantPilot(tenantId, 'admin-1');
    const usage = await withTenant(tenantId, (tx) => readSeatUsage(tx, tenantId, 'new@example.test'));
    expect(usage).toEqual({ limit: 6, members: 0, pendingInvitations: 0 });
    const ent = await getEntitlements(tenantId);
    for (const m of ['M1', 'M2', 'M3', 'M4', 'M5', 'M8']) expect(ent.allowedModules).toContain(m);
  });

  it('is idempotent: a second grant changes nothing and writes no second audit row', async () => {
    const now = new Date('2026-10-01T09:00:00Z');
    await grantPilot(tenantId, 'admin-1', { now });
    const again = await grantPilot(tenantId, 'admin-1', { now: new Date(now.getTime() + 10 * DAY) });
    expect(again.outcome).toBe('unchanged');
    expect(again.endsAt.toISOString()).toBe('2026-12-29T21:00:00.000Z');
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub?.trialEndsAt?.toISOString()).toBe('2026-12-29T21:00:00.000Z');
    expect(await prisma.auditEvent.count({ where: { tenantId, type: { startsWith: 'billing.pilot.' } } })).toBe(1);
  });

  it('extends only when asked: +90 days from the current end, audited as extended', async () => {
    const now = new Date('2026-10-01T09:00:00Z');
    await grantPilot(tenantId, 'admin-1', { now });
    const ext = await grantPilot(tenantId, 'admin-2', { now: new Date(now.getTime() + 10 * DAY), extend: true });
    expect(ext.outcome).toBe('extended');
    // 30 Dec is day 1 of the second term → ends 30 Mar 2027 00:00 Istanbul.
    expect(ext.endsAt.toISOString()).toBe('2027-03-29T21:00:00.000Z');
    const event = await prisma.auditEvent.findFirst({ where: { tenantId, type: 'billing.pilot.extended' } });
    expect((event?.data as Record<string, unknown>).previousEndsAt).toBe('2026-12-29T21:00:00.000Z');
  });

  it('refuses over a live Stripe subscription and over a contract package', async () => {
    await prisma.subscription.create({
      data: { tenantId, planId: 'pro', status: 'ACTIVE', provider: 'stripe', providerSubId: 'sub_pilot_test' },
    });
    await expect(grantPilot(tenantId, 'admin-1')).rejects.toBeInstanceOf(LiveProviderSubscriptionError);
    await prisma.subscription.deleteMany({ where: { tenantId } });

    await assignPlanToTenant('public-team', tenantId, 'admin-1', null);
    await expect(grantPilot(tenantId, 'admin-1')).rejects.toBeInstanceOf(ContractSubscriptionError);
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(sub?.provider).toBe('contract');
  });

  it('after the end the tenant is read-only; before it, and without a pilot, it is writable', async () => {
    await assertTenantWritable(tenantId); // no subscription at all
    const start = new Date('2026-10-01T09:00:00Z');
    const { endsAt } = await grantPilot(tenantId, 'admin-1', { now: start });
    await assertTenantWritable(tenantId, undefined, new Date(endsAt.getTime() - 1));
    await expect(assertTenantWritable(tenantId, undefined, endsAt)).rejects.toBeInstanceOf(PilotExpiredError);
    // Read-only keeps the data and the plan: entitlements are unchanged, nothing was deleted.
    expect((await getEntitlements(tenantId)).seats).toBe(6);
  });

  it('the Stripe sync and cancellation leave a pilot row alone', async () => {
    await grantPilot(tenantId, 'admin-1');
    const before = await prisma.subscription.findUnique({ where: { tenantId } });

    const fake = {
      id: 'sub_forged_pilot',
      status: 'active',
      customer: 'cus_forged',
      metadata: { tenantId },
      items: { data: [] },
    } as unknown as Stripe.Subscription;

    const synced = await syncStripeSubscription(fake, `evt_pilot_sync_${suffix()}`);
    expect(synced).toMatchObject({ status: 'skipped', error: 'PILOT_PROTECTED' });
    const cancelled = await handleSubscriptionCancellation(fake, `evt_pilot_cancel_${suffix()}`);
    expect(cancelled).toMatchObject({ status: 'skipped', error: 'PILOT_PROTECTED' });

    const after = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(after).toMatchObject({
      planId: before!.planId,
      status: 'TRIALING',
      provider: PILOT_PROVIDER,
      providerSubId: null,
    });
    expect(after?.trialEndsAt?.toISOString()).toBe(before!.trialEndsAt!.toISOString());
    expect((await getPilotState(tenantId)).kind).toBe('active');
  });
});
