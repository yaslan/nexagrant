import type { Role } from '@prisma/client';
import type { WorkspaceRouteKey } from '@/lib/routes';
import type { PlanId } from '@/lib/billing/catalog';

export type ModuleId =
  | 'M0'
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
  | 'M11'
  | 'M12'
  | 'M13'
  | 'M14'
  | 'M15'
  | 'M16'
  | 'M17';

export type ModuleStatus = 'OFF' | 'DEV' | 'PILOT' | 'ON';

/**
 * The plan tiers module gating speaks in. Re-exported from the billing
 * catalogue (TASK-MTR6QIE05ZKNH) rather than re-typed: the EUR ladder
 * `discover/starter/team/business/enterprise` is retired, and "which plan opens
 * this module" is now one fact, declared in `PLAN_GRANTS`.
 *
 * Only *purchasable* plans appear here, which is what `canEnable` has always
 * meant by `planTiers`: the free fallback plan is not a tier you can be gated
 * up to.
 */
export type PlanTier = PlanId;

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

/**
 * Filter tab / summary card a module sits under on the modules page. The
 * grouping is a property of the module, so the page counts it rather than
 * hard-coding which ids belong where.
 */
export type ModuleCategory = 'core' | 'ai' | 'tools';

/** The five proposal gates, in pipeline order (docs/BETA_GUIDE.md "Kapı modeli"). */
export const PIPELINE_STAGES = ['G0', 'G1', 'G2', 'G3', 'G4'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Release maturity shown on the module card: GA / Beta / Yakında. */
export type ModuleStatusBadge = 'ga' | 'beta' | 'soon';

/**
 * Usage limits a module advertises. `null` on a field means no limit has been
 * decided — the card must not invent one (CLAUDE.md §7: a figure shown to a
 * user comes from a record, not from the code path).
 */
export interface ModuleQuota {
  aiCallsMonthly: number | null;
  recordLimit: number | null;
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
  /**
   * Tabs this module contributes to the opportunity detail page when it is
   * visible. `labelKey` lives in the `Pipeline.detail.modules` i18n namespace;
   * `routeKey` is an opportunity-scoped route, resolved with the opportunity id.
   * Omitted when the module has no per-opportunity page.
   */
  opportunityTabs?: ModuleNavItem[];
  /** Capabilities this module defines; referenced by its own routes. */
  permissions: ModulePermission[];
  /** Prisma models this module reads or writes; validated against schema.prisma. */
  tables: string[];
  isActive: boolean;
  category: ModuleCategory;
  /** Pipeline gates this module does work in; drives `pipelineCoverage`. */
  stages: PipelineStage[];
  statusBadge: ModuleStatusBadge;
  /** Public documentation page; `null` until one is published. */
  docsUrl: string | null;
  /** `null` when the module advertises no quota at all. */
  quota: ModuleQuota | null;
  /**
   * FO-41: whether a tenant may buy this module on its own, outside its plan.
   * True only together with an `addOnSku` that `AddOnCatalog` sells; no module
   * is sold that way yet, so every manifest says `false`.
   */
  addonPurchasable: boolean;
  /**
   * FO-41: length of the "try it" period a tenant whose plan lacks the module
   * may start, in days; `null` when the module offers none (every "Yakında"
   * module). Read by the module card; the trial entitlement itself is not
   * built yet.
   */
  trialDays: number | null;
  /**
   * Programme templates this module ships with (data only; the template bodies
   * live with the module). Empty when the module has none.
   */
  programTemplates?: readonly string[];
}
