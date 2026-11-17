import { ModuleId, ModuleStatus, PlanTier } from './types';
import { getAllManifests, getManifest } from './registry';

export interface CanEnableResult {
  allowed: boolean;
  reason?: string;
  missingDependencies?: ModuleId[];
}

const COMING_SOON_REASON = 'Module is coming soon.';

/**
 * A "Yakında" (`statusBadge: 'soon'`) module has no gate that opens it. Every
 * path that switches one on is refused here (FO-40): the enable checks below and
 * the admin write in `updateTenantModuleStatus`.
 */
export function isComingSoon(moduleId: ModuleId): boolean {
  return getManifest(moduleId)?.statusBadge === 'soon';
}

/**
 * The refusal for an admin write of `targetStatus` to a module, or `null` when
 * the write may go ahead. `OFF` closes a module, so it is always allowed; `ON`,
 * `PILOT` and `DEV` open one, so a `soon` module is refused.
 */
export function adminStatusRefusal(moduleId: ModuleId, targetStatus: ModuleStatus): string | null {
  if (targetStatus !== 'OFF' && isComingSoon(moduleId)) return COMING_SOON_REASON;
  return null;
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
  if (isComingSoon(moduleId)) {
    return { allowed: false, reason: COMING_SOON_REASON };
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
  // A "Yakında" module has no gate that opens it: the plan list and the switch
  // are not enough, so it is refused before either is read (FO-40).
  if (isComingSoon(moduleId)) {
    return { allowed: false, reason: COMING_SOON_REASON };
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
 * A viewer built from a signed-in session (`tenantScopeOf`). Both fields come from
 * the session, never from a client argument — a server action is a public POST
 * endpoint. `isMachine` is `never`, so no session value can carry the machine flag:
 * `{ ...session, isMachine: true }` is refused wherever a `ModuleViewer` is taken.
 */
export interface SessionViewer {
  /** Tenant role, as stored on `Membership.role`. */
  role: string;
  /** FonBridge staff — the only people a `DEV` module is for. */
  isPlatformAdmin: boolean;
  isMachine?: never;
}

/**
 * A machine audience: an API key acting for a tenant, not a member. It is open
 * wherever the tenant's managers are (`PILOT`), because a pilot tenant's Partner
 * API integration must keep working while the pilot runs; it is not staff, so
 * `DEV` stays closed to it. Only the API-key viewer in src/lib/api-auth.ts builds
 * one. `kind` is what a session value lacks, so spreading a session with
 * `isMachine: true` does not make a machine viewer (tests/modules/session-viewer.test.ts).
 */
export interface MachineViewer {
  kind: 'machine';
  role: string;
  isPlatformAdmin: boolean;
  isMachine: true;
}

/** Who is asking: a session member or an API key. The gate's parameter type. */
export type ModuleViewer = SessionViewer | MachineViewer;

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
  | 'PLAN_UPGRADE_REQUIRED'
  /**
   * A "Yakında" (`statusBadge: 'soon'`) module: not sold and not built yet, so
   * neither a plan nor a switch opens it (FO-40). Checked before entitlement,
   * because "upgrade your plan" would be untrue — no plan includes it.
   */
  | 'COMING_SOON'
  /**
   * The plan grants the module read only (FO-41: Discover's M1). Reading is
   * allowed; a write (`assertModuleWrite`) and the unmetered API are refused.
   */
  | 'READ_ONLY_PLAN';

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

/**
 * A `beta` module the catalogue does not sell: `planTiers` is empty and `addOnSku`
 * is null, so no plan can ever grant it. Such a module is a staff/pilot preview
 * only (NG-135, patron K-581676): see `isStaffPreviewStatus`.
 */
export function isUnsoldBeta(moduleId: ModuleId): boolean {
  const manifest = getManifest(moduleId);
  return (
    manifest?.statusBadge === 'beta' &&
    manifest.planTiers.length === 0 &&
    (manifest.addOnSku ?? null) === null
  );
}

/**
 * Whether an unsold beta module is open at this `ModuleState` status, before the
 * audience check. Only `DEV` (staff) and `PILOT` (the tenant's managers) open it,
 * so the plan check is skipped for them. `OFF` and `ON` stay closed: there is no
 * plan to upgrade to, so `decideModuleAccess` answers `MODULE_OFF`, not an upgrade.
 */
export function isStaffPreviewStatus(moduleId: ModuleId, status: ModuleStatus): boolean {
  return isUnsoldBeta(moduleId) && (status === 'DEV' || status === 'PILOT');
}

/** A tenant manager, for `isOpenToTenantMembers`: not staff, not an API key. */
const TENANT_MANAGER: SessionViewer = { role: 'TENANT_OWNER', isPlatformAdmin: false };

/**
 * NG-205 (SEC NG-203 D-A2): is `moduleId` at `status` open to the tenant's OWN people (its
 * managers at least), not only to FonBridge staff? The question a data flow INTO a tenant asks:
 * a forwarded lead must land where somebody can open it. Built from the gate's own pieces, not
 * a second copy of them: a "Yakında" module is closed, an unsold beta opens only at its preview
 * statuses (`isStaffPreviewStatus`), and `canAccessStatus` must let a tenant manager in, so DEV
 * (staff only) and OFF are closed. M18 today: PILOT only (ON closes an unsold beta, MODULE_OFF).
 *
 * Status only: plan entitlement of a sold module stays the job of `decideModuleAccess`.
 */
export function isOpenToTenantMembers(moduleId: ModuleId, status: ModuleStatus): boolean {
  if (isComingSoon(moduleId)) return false;
  if (isUnsoldBeta(moduleId) && !isStaffPreviewStatus(moduleId, status)) return false;
  return canAccessStatus(status, TENANT_MANAGER).allowed;
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
 *   SOON      → a "Yakında" module: nothing to enable or buy yet (FO-40). One that
 *               a row still switches on stays ORPHANED, so it can be closed.
 */
export type ModuleCardStatus = 'ACTIVE' | 'AVAILABLE' | 'LOCKED' | 'ORPHANED' | 'SOON';

/**
 * The slice of the settings page's plan view `moduleStatus` reads. Shaped like
 * `ModulesPlanView`, so the page passes its view as it is: `activeModules` and
 * `switchedOnOutsidePlan` together are every module `ModuleState` switched on.
 */
export interface ModuleStatusView {
  entitledModules: readonly ModuleId[];
  activeModules: readonly ModuleId[];
  switchedOnOutsidePlan: readonly ModuleId[];
  /**
   * Unsold beta modules this viewer may open (`decideModuleAccess` allowed, computed on
   * the server). Optional so a plain plan view still works; absent means none.
   */
  previewOpen?: readonly ModuleId[];
}

export function moduleStatus(moduleId: ModuleId, view: ModuleStatusView): ModuleCardStatus {
  const switchedOn =
    view.activeModules.includes(moduleId) || view.switchedOnOutsidePlan.includes(moduleId);
  if (isComingSoon(moduleId)) return switchedOn ? 'ORPHANED' : 'SOON';
  // A staff/pilot preview of an unsold beta is open without a plan (NG-135, K-581676):
  // the decision was taken server-side, so the card shows it as usable.
  if (view.previewOpen?.includes(moduleId)) return 'ACTIVE';
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
