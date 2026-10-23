/**
 * Who owns a tenant's `Subscription` row, and so whether a Stripe event may
 * write over it (TASK-MVCH26OXNVLKR).
 *
 * Three writers put a tenant on a plan without Stripe having sold it:
 *
 *   • the free pilot (`provider: 'pilot'`, src/lib/billing/pilot.ts);
 *   • a public-sector contract (`provider: 'contract'`, plan-repository.ts);
 *   • an internal plan a platform admin gives a tenant so that Pro/Ultra
 *     features can be tried without a payment (`provider: 'internal'`,
 *     src/lib/billing/internal-plan.ts).
 *
 * The rule for which source wins is stated here and nowhere else:
 * subscription-sync.ts asks {@link stripeSyncBlocker} before every write, and a
 * row it names is left alone. Nothing replays the skipped event, so checkout
 * asks {@link checkoutBlocker} — the same rule — and refuses to sell over such a
 * row; a skip that still happens is logged, and for an internal plan also
 * raised as a `SystemAlert` (subscription-sync.ts `reportProtected`). A
 * contract is not listed: assigning one is refused while a live Stripe
 * subscription exists, so Stripe never names a contract tenant.
 *
 * The admin writers ask here too (TASK-MVIB6KITO9U5I): `grantPilot` asks
 * {@link pilotGrantBlocker} and `assignInternalPlan` asks
 * {@link internalPlanBlocker}, so neither replaces a row another source owns
 * without a payment provider id to show for it.
 *
 * Pure — no Prisma — so the precedence is unit-tested on its own.
 */
import { isPilotSubscription, type PilotSubscriptionRow } from '@/lib/billing/pilot';

/** `Subscription.provider` of a plan a platform admin assigned for internal use. Not a payment provider. */
export const INTERNAL_PROVIDER = 'internal';

/** Is this row an internal plan that is currently in force? */
export function isInternalPlanSubscription(sub: Pick<PilotSubscriptionRow, 'status' | 'provider'> | null | undefined): boolean {
  return Boolean(sub && sub.provider === INTERNAL_PROVIDER && sub.status === 'ACTIVE');
}

/** `Subscription.provider` column default: a row Stripe wrote, or one written without saying who owns it. */
const STRIPE_PROVIDER = 'stripe';

/**
 * Is this a trial with no Stripe subscription behind it? `provider` is the
 * column default and `providerSubId` is empty, because nothing was sold: the
 * beta grant (scripts/beta-onboarding.ts) writes such a row. Stripe's own
 * trials always carry the subscription id (subscription-sync.ts), and
 * `getEntitlements` serves a TRIALING row whatever its `trialEndsAt`, so the
 * tenant is on this plan until somebody ends it.
 */
export function isUnbackedTrial(
  sub: (Pick<PilotSubscriptionRow, 'status' | 'provider'> & { providerSubId: string | null }) | null | undefined
): boolean {
  return Boolean(sub && sub.provider === STRIPE_PROVIDER && sub.status === 'TRIALING' && !sub.providerSubId);
}

/** Why Stripe may not write a row, as the code `SubscriptionSyncResult.error` carries. */
export type StripeSyncBlock = 'PILOT_PROTECTED' | 'INTERNAL_PLAN_PROTECTED';

/** `null` when Stripe owns the row (or there is none); otherwise the source that does. */
export function stripeSyncBlocker(sub: PilotSubscriptionRow | null | undefined): StripeSyncBlock | null {
  if (isPilotSubscription(sub)) return 'PILOT_PROTECTED';
  if (isInternalPlanSubscription(sub)) return 'INTERNAL_PLAN_PROTECTED';
  return null;
}

/** Why checkout refuses to open a Stripe session, as the route's `code` carries. */
export type CheckoutBlock = 'PILOT_CHECKOUT_CLOSED' | 'INTERNAL_PLAN_CHECKOUT_CLOSED';

const CHECKOUT_BLOCK: Record<StripeSyncBlock, CheckoutBlock> = {
  PILOT_PROTECTED: 'PILOT_CHECKOUT_CLOSED',
  INTERNAL_PLAN_PROTECTED: 'INTERNAL_PLAN_CHECKOUT_CLOSED',
};

/**
 * `null` when checkout may sell; otherwise why not. A row Stripe may not write
 * is a row nobody may buy over: the payment would be taken and then skipped by
 * the sync, so the two answers come from the one rule above.
 */
export function checkoutBlocker(sub: PilotSubscriptionRow | null | undefined): CheckoutBlock | null {
  const block = stripeSyncBlocker(sub);
  return block ? CHECKOUT_BLOCK[block] : null;
}

/** Why an admin grant may not replace a row, as `SubscriptionOwnedError.code` carries. */
export type AdminGrantBlock = 'INTERNAL_PLAN_PROTECTED' | 'TRIAL_PROTECTED';

/** A pilot grant or an internal assignment refused because another source owns the row. */
export class SubscriptionOwnedError extends Error {
  constructor(readonly code: AdminGrantBlock, readonly tenantId: string) {
    super(`Tenant ${tenantId} is on a plan another source owns (${code}); end it first.`);
    this.name = 'SubscriptionOwnedError';
  }
}

/**
 * `null` when a pilot may be granted over the row. An internal plan carries no
 * provider id, so the paying-subscription check in `grantPilot` lets it through;
 * this one does not — the pilot would take the plan an admin assigned.
 */
export function pilotGrantBlocker(sub: PilotSubscriptionRow | null | undefined): AdminGrantBlock | null {
  return isInternalPlanSubscription(sub) ? 'INTERNAL_PLAN_PROTECTED' : null;
}

/**
 * `null` when an internal plan may be assigned over the row. An unbacked trial
 * is refused rather than kept: the row holds one plan, so assigning would drop
 * the trial's plan, and taking the internal plan back (Discover) would not
 * bring it back.
 */
export function internalPlanBlocker(
  sub: (Pick<PilotSubscriptionRow, 'status' | 'provider'> & { providerSubId: string | null }) | null | undefined
): AdminGrantBlock | null {
  return isUnbackedTrial(sub) ? 'TRIAL_PROTECTED' : null;
}
