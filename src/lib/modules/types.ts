import type { Role } from '@prisma/client';
import type { WorkspaceRouteKey } from '@/lib/routes';

export type ModuleId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9'
  | 'M10'
  | 'M11';

export type ModuleStatus = 'OFF' | 'DEV' | 'PILOT' | 'ON';

export type PlanTier = 'discover' | 'starter' | 'team' | 'business' | 'enterprise';

/**
 * Module-scoped capability id, always `<moduleKey>:<verb>`.
 * A permission is owned by exactly one module and may only be referenced by
 * that module's own routes — enforced in `validateRegistry()`.
 */
export type ModulePermissionId = string;

export interface ModulePermission {
  id: ModulePermissionId;
  /**
   * Lowest role in the tenant hierarchy that holds this permission.
   * Compared with `canRoleApprove()` from `@/lib/rbac` so the module system
   * does not grow a second, divergent role ladder.
   */
  minRole: Role;
}

export interface ModuleRoute {
  /**
   * Canonical page path under `/[locale]/[workspace]/`, without a leading slash
   * (e.g. `partners/[pic]`). Must exist in `WORKSPACE_ROUTE_CATALOG`, i.e. must
   * correspond to a real file in `src/app/[locale]/(app)/[workspace]/`.
   */
  path: string;
  /** Permission (owned by this module) additionally required to open the route. */
  permission?: ModulePermissionId;
}

export interface ModuleNavItem {
  /** Key inside the `Navigation` i18n namespace; must exist in tr.json and en.json. */
  labelKey: string;
  /** Resolved through `getWorkspaceRoute()`, so tr/en URL aliases stay in one place. */
  routeKey: WorkspaceRouteKey;
  /** Sort order within the workspace section of the sidebar. */
  order: number;
}

export interface ModuleManifest {
  id: ModuleId;
  key: string;
  name: string;
  description?: string;
  /** Semver of the module contract; mirrored into `ModuleCatalog.version`. */
  version: string;
  /** Hard dependencies — all must be enabled before this module can be enabled. */
  requires: ModuleId[];
  recommends: ModuleId[];
  /** Plan tiers that include this module without an add-on. */
  planTiers: PlanTier[];
  /** Add-on SKU that grants the module outside `planTiers` (see `AddOnCatalog`). */
  addOnSku?: string | null;
  /** Every workspace page this module owns. A page has exactly one owner. */
  routes: ModuleRoute[];
  /** Sidebar entries this module contributes when it is visible. */
  nav: ModuleNavItem[];
  /** Capabilities this module defines; referenced by its own routes. */
  permissions: ModulePermission[];
  /** Prisma models this module reads or writes; validated against schema.prisma. */
  tables: string[];
  isActive: boolean;
}
