import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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
 */

export interface ModuleAccessResult {
  allowed: boolean;
  status: ModuleStatus;
  /** Stable code, translated by the caller. Never a server-authored sentence. */
  reason?: ModuleDenyReason;
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
 * Read the module's status for the session tenant and decide.
 *
 * A missing `ModuleState` row means the tenant was never granted the module, which is
 * `OFF` — the same default the Prisma column carries.
 */
export async function checkModuleAccess(moduleId: ModuleId): Promise<ModuleAccessResult> {
  const scope = tenantScopeOf(await auth());

  if (!scope) {
    return { allowed: false, status: 'OFF', reason: 'NO_TENANT' };
  }

  const state = await prisma.moduleState.findUnique({
    where: { tenantId_moduleId: { tenantId: scope.tenantId, moduleId } },
    select: { status: true },
  });

  const status = (state?.status ?? 'OFF') as ModuleStatus;
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
 * debits `CreditLedger` (src/lib/ai/llm.ts) the moment it is reached, so a closed
 * module that was checked afterwards would still have cost the tenant credits.
 */
export async function assertModuleAccess(moduleId: ModuleId): Promise<void> {
  const access = await checkModuleAccess(moduleId);
  if (!access.allowed) {
    throw new ModuleAccessError(moduleId, access.status, access.reason ?? 'MODULE_OFF');
  }
}
