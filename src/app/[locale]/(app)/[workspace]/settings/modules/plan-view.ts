import type { TenantTx } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { FALLBACK_PLAN_ID, grantsFor, publicSectorPlan, resolvePlanId } from '@/lib/billing/catalog';
import { pilotLastDayLabel, pilotStateOf, type PilotSubscriptionRow } from '@/lib/billing/pilot';
import type { ModuleId } from '@/lib/modules/types';

/**
 * What the modules settings page shows and what its action decides on — read
 * from one place so the two cannot disagree (TASK-MUMH6W5I1W9WC).
 *
 * Both used to assume `'pro'` when the tenant had no subscription, and the page
 * additionally showed M1–M5 and M8 as "Aktif" when the tenant had no
 * `ModuleState` rows. A new tenant therefore saw a Pro plan and six running
 * modules while every one of those module pages refused it. Nothing here falls
 * back: the plan is the one `getEntitlements` entitles from, and a module is
 * active only when `ModuleState` has switched it on *and* the plan grants it —
 * the same two facts `checkModuleAccess` checks.
 *
 * Billing is read, never changed.
 */

/** Statuses the settings page counts as "switched on" — every status but OFF. */
export const SWITCHED_ON_STATUSES = ['ON', 'PILOT', 'DEV'] as const;

/** getEntitlements only entitles from a subscription in one of these. */
const LIVE_SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE'];

export interface ModulesPlanView {
  /** Plan id entitlements are computed from (`free` without a live subscription). */
  planId: string;
  /** Display name from the catalogue ("Discover", "Pro", "Belediye Ekip"). */
  planName: string;
  /** The self-serve plan whose badge colour and tier row this plan uses; `null` for `free`. */
  badgeTier: 'basic' | 'pro' | 'ultra' | null;
  /** The free pilot, running or run out; `null` for any other tenant. */
  pilot: { lastDay: string; expired: boolean } | null;
  /** Modules the plan and its add-ons open (`getEntitlements().allowedModules`). */
  entitledModules: ModuleId[];
  /** Switched on in `ModuleState` and entitled — what the gate actually opens. */
  activeModules: ModuleId[];
  /** Switched on in `ModuleState` but outside the plan (left by a downgrade). */
  switchedOnOutsidePlan: ModuleId[];
}

type SubscriptionRow = PilotSubscriptionRow & { planId: string };

/** Reads the view inside `tx` (a `withTenant` transaction for `tenantId`). */
export async function readModulesPlanView(
  tenantId: string,
  tx: TenantTx,
  locale: string,
  now: Date = new Date()
): Promise<ModulesPlanView> {
  // Sequential: the three reads share one interactive transaction.
  const subscription = (await tx.subscription.findUnique({
    where: { tenantId },
    select: { planId: true, status: true, provider: true, trialEndsAt: true },
  })) as SubscriptionRow | null;
  const entitlements = await getEntitlements(tenantId, tx);
  const states = (await tx.moduleState.findMany({
    where: { tenantId, status: { in: [...SWITCHED_ON_STATUSES] } },
    select: { moduleId: true },
  })) as Array<{ moduleId: string }>;

  // Mirrors getEntitlements' own rule, so the name shown is the plan whose
  // modules are listed.
  const planId =
    subscription && LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)
      ? resolvePlanId(subscription.planId)
      : FALLBACK_PLAN_ID;
  const grant = grantsFor(planId);
  const selfServe = planId === 'basic' || planId === 'pro' || planId === 'ultra' ? planId : null;

  const pilotState = pilotStateOf(subscription, now);
  const entitled = entitlements.allowedModules as ModuleId[];
  const switchedOn = states.map((s) => s.moduleId as ModuleId);

  return {
    planId,
    planName: grant?.name ?? planId,
    badgeTier: selfServe ?? publicSectorPlan(planId)?.basePlanId ?? null,
    pilot:
      pilotState.kind === 'none'
        ? null
        : { lastDay: pilotLastDayLabel(pilotState.endsAt, locale), expired: pilotState.kind === 'expired' },
    entitledModules: entitled,
    activeModules: switchedOn.filter((id) => entitled.includes(id)),
    switchedOnOutsidePlan: switchedOn.filter((id) => !entitled.includes(id)),
  };
}
