/**
 * Which row decides what a tenant is entitled to.
 *
 * Until TASK-MTSJH8NMAXPRM there was only one answer: `PLAN_GRANTS` in
 * src/lib/billing/catalog.ts, a constant compiled into the bundle. The plan
 * studio (TASK-MTRJ32BZBY2AI, TASK-MTSHVKTSGC8A4) can publish a `PlanVersion`
 * that raises Pro from 6 seats to 10, and measured on 2026-09-08 that publish
 * changed the *price* on every surface and changed nothing else: the tenant on
 * Pro still had 6 seats, because `getEntitlements` never looked at the version.
 * `Subscription.planVersionId` had been in the schema since Faz 1 and was never
 * written by anything.
 *
 * The rule now:
 *
 *   1. The subscription's own `planVersionId` wins. That row is immutable once
 *      published, so it is literally the terms the tenant is living under, and
 *      it is what a publish moves forward (see `publishVersion`).
 *   2. If it is absent, the catalogue answers, exactly as it did before. A
 *      subscription sold before this column was written is not silently
 *      re-entitled from a row nobody pointed it at; `scripts/backfill-subscription-plan-version.ts`
 *      is the deliberate migration, and until it runs the tenant keeps today's
 *      behaviour.
 *
 * Two pointers are refused rather than honoured, both falling back to (2):
 *
 *   • A version of a *different* plan. A plan change that did not update the
 *     column would otherwise entitle a Basic subscriber from a Pro version.
 *   • A `draft`. Nothing was ever sold under a draft; a draft is the studio's
 *     scratch copy and its numbers change under the operator's hands.
 *
 * An `archived` version is honoured: archived is what the previous published
 * version becomes, and a subscription left pointing at it is a tenant on old
 * terms — which is the entire reason the history is immutable.
 */

/** The capacity half of a plan, however it was decided. */
export interface EntitlementGrant {
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  moduleIds: readonly string[];
}

/** Where {@link EntitlementGrant} came from, so a caller can say so out loud. */
export type EntitlementSource = 'plan-version' | 'catalogue';

/**
 * The `PlanVersion` row a subscription points at, as much of it as this
 * decision needs. Declared rather than inferred: `prisma generate` does not run
 * in this repo (src/types/prisma-override.d.ts types every delegate as `any`),
 * so an inferred row is `any` here and precisely typed elsewhere.
 */
export interface SubscribedPlanVersion {
  id: string;
  planId: string;
  version: number;
  status: string;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  modules: string[];
}

/** A refused pointer and why, for the log line — never shown to a customer. */
export type PlanVersionRefusal = 'wrong-plan' | 'draft';

export interface ResolvedFromVersion {
  grant: EntitlementGrant;
  versionId: string;
  version: number;
}

/**
 * What the subscription's own version row grants, or `null` if that row must
 * not be honoured. `planId` must already be through `resolvePlanId`, because a
 * retired id (`team`) sits on the subscription while the version carries the
 * replacement (`pro`).
 */
export function grantFromPlanVersion(
  planId: string,
  version: SubscribedPlanVersion | null | undefined
): ResolvedFromVersion | null {
  if (!version) return null;
  if (planVersionRefusal(planId, version) !== null) return null;

  return {
    grant: {
      seats: version.seats,
      workspaces: version.workspaces,
      aiCreditsMonthly: version.aiCreditsMonthly,
      moduleIds: version.modules,
    },
    versionId: version.id,
    version: version.version,
  };
}

/**
 * Why a pointer was refused, or `null` when it is good. Separate from
 * {@link grantFromPlanVersion} so the caller can log the reason without
 * re-deriving it, and so the two rules are stated once.
 */
export function planVersionRefusal(
  planId: string,
  version: SubscribedPlanVersion
): PlanVersionRefusal | null {
  if (version.planId !== planId) return 'wrong-plan';
  if (version.status === 'draft') return 'draft';
  return null;
}
