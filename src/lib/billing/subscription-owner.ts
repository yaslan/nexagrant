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
 * row it names is left alone. Nothing replays the skipped event, so checkout is
 * closed for both owners (`PILOT_CHECKOUT_CLOSED`, `INTERNAL_PLAN_CHECKOUT_CLOSED`)
 * and a skip is logged — for an internal plan also raised as a `SystemAlert`. A
 * contract is not listed: assigning one is refused while a live Stripe
 * subscription exists, so Stripe never names a contract tenant.
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

/** Why Stripe may not write a row, as the code `SubscriptionSyncResult.error` carries. */
export type StripeSyncBlock = 'PILOT_PROTECTED' | 'INTERNAL_PLAN_PROTECTED';

/** `null` when Stripe owns the row (or there is none); otherwise the source that does. */
export function stripeSyncBlocker(sub: PilotSubscriptionRow | null | undefined): StripeSyncBlock | null {
  if (isPilotSubscription(sub)) return 'PILOT_PROTECTED';
  if (isInternalPlanSubscription(sub)) return 'INTERNAL_PLAN_PROTECTED';
  return null;
}
