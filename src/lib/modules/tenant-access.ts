import { getEntitlements } from '@/lib/billing';
import { planNamesGrantingModule, type ModuleLimits } from '@/lib/billing/catalog';
import { withTenant } from '@/lib/db';
import { canAccessStatus, isComingSoon, type ModuleDenyReason, type ModuleViewer } from '@/lib/modules/state-machine';
import type { ModuleId, ModuleStatus } from '@/lib/modules/types';

/**
 * The module decision for a tenant id, with no session behind it.
 *
 * It lives apart from ./access.ts on purpose: access.ts imports `auth()`, which
 * builds the next-auth adapter at load time, and an API-key route has no session
 * to give it. Keeping the decision here lets `authenticateApiKey` ask the same
 * question the session gate asks, through the same `decideModuleAccess` below —
 * one copy of the two facts (entitlement, then status), not two.
 */

export interface ModuleAccessResult {
  allowed: boolean;
  status: ModuleStatus;
  /** Stable code, translated by the caller. Never a server-authored sentence. */
  reason?: ModuleDenyReason;
  /**
   * Plans that *do* include this module, by display name, for a
   * `PLAN_UPGRADE_REQUIRED` refusal. Read from `PLAN_GRANTS`, never re-typed.
   */
  requiredPlans?: string[];
  /**
   * FO-41: set on an allowed answer when the plan grants the module only in a
   * limited form (read only, metered searches). Absent means in full.
   */
  limits?: ModuleLimits;
}

/**
 * Decide whether `viewer` may use `moduleId` in `tenantId`, on two facts:
 *
 *   1. **Entitlement** — does the tenant's plan (plus its active add-ons) include
 *      the module at all? Read through `getEntitlements`, which computes from
 *      `PLAN_GRANTS` in the billing catalogue rather than from the `Plan` row, so
 *      a stale or hand-edited row cannot hand out a module.
 *   2. **Status** — has the tenant switched it on, and is this viewer in the
 *      audience that `ModuleState` opens it to (`canAccessStatus`)?
 *
 * Entitlement is checked first because it produces the truthful answer: a tenant
 * that never bought the module must be told to upgrade, not that "your workspace
 * administrator turned it off", which invites them to go and turn on something
 * they do not own. The order only matters for the wording — both refusals deny.
 *
 * A missing `ModuleState` row means the tenant was never granted the module, which
 * is `OFF` — the same default the Prisma column carries.
 *
 * The plan gate binds platform admins too. Their bypass in `canAccessStatus` is
 * about *status* (`DEV` is staff-only work in progress); entitlement is a fact
 * about what the tenant bought, and staff standing inside a tenant workspace do
 * not change it. Opening a module for a tenant below its plan is done by selling
 * it — an `AddOn` row, which `getEntitlements` already honours — not by a session.
 */
export async function checkModuleAccessForTenant(
  tenantId: string,
  moduleId: ModuleId,
  viewer: ModuleViewer,
): Promise<ModuleAccessResult> {
  // Both facts are independent reads; neither gates the other's query.
  const [state, entitlements] = await Promise.all([
    withTenant(tenantId, (tx) =>
      tx.moduleState.findUnique({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        select: { status: true },
      })
    ),
    withTenant(tenantId, (tx) =>
      getEntitlements(tenantId, tx)
    ),
  ]);

  return decideModuleAccess(
    moduleId,
    (state?.status ?? 'OFF') as ModuleStatus,
    entitlements.allowedModules,
    viewer,
    entitlements.moduleLimits?.[moduleId],
  );
}

/**
 * The two-fact decision itself, shared by the session gate (`checkModuleAccess`
 * in ./access.ts, one module, for a page or action) and `listAccessibleModules`
 * (every module, for navigation), and by `checkModuleAccessForTenant` for API
 * keys, so the entry points a user sees, the door they knock on and the API
 * route they call can never disagree.
 */
export function decideModuleAccess(
  moduleId: ModuleId,
  status: ModuleStatus,
  allowedModules: readonly string[],
  viewer: ModuleViewer,
  limits?: ModuleLimits,
): ModuleAccessResult {
  if (isComingSoon(moduleId)) {
    return { allowed: false, status, reason: 'COMING_SOON' };
  }

  if (!allowedModules.includes(moduleId)) {
    return {
      allowed: false,
      status,
      reason: 'PLAN_UPGRADE_REQUIRED',
      requiredPlans: planNamesGrantingModule(moduleId),
    };
  }

  const decision = canAccessStatus(status, viewer);

  if (!decision.allowed) {
    return { allowed: false, status, reason: decision.reason ?? 'MODULE_OFF' };
  }
  return limits ? { allowed: true, status, limits } : { allowed: true, status };
}
