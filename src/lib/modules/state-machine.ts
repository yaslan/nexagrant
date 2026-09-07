import { ModuleId, ModuleStatus, PlanTier } from './types';
import { getManifest, getAllManifests } from './registry';

export interface CanEnableResult {
  allowed: boolean;
  reason?: string;
  missingDependencies?: ModuleId[];
}

/**
 * Checks if a module can be enabled based on its dependencies and the current plan tier.
 */
export function canEnable(
  moduleId: ModuleId,
  activeModules: ModuleId[],
  plan: PlanTier
): CanEnableResult {
  const manifest = getManifest(moduleId);
  if (!manifest) {
    return { allowed: false, reason: 'Module not found.' };
  }

  // Check plan constraint
  if (!manifest.planTiers.includes(plan)) {
    return { allowed: false, reason: 'Plan upgrade required.' };
  }

  // Check dependencies
  const missingDependencies = manifest.requires.filter(
    (req) => !activeModules.includes(req)
  );

  if (missingDependencies.length > 0) {
    return { allowed: false, reason: 'Missing dependencies.', missingDependencies };
  }

  return { allowed: true };
}

/**
 * Returns a list of module IDs that would be disabled as a side effect
 * of disabling the given module (due to dependency constraints).
 * Computes this recursively.
 */
export function getDisableCascade(
  moduleIdToDisable: ModuleId,
  activeModules: ModuleId[]
): ModuleId[] {
  const cascadeSet = new Set<ModuleId>([moduleIdToDisable]);
  let added = true;

  // Iteratively find modules that depend on any module in the cascade set
  while (added) {
    added = false;
    for (const activeMod of activeModules) {
      if (cascadeSet.has(activeMod)) continue;

      const manifest = getManifest(activeMod);
      const hasMissingDeps = manifest.requires.some((req) => cascadeSet.has(req));

      if (hasMissingDeps) {
        cascadeSet.add(activeMod);
        added = true;
      }
    }
  }

  // Exclude the module being explicitly disabled from the cascade result list
  cascadeSet.delete(moduleIdToDisable);
  return Array.from(cascadeSet);
}

// ─────────────────────────── Status → access decision ────────────────────────────

/**
 * Who is asking. Both fields come from the session (`tenantScopeOf`), never from
 * a client argument — a server action is a public POST endpoint.
 */
export interface ModuleViewer {
  /** Tenant role, as stored on `Membership.role`. */
  role: string;
  /** Fabrika staff — the only people a `DEV` module is for. */
  isPlatformAdmin: boolean;
}

/**
 * Why access was refused. A stable code rather than a sentence, so the UI can
 * translate it (CLAUDE.md §8) instead of printing an English string from the server.
 */
export type ModuleDenyReason =
  | 'NOT_AUTHENTICATED'
  | 'NO_TENANT'
  | 'MODULE_OFF'
  | 'DEV_INTERNAL_ONLY'
  | 'PILOT_MANAGERS_ONLY';

export interface ModuleAccessDecision {
  allowed: boolean;
  reason?: ModuleDenyReason;
}

/** Roles that run the tenant's pipeline; the audience a PILOT module is opened to. */
const PILOT_ROLES = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER'];

/**
 * The whole meaning of `ModuleStatus`, in one pure function — see
 * `docs/adr/ADR-0001-module-state-access-gate.md`.
 *
 *   OFF   → nobody, platform admins included. "This tenant does not have it."
 *   DEV   → Fabrika staff only. Work in progress; the tenant's own owner is *not*
 *           an insider, which is exactly the case the previous `role === 'TENANT_OWNER'`
 *           test got wrong: every tenant has an owner, so DEV let everyone in.
 *   PILOT → the tenant's managers, plus staff.
 *   ON    → every member of the tenant.
 *
 * Role-level permissions (`evaluator:write`) and plan entitlement are separate gates
 * layered on top; this one only answers "is the module open to this viewer at all".
 */
export function canAccessStatus(
  status: ModuleStatus,
  viewer: ModuleViewer,
): ModuleAccessDecision {
  switch (status) {
    case 'ON':
      return { allowed: true };
    case 'PILOT':
      return viewer.isPlatformAdmin || PILOT_ROLES.includes(viewer.role)
        ? { allowed: true }
        : { allowed: false, reason: 'PILOT_MANAGERS_ONLY' };
    case 'DEV':
      return viewer.isPlatformAdmin
        ? { allowed: true }
        : { allowed: false, reason: 'DEV_INTERNAL_ONLY' };
    case 'OFF':
    default:
      return { allowed: false, reason: 'MODULE_OFF' };
  }
}
