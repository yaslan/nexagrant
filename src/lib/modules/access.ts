import { auth } from '@/lib/auth';
import { getEntitlements } from '@/lib/billing';
import { planNamesGrantingModule } from '@/lib/billing/catalog';
import { withTenant } from '@/lib/db';
import { tenantScopeOf } from '@/lib/tenant';
import { canAccessStatus, type ModuleDenyReason } from '@/lib/modules/state-machine';
import type { ModuleId, ModuleStatus } from '@/lib/modules/types';

/**
 * The module gate — the one place that turns a `ModuleState` row into an answer.
 *
 * This file existed before but nothing called it, so a module moved to `DEV` or
 * `OFF` in `/admin/modules` stayed fully usable by everyone
 * (docs/agent-results/TASK-MTQV9DOEBLYES-blockzincir-pm.md §4). Pages now go through
 * `moduleGate()` in ./guard.tsx and server actions through `assertModuleAccess()`
 * below; the status semantics themselves live in `canAccessStatus()` in
 * ./state-machine.ts, per CLAUDE.md §3 ("dependency and cascade logic only in the
 * state machine; the UI calls it, never copies it").
 *
 * TASK-MTQZ8MVAU3J7I — the gate then read *only* `ModuleState`, so CLAUDE.md §4
 * ("a module may be `on` and still be outside the plan") was unenforced: the demo
 * tenant sat on `pro`, whose catalogue grant is M1/M2/M3/M4/M5/M8, while its
 * `ModuleState` row for M10 said `ON`, and every M10 page and action opened. A row
 * left behind by a downgrade, or written straight into the database, was a free
 * upgrade. The plan half of the decision is now checked here, in the same call, so
 * no caller can hold one gate and miss the other.
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
}

/** Thrown by `assertModuleAccess`, so a caller can tell a gate refusal from a crash. */
export class ModuleAccessError extends Error {
  readonly code = 'MODULE_ACCESS_DENIED';

  constructor(
    readonly moduleId: ModuleId,
    readonly status: ModuleStatus,
    readonly reason: ModuleDenyReason,
  ) {
    super(`Module ${moduleId} is not available (${status}/${reason}).`);
    this.name = 'ModuleAccessError';
  }
}

/**
 * Decide whether the session's viewer may use `moduleId`, on two facts:
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
export async function checkModuleAccess(moduleId: ModuleId): Promise<ModuleAccessResult> {
  const scope = tenantScopeOf(await auth());

  if (!scope) {
    return { allowed: false, status: 'OFF', reason: 'NO_TENANT' };
  }

  // Both facts are independent reads; neither gates the other's query.
  const [state, entitlements] = await Promise.all([
    withTenant(scope.tenantId, (tx) =>
      tx.moduleState.findUnique({
        where: { tenantId_moduleId: { tenantId: scope.tenantId, moduleId } },
        select: { status: true },
      })
    ),
    withTenant(scope.tenantId, (tx) =>
      getEntitlements(scope.tenantId, tx)
    ),
  ]);

  const status = (state?.status ?? 'OFF') as ModuleStatus;

  if (!entitlements.allowedModules.includes(moduleId)) {
    return {
      allowed: false,
      status,
      reason: 'PLAN_UPGRADE_REQUIRED',
      requiredPlans: planNamesGrantingModule(moduleId),
    };
  }

  const decision = canAccessStatus(status, {
    role: scope.role,
    isPlatformAdmin: scope.isPlatformAdmin,
  });

  return decision.allowed
    ? { allowed: true, status }
    : { allowed: false, status, reason: decision.reason ?? 'MODULE_OFF' };
}

/**
 * For server actions. Throws before any side effect runs.
 *
 * Call it as the *first* statement of the action, above the LLM call: hiding a button
 * in the client is not a gate, and `generateText()` writes an `AiUsageLog` row and
 * debits `CreditLedger` (src/lib/llm.ts) the moment it is reached, so a closed
 * module that was checked afterwards would still have cost the tenant credits.
 */
export async function assertModuleAccess(moduleId: ModuleId): Promise<void> {
  const access = await checkModuleAccess(moduleId);
  if (!access.allowed) {
    throw new ModuleAccessError(moduleId, access.status, access.reason ?? 'MODULE_OFF');
  }
}
