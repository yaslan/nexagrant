/**
 * Internal plan assignment (TASK-MVCH26OXNVLKR, PS-K6b).
 *
 * A platform admin puts a tenant on Basic, Pro or Ultra without a payment, so
 * that the features behind those plans can be tried; picking Discover takes the
 * internal plan back. The plan list is the catalogue's (`grantsFor`) — there is
 * no second plan ladder here — and what the tenant may then use is decided by
 * `getEntitlements` exactly as for a paying tenant, because the write is an
 * ordinary `Subscription` row:
 *
 *   planId: <plan>, status: ACTIVE, provider: 'internal', no provider ids.
 *
 * `provider: 'internal'` is the "internal" mark (an existing column, no schema
 * change). Stripe leaves such a row alone — see subscription-owner.ts, the one
 * place that says which source wins. The tenant also gets a `PlanAssignment`
 * row carrying who and why, and every change writes an `AuditEvent` with the
 * old and the new plan.
 *
 * Refused over a subscription somebody else owns: a live Stripe/iyzico
 * subscription (cancel it first, or the tenant would be charged for a plan it
 * is no longer on), a running pilot or a contract — and over a trial with no
 * Stripe subscription behind it (`internalPlanBlocker`).
 */
import { withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { FALLBACK_PLAN_ID, grantsFor, type PlanId } from '@/lib/billing/catalog';
import { clearedPriceLock } from '@/lib/billing/price-lock';
import { CONTRACT_PROVIDER, LiveProviderSubscriptionError, publishedVersionIdFor } from '@/lib/billing/plan-repository';
import { lockPilotRow, PILOT_PROVIDER } from '@/lib/billing/pilot';
import {
  INTERNAL_PROVIDER,
  internalPlanBlocker,
  isInternalPlanSubscription,
  SubscriptionOwnedError,
} from '@/lib/billing/subscription-owner';

/** The plans an admin may assign internally, Discover first (= take it back). */
export const INTERNAL_PLAN_CHOICES = [FALLBACK_PLAN_ID, 'basic', 'pro', 'ultra'] as const satisfies readonly (
  | typeof FALLBACK_PLAN_ID
  | PlanId
)[];

export type InternalPlanChoice = (typeof INTERNAL_PLAN_CHOICES)[number];

const PAID_CHOICES: readonly string[] = INTERNAL_PLAN_CHOICES.filter((id) => id !== FALLBACK_PLAN_ID);

const LIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

/** The audit note is mandatory: an internal plan is free product, and someone has to say why. */
export class InternalPlanNoteRequiredError extends Error {
  readonly code = 'NOTE_REQUIRED';
  constructor() {
    super('An internal plan assignment needs a note.');
    this.name = 'InternalPlanNoteRequiredError';
  }
}

export interface AssignInternalPlanResult {
  /** `unchanged`: the tenant was already where it was asked to go; nothing was written. */
  outcome: 'assigned' | 'revoked' | 'unchanged';
  before: string;
  after: string;
}

interface SubscriptionRow {
  planId: string;
  status: string;
  provider: string;
  providerSubId: string | null;
}

/** The plan the tenant is entitled from right now, as `getEntitlements` would read it. */
function effectivePlan(sub: SubscriptionRow | null): string {
  return sub && ['ACTIVE', 'TRIALING'].includes(sub.status) ? sub.planId : FALLBACK_PLAN_ID;
}

export async function assignInternalPlan(
  tenantId: string,
  planId: InternalPlanChoice,
  actorId: string | null,
  note: string
): Promise<AssignInternalPlanResult> {
  const memo = note.trim();
  if (!memo) throw new InternalPlanNoteRequiredError();
  if (planId !== FALLBACK_PLAN_ID && !grantsFor(planId)) throw new Error(`Plan not found in catalogue: ${planId}`);

  // Read on the bare client before the tenant transaction, as grantPilot does:
  // PlanVersion is a platform table. Null is allowed — getEntitlements then
  // answers from the catalogue.
  const planVersionId = planId === FALLBACK_PLAN_ID ? null : await publishedVersionIdFor(planId);

  return withTenant(tenantId, async (tx) => {
    // The lock Stripe sync and grantPilot take too: no Stripe write or pilot
    // grant can land between the check below and the upsert.
    await lockPilotRow(tx, tenantId);

    const existing = (await tx.subscription.findUnique({
      where: { tenantId },
      select: { planId: true, status: true, provider: true, providerSubId: true },
    })) as SubscriptionRow | null;

    const internal = isInternalPlanSubscription(existing);
    const before = effectivePlan(existing);

    if (existing && !internal && LIVE_STATUSES.includes(existing.status)) {
      const owned =
        existing.provider === PILOT_PROVIDER || existing.provider === CONTRACT_PROVIDER || Boolean(existing.providerSubId);
      if (owned) throw new LiveProviderSubscriptionError(tenantId, existing.provider);
    }
    const block = internalPlanBlocker(existing);
    if (block) throw new SubscriptionOwnedError(block, tenantId);

    if (planId === FALLBACK_PLAN_ID) {
      if (!internal) return { outcome: 'unchanged' as const, before, after: before };
      await tx.subscription.update({ where: { tenantId }, data: { status: 'CANCELED' } });
      await tx.planAssignment.deleteMany({ where: { tenantId, planId: { in: [...PAID_CHOICES] } } });
      await tx.auditEvent.create({
        data: {
          type: 'plan.internal.revoked',
          actorId,
          tenantId,
          target: FALLBACK_PLAN_ID,
          data: { tenantId, before, after: FALLBACK_PLAN_ID, note: memo, internal: true },
        },
      });
      return { outcome: 'revoked' as const, before, after: FALLBACK_PLAN_ID };
    }

    if (internal && existing!.planId === planId) return { outcome: 'unchanged' as const, before, after: before };

    const terms = {
      planId,
      planVersionId,
      status: 'ACTIVE' as const,
      billingInterval: 'month',
      provider: INTERNAL_PROVIDER,
      providerCustomerId: null,
      providerSubId: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      ...clearedPriceLock(),
    };
    await tx.subscription.upsert({ where: { tenantId }, create: { tenantId, ...terms }, update: terms });

    // One internal assignment row per tenant: the previous one goes, the new one carries who and why.
    await tx.planAssignment.deleteMany({ where: { tenantId, planId: { in: [...PAID_CHOICES] } } });
    await tx.planAssignment.create({ data: { planId, tenantId, assignedBy: actorId, note: memo } });

    await tx.auditEvent.create({
      data: {
        type: 'plan.internal.assigned',
        actorId,
        tenantId,
        target: planId,
        data: { tenantId, before, after: planId, note: memo, internal: true, planVersionId },
      },
    });
    return { outcome: 'assigned' as const, before, after: planId };
  });
}

/** Tenants on an internal plan right now, by id — the "internal" badge on the tenant list. */
export async function listInternalPlans(): Promise<Map<string, string>> {
  const rows = (await withSystemScope('platform-admin', 'internal-plan.listInternalPlans', (tx) =>
    tx.subscription.findMany({
      where: { provider: INTERNAL_PROVIDER, status: 'ACTIVE' },
      select: { tenantId: true, planId: true },
    })
  )) as Array<{ tenantId: string; planId: string }>;
  return new Map(rows.map((r) => [r.tenantId, r.planId]));
}
