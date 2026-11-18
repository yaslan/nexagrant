import { prisma } from '../../../src/lib/db';
import { withSystemScope } from '../../../src/lib/system-scope';
import { presentIds, requireId } from '../../helpers/teardown-guard';

/**
 * NG-11 — three tenants, one per trial state of the NG-57 contract, each with its own
 * TENANT_OWNER seat (the only role the plan screen admits; NG_PLAN_REFUSED_SEATS adds a MEMBER
 * and a GUEST_PARTNER on the running tenant, to prove the refusal):
 *
 *   none    — no NgSubscription row: the reader falls back to the fallback plan.
 *   running — a real `ng-trial` row, TRIALING, ending in the future.
 *   ended   — a real `ng-trial` row whose end has passed and that was never settled:
 *             the reader must show it ended and on its end plan.
 *
 * The trial plan and end plan are read from `NgTrialPolicy` (segment `default`), the
 * same data the registration flow uses — not typed here. Rows are created in
 * `setupNgPlanTenants` and removed in `teardownNgPlanTenants` (NgSubscription goes
 * with the tenant: onDelete Cascade).
 */
export const NG_PLAN_STATES = ['none', 'running', 'ended'] as const;
export type NgPlanFixtureState = (typeof NG_PLAN_STATES)[number];

/**
 * Refused seats on the `running` tenant: the plan screen is `manage_billing` (TENANT_OWNER
 * only, the same door as Settings → Billing). Each is a real membership row, so the role the
 * server reads is the one the seat holds.
 */
export const NG_PLAN_REFUSED_SEATS = {
  MEMBER: { userId: 'ng11-e2e-running-member-user', email: 'ng11-e2e-running-member@plan.test', name: 'NG-11 running member' },
  GUEST_PARTNER: { userId: 'ng11-e2e-running-guest-user', email: 'ng11-e2e-running-guest@plan.test', name: 'NG-11 running guest' },
} as const;
export type NgPlanRefusedRole = keyof typeof NG_PLAN_REFUSED_SEATS;

export interface NgPlanFixture {
  state: NgPlanFixtureState;
  tenantId: string;
  userId: string;
  email: string;
  workspaceId: string;
  workspace: string;
}

export function ngPlanFixture(state: NgPlanFixtureState): NgPlanFixture {
  return {
    state,
    tenantId: `ng11-e2e-${state}`,
    userId: `ng11-e2e-${state}-user`,
    email: `ng11-e2e-${state}@plan.test`,
    workspaceId: `ng11-e2e-${state}-ws`,
    workspace: `ng11-${state}`,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NgTrialRow {
  trialStartedAt: Date;
  trialEndsAt: Date;
  /** When the server settled the expiry: a different moment from `trialEndsAt` (null while running). */
  trialEndedAt: Date | null;
  planId: string;
  trialEndPlanId: string;
}

/** Creates the three tenants; returns the trial rows actually written. */
export async function setupNgPlanTenants(now = new Date()): Promise<Record<'running' | 'ended', NgTrialRow>> {
  return withSystemScope('platform-admin', 'e2e.ng11.setup', async (tx) => {
    const policy = await tx.ngTrialPolicy.findUnique({ where: { segment: 'default' } });
    if (!policy) throw new Error('NgTrialPolicy "default" missing: run pnpm db:setup');

    // Running: started two days ago, ends in a little under policy.days − 2 days
    // (an hour short, so the rounded-up day count is policy.days − 2).
    const running: NgTrialRow = {
      trialStartedAt: new Date(now.getTime() - 2 * DAY_MS),
      trialEndsAt: new Date(now.getTime() + (policy.days - 2) * DAY_MS - 60 * 60 * 1000),
      trialEndedAt: null,
      planId: policy.planId,
      trialEndPlanId: policy.endPlanId,
    };
    // Ended: started policy.days + 1 days ago, ended a day ago, settled today (trialEndedAt is
    // a different day from trialEndsAt, so a screen that shows the settle moment is caught).
    const ended: NgTrialRow = {
      trialStartedAt: new Date(now.getTime() - (policy.days + 1) * DAY_MS),
      trialEndsAt: new Date(now.getTime() - DAY_MS),
      trialEndedAt: new Date(now.getTime()),
      planId: policy.planId,
      trialEndPlanId: policy.endPlanId,
    };

    // The platform subscription needs a real platform plan. Read it from the seeded catalogue
    // (the highest-priced one) rather than typing an id that a re-seed could drop.
    const platformPlan = await tx.plan.findFirst({ orderBy: { monthlyCents: 'desc' }, select: { id: true } });
    if (!platformPlan) throw new Error('platform Plan catalogue missing: run pnpm db:setup');

    for (const state of NG_PLAN_STATES) {
      const f = ngPlanFixture(state);
      await tx.tenant.upsert({
        where: { id: f.tenantId },
        create: { id: f.tenantId, name: `NG-11 e2e (${state})`, slug: f.tenantId, country: 'TR', orgType: 'SME' },
        update: {},
      });
      await tx.subscription.upsert({
        where: { tenantId: f.tenantId },
        create: { tenantId: f.tenantId, planId: platformPlan.id, status: 'ACTIVE' },
        update: { planId: platformPlan.id, status: 'ACTIVE', planVersionId: null },
      });
      await tx.workspace.upsert({
        where: { id: f.workspaceId },
        create: { id: f.workspaceId, tenantId: f.tenantId, name: `NG-11 ${state}`, slug: f.workspace },
        update: { slug: f.workspace },
      });
      await tx.user.upsert({
        where: { id: f.userId },
        create: { id: f.userId, email: f.email, name: `NG-11 ${state}`, locale: 'tr' },
        update: { email: f.email },
      });
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: f.tenantId, userId: f.userId } },
        create: { tenantId: f.tenantId, userId: f.userId, role: 'TENANT_OWNER', workspaceIds: [f.workspaceId] },
        update: { role: 'TENANT_OWNER', workspaceIds: [f.workspaceId] },
      });
      if (state === 'running') {
        for (const [role, seat] of Object.entries(NG_PLAN_REFUSED_SEATS) as [NgPlanRefusedRole, (typeof NG_PLAN_REFUSED_SEATS)[NgPlanRefusedRole]][]) {
          await tx.user.upsert({
            where: { id: seat.userId },
            create: { id: seat.userId, email: seat.email, name: seat.name, locale: 'tr' },
            update: { email: seat.email },
          });
          await tx.membership.upsert({
            where: { tenantId_userId: { tenantId: f.tenantId, userId: seat.userId } },
            create: { tenantId: f.tenantId, userId: seat.userId, role, workspaceIds: [f.workspaceId] },
            update: { role, workspaceIds: [f.workspaceId] },
          });
        }
      }
      await tx.ngSubscription.deleteMany({ where: { tenantId: requireId(f.tenantId, 'ng11 tenantId') } });
      const row = state === 'running' ? running : state === 'ended' ? ended : null;
      if (row) {
        await tx.ngSubscription.create({
          data: {
            tenantId: f.tenantId,
            planId: row.planId,
            status: 'TRIALING',
            provider: 'ng-trial',
            trialSegment: 'default',
            trialStartedAt: row.trialStartedAt,
            trialEndsAt: row.trialEndsAt,
            trialEndedAt: row.trialEndedAt,
            trialEndPlanId: row.trialEndPlanId,
          },
        });
      }
    }
    return { running, ended };
  });
}

export async function teardownNgPlanTenants(): Promise<void> {
  const fixtures = NG_PLAN_STATES.map(ngPlanFixture);
  const tenantIds = fixtures.map((f) => f.tenantId);
  await withSystemScope('platform-admin', 'e2e.ng11.teardown', async (tx) => {
    await tx.ngSubscription.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await tx.membership.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await tx.subscription.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await tx.workspace.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    const seatIds = Object.values(NG_PLAN_REFUSED_SEATS).map((s) => s.userId);
    await tx.user.deleteMany({ where: { id: { in: presentIds([...fixtures.map((f) => f.userId), ...seatIds]) } } });
    await tx.tenant.deleteMany({ where: { id: { in: presentIds(tenantIds) } } });
  });
  await prisma.$disconnect();
}

/** The catalogue as stored, read past the page — what the screen must agree with. */
export async function readStoredCatalogue() {
  return withSystemScope('platform-admin', 'e2e.ng11.catalogue', (tx) =>
    tx.ngPlan.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        tier: true,
        sellable: true,
        isFallback: true,
        features: { select: { featureKey: true, limitValue: true } },
      },
    })
  );
}
