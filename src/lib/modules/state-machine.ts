import { ModuleId, ModuleStatus, PlanTier } from './types';
import { getAllManifests, getManifest } from './registry';

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
 * `canEnable`, with the plan half answered by what the tenant is actually
 * entitled to (`getEntitlements().allowedModules`) instead of a plan id.
 *
 * TASK-MUMH6W5I1W9WC: the settings page and its action used to feed
 * `canEnable` a plan id, defaulting to `'pro'` when the tenant had no
 * subscription — so a tenant without one was offered, and could write, Pro
 * modules the module gate then refused. A plan id also cannot speak for a
 * contract package (`public-team`) or the free fallback, neither of which a
 * manifest's `planTiers` lists; the entitlement list covers both, plus add-ons,
 * and is the same answer `checkModuleAccess` gives.
 */
export function canEnableEntitled(
  moduleId: ModuleId,
  activeModules: ModuleId[],
  entitledModules: readonly string[]
): CanEnableResult {
  const manifest = getManifest(moduleId);
  if (!manifest) {
    return { allowed: false, reason: 'Module not found.' };
  }

  if (!entitledModules.includes(moduleId)) {
    return { allowed: false, reason: 'Plan upgrade required.' };
  }

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
  /** FonBridge staff — the only people a `DEV` module is for. */
  isPlatformAdmin: boolean;
  /**
   * A machine audience: an API key acting for a tenant, not a member. It is open
   * wherever the tenant's managers are (`PILOT`), because a pilot tenant's Partner
   * API integration must keep working while the pilot runs; it is not staff, so
   * `DEV` stays closed to it. Only the API-key path sets this — a session never does.
   */
  isMachine?: boolean;
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
  | 'PILOT_MANAGERS_ONLY'
  /**
   * The tenant's plan does not include the module — CLAUDE.md §4: "a module may
   * be `on` and still be unusable when it is outside the plan". Distinct from
   * `MODULE_OFF`, which says an administrator closed something the tenant owns
   * and can reopen; this one is answered at checkout, not in settings.
   */
  | 'PLAN_UPGRADE_REQUIRED';

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
 *   DEV   → FonBridge staff only. Work in progress; the tenant's own owner is *not*
 *           an insider, which is exactly the case the previous `role === 'TENANT_OWNER'`
 *           test got wrong: every tenant has an owner, so DEV let everyone in.
 *   PILOT → the tenant's managers, plus staff, plus the tenant's API keys (machine).
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
      return viewer.isPlatformAdmin || viewer.isMachine === true || PILOT_ROLES.includes(viewer.role)
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

// ───────────────────────────── Plan × switch → card status ─────────────────────────────

/**
 * Where a module stands for a tenant, from the two facts the module gate checks:
 * does the plan (plus add-ons) entitle it, and has `ModuleState` switched it on.
 *
 *   ACTIVE    → entitled and switched on: usable.
 *   AVAILABLE → entitled, switched off: the tenant can open it in settings.
 *   LOCKED    → not entitled, never switched on: answered at checkout.
 *   ORPHANED  → switched on but no longer entitled (left behind by a downgrade).
 */
export type ModuleCardStatus = 'ACTIVE' | 'AVAILABLE' | 'LOCKED' | 'ORPHANED';

/**
 * The slice of the settings page's plan view `moduleStatus` reads. Shaped like
 * `ModulesPlanView`, so the page passes its view as it is: `activeModules` and
 * `switchedOnOutsidePlan` together are every module `ModuleState` switched on.
 */
export interface ModuleStatusView {
  entitledModules: readonly ModuleId[];
  activeModules: readonly ModuleId[];
  switchedOnOutsidePlan: readonly ModuleId[];
}

export function moduleStatus(moduleId: ModuleId, view: ModuleStatusView): ModuleCardStatus {
  const switchedOn =
    view.activeModules.includes(moduleId) || view.switchedOnOutsidePlan.includes(moduleId);
  if (view.entitledModules.includes(moduleId)) return switchedOn ? 'ACTIVE' : 'AVAILABLE';
  return switchedOn ? 'ORPHANED' : 'LOCKED';
}

// ───────────────────────────── Transitive requirements ─────────────────────────────

/** Module → its hard dependencies (`requires[]`), as declared in the manifests. */
export type RequirementGraph = Readonly<Record<string, readonly string[]>>;

export function requirementGraph(): Record<ModuleId, ModuleId[]> {
  return Object.fromEntries(getAllManifests().map((m) => [m.id, m.requires])) as Record<
    ModuleId,
    ModuleId[]
  >;
}

/** `M2` < `M10`: module ids sort by their number, not as strings. */
function byModuleNumber(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b);
}

/**
 * The first dependency cycle in `graph`, as a closed path (`['M1', 'M4', 'M1']`),
 * or `null` when the graph is acyclic. `requirementChain` and `getDisableCascade`
 * both assume there is none.
 */
export function findDependencyCycle(graph: RequirementGraph = requirementGraph()): string[] | null {
  const done = new Set<string>();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    const onPath = path.indexOf(id);
    if (onPath !== -1) return [...path.slice(onPath), id];
    if (done.has(id)) return null;
    path.push(id);
    for (const dep of graph[id] ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    path.pop();
    done.add(id);
    return null;
  };

  for (const id of Object.keys(graph).sort(byModuleNumber)) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Every module `moduleId` needs switched on first, directly or through another
 * dependency — each once, dependencies before the modules that need them, ties
 * in module-number order. For M11: `['M1', 'M2', 'M3', 'M5', 'M8']`.
 *
 * Throws on a cycle rather than returning a partial chain.
 */
export function requirementChain(moduleId: ModuleId): ModuleId[];
export function requirementChain(moduleId: string, graph: RequirementGraph): string[];
export function requirementChain(
  moduleId: string,
  graph: RequirementGraph = requirementGraph()
): string[] {
  const cycle = findDependencyCycle(graph);
  if (cycle) throw new Error(`Module dependency cycle: ${cycle.join(' → ')}`);

  const needed = new Set<string>();
  const stack = [...(graph[moduleId] ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (needed.has(id)) continue;
    needed.add(id);
    stack.push(...(graph[id] ?? []));
  }

  // Layered topological order: place whatever has all of its requirements placed.
  const chain: string[] = [];
  while (chain.length < needed.size) {
    const ready = [...needed]
      .filter((id) => !chain.includes(id))
      .filter((id) => (graph[id] ?? []).every((dep) => chain.includes(dep)))
      .sort(byModuleNumber);
    chain.push(...ready);
  }
  return chain;
}
