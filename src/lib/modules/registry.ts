import { ModuleId, ModuleManifest, ModuleNavItem } from './types';
import { canonicalWorkspaceRoute, isKnownWorkspaceRoute } from './route-catalog';
import { getWorkspaceRoute, type WorkspaceRouteKey } from '../routes';
import { m0Manifest } from '../../modules/m0/manifest';
import { m1Manifest } from '../../modules/m1/manifest';
import { m2Manifest } from '../../modules/m2/manifest';
import { m3Manifest } from '../../modules/m3/manifest';
import { m4Manifest } from '../../modules/m4/manifest';
import { m5Manifest } from '../../modules/m5/manifest';
import { m6Manifest } from '../../modules/m6/manifest';
import { m7Manifest } from '../../modules/m7/manifest';
import { m8Manifest } from '../../modules/m8/manifest';
import { m9Manifest } from '../../modules/m9/manifest';
import { m10Manifest } from '../../modules/m10/manifest';
import { m11Manifest } from '../../modules/m11/manifest';
import { m12Manifest } from '../../modules/m12/manifest';
import { m13Manifest } from '../../modules/m13/manifest';
import { m14Manifest } from '../../modules/m14/manifest';
import { m15Manifest } from '../../modules/m15/manifest';
import { m16Manifest } from '../../modules/m16/manifest';
import { m17Manifest } from '../../modules/m17/manifest';
import { m18Manifest } from '../../modules/m18/manifest';

export const moduleRegistry: Record<ModuleId, ModuleManifest> = {
  M0: m0Manifest,
  M1: m1Manifest,
  M2: m2Manifest,
  M3: m3Manifest,
  M4: m4Manifest,
  M5: m5Manifest,
  M6: m6Manifest,
  M7: m7Manifest,
  M8: m8Manifest,
  M9: m9Manifest,
  M10: m10Manifest,
  M11: m11Manifest,
  M12: m12Manifest,
  M13: m13Manifest,
  M14: m14Manifest,
  M15: m15Manifest,
  M16: m16Manifest,
  M17: m17Manifest,
  M18: m18Manifest,
};

export const getManifest = (id: ModuleId): ModuleManifest => moduleRegistry[id];
export const getAllManifests = (): ModuleManifest[] => Object.values(moduleRegistry);

// A type alias rather than an interface so it passes straight to `t(key, counts)`,
// whose values parameter wants an index signature.
export type ModuleCounts = {
  /** Every registered module. */
  total: number;
  /** Modules a tenant can use today: every badge except `soon` (GA and beta). */
  active: number;
  /** "Yakında" modules (`statusBadge: 'soon'`), the same test as `isComingSoon`. */
  soon: number;
};

/**
 * The module counts every user-facing text shows ("{active} aktif modül + {soon} yakında",
 * FO-171 / K-572973). Copy never carries the numbers: it takes these as ICU
 * arguments, so a module that moves from `soon` to `ga`, or a new manifest,
 * changes the text by itself. `tests/modules/module-count-copy.test.ts` keeps
 * hard-coded counts out of `src/` and `messages/`.
 */
export function getModuleCounts(): ModuleCounts {
  const manifests = getAllManifests();
  const soon = manifests.filter((m) => m.statusBadge === 'soon').length;
  return { total: manifests.length, active: manifests.length - soon, soon };
}

/** A manifest nav/tab item with the module that contributes it. */
export interface ModuleEntry extends ModuleNavItem {
  moduleId: ModuleId;
}

function entriesOf(
  pick: (m: ModuleManifest) => readonly ModuleNavItem[] | undefined,
  moduleIds: readonly ModuleId[],
): ModuleEntry[] {
  return getAllManifests()
    .filter((m) => moduleIds.includes(m.id))
    .flatMap((m) => (pick(m) ?? []).map((item) => ({ ...item, moduleId: m.id })))
    .sort((a, b) => a.order - b.order);
}

/** Sidebar entries (`nav[]`) of the given modules, in sidebar order. */
export function getSidebarEntries(moduleIds: readonly ModuleId[]): ModuleEntry[] {
  return entriesOf((m) => m.nav, moduleIds);
}

/** Opportunity detail tabs (`opportunityTabs[]`) of the given modules, in tab order. */
export function getOpportunityTabs(moduleIds: readonly ModuleId[]): ModuleEntry[] {
  return entriesOf((m) => m.opportunityTabs, moduleIds);
}

/**
 * The catalog page a route key opens, e.g. `opportunityMatching` →
 * `opportunities/[id]/matching`. Read off `getWorkspaceRoute` itself, so the URL
 * builder stays the one place that spells paths.
 */
export function workspaceRoutePath(key: WorkspaceRouteKey): string {
  const prefix = '/en/__ws__/';
  return canonicalWorkspaceRoute(getWorkspaceRoute(key, 'en', '__ws__', '[id]').slice(prefix.length));
}

export interface RouteOwnerInfo {
  moduleId: ModuleId;
  permission?: string;
}

/**
 * Resolve the module that owns a workspace route.
 * Every manifest route has exactly one owner; double ownership is an error
 * caught in validateRegistry() and fails the build.
 */
export function getRouteOwner(path: string): RouteOwnerInfo | null {
  const manifests = getAllManifests();
  for (const m of manifests) {
    for (const route of m.routes) {
      if (route.path === path) {
        return {
          moduleId: m.id,
          permission: route.permission,
        };
      }
    }
  }
  return null;
}

/**
 * Structural invariants of the module registry.
 *
 * The manifest fields (`routes`, `nav`, `permissions`, `tables`) are only worth
 * anything if they describe the app that actually exists, so they are checked
 * rather than trusted. This function covers the checks that need no filesystem;
 * `tests/modules/route-catalog.test.ts` adds the ones that do (pages on disk,
 * i18n keys, Prisma models) and fails the build when the two drift apart.
 *
 * Returns a list of human-readable problems — empty means the registry is sound.
 */
export function validateRegistry(): string[] {
  const problems: string[] = [];
  const manifests = getAllManifests();
  const knownIds = new Set(manifests.map((m) => m.id));
  const routeOwner = new Map<string, ModuleId>();

  for (const m of manifests) {
    if (moduleRegistry[m.id] !== m) {
      problems.push(`${m.id}: registered under a different key than its own id`);
    }

    for (const dep of [...m.requires, ...m.recommends]) {
      if (!knownIds.has(dep)) problems.push(`${m.id}: depends on unknown module ${dep}`);
      if (dep === m.id) problems.push(`${m.id}: depends on itself`);
    }

    const ownPermissions = new Set(m.permissions.map((p) => p.id));
    for (const p of m.permissions) {
      if (!p.id.startsWith(`${m.key}:`)) {
        problems.push(`${m.id}: permission "${p.id}" is not namespaced under "${m.key}:"`);
      }
    }

    for (const route of m.routes) {
      if (!isKnownWorkspaceRoute(route.path)) {
        problems.push(`${m.id}: route "${route.path}" is not a page in WORKSPACE_ROUTE_CATALOG`);
      }
      const owner = routeOwner.get(route.path);
      if (owner) {
        problems.push(`route "${route.path}" is claimed by both ${owner} and ${m.id}`);
      } else {
        routeOwner.set(route.path, m.id);
      }
      if (route.permission && !ownPermissions.has(route.permission)) {
        problems.push(
          `${m.id}: route "${route.path}" requires "${route.permission}", which the module does not declare`
        );
      }
    }

    // A nav entry or tab that opens another module's page would show the link
    // under one module's switch and gate it behind another's.
    const ownPaths = new Set(m.routes.map((r) => r.path));
    for (const item of [...m.nav, ...(m.opportunityTabs ?? [])]) {
      const target = workspaceRoutePath(item.routeKey);
      if (!ownPaths.has(target)) {
        problems.push(`${m.id}: entry "${item.labelKey}" opens "${target}", which is not one of its routes`);
      }
    }
    for (const tab of m.opportunityTabs ?? []) {
      if (!workspaceRoutePath(tab.routeKey).includes('[id]')) {
        problems.push(`${m.id}: opportunity tab "${tab.labelKey}" opens a page that is not opportunity-scoped`);
      }
    }

    if (m.tables.length === 0) problems.push(`${m.id}: declares no tables`);
    if (!/^\d+\.\d+$/.test(m.version)) {
      problems.push(`${m.id}: version "${m.version}" is not <major>.<minor>`);
    }
  }

  return problems;
}
