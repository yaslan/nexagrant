/**
 * NG-11 F2 — the read path of an ended trial that nothing has settled yet. The row still
 * says `trialEndedAt: null` and its `trialEndsAt` is past, so `readNgBillingState` must
 * show the trial's end plan (`trialEndPlanId`), not the plan the trial started on
 * (`planId`). `readNgBillingState` projects `expiry.planId` onto the stored row
 * (repository.ts); removing that projection makes the plan read as ng-pro and this test red.
 * The transaction is a small fake: only the four reads the function makes.
 */
import { describe, expect, test } from 'vitest';
import type { TenantTx } from '@/lib/db';
import { readNgBillingState } from './repository';

const PLANS: Record<string, { id: string; tier: string; sortOrder: number; sellable: boolean; isFallback: boolean }> = {
  'ng-free': { id: 'ng-free', tier: 'free', sortOrder: 1, sellable: false, isFallback: true },
  'ng-pro': { id: 'ng-pro', tier: 'professional', sortOrder: 3, sellable: true, isFallback: false },
};

function fakeTx(sub: Record<string, unknown> | null): TenantTx {
  return {
    ngSubscription: { findUnique: async () => sub },
    ngPlan: {
      findUnique: async ({ where }: { where: { id: string } }) => PLANS[where.id] ?? null,
      findFirst: async () => PLANS['ng-free'],
    },
    ngPlanFeature: { findMany: async () => [] },
  } as unknown as TenantTx;
}

// Seed shape (prisma/seed-data/nexagrant-catalog.ts): a trial starts on ng-pro and ends on ng-free.
const ENDED_UNSETTLED = {
  tenantId: 't1',
  planId: 'ng-pro',
  status: 'TRIALING',
  provider: 'ng-trial',
  trialSegment: 'default',
  trialStartedAt: new Date('2026-10-01T09:00:00Z'),
  trialEndsAt: new Date('2026-10-15T21:00:00Z'), // past: "now" below is in November 2026
  trialEndPlanId: 'ng-free',
  trialEndedAt: null,
};

describe('readNgBillingState — ended trial not yet settled (NG-11 F2)', () => {
  test('the plan shown is the trial end plan, not the plan the trial started on', async () => {
    const state = await readNgBillingState(fakeTx(ENDED_UNSETTLED), 't1', new Date('2026-11-19T09:00:00Z'));
    expect(state.plan.id).toBe('ng-free');
    expect(state.trial.kind).toBe('ended');
    expect(state.status).toBe('ACTIVE');
  });

  test('a trial still running shows its own plan (the projection does not touch a live trial)', async () => {
    const running = { ...ENDED_UNSETTLED, trialEndsAt: new Date('2026-12-30T21:00:00Z') };
    const state = await readNgBillingState(fakeTx(running), 't1', new Date('2026-11-19T09:00:00Z'));
    expect(state.plan.id).toBe('ng-pro');
    expect(state.trial.kind).toBe('running');
  });
});
