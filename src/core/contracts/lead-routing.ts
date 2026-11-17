/**
 * Lead routing contract (NG-167 / M18).
 *
 * A readiness-scorecard lead (`PublicLead`) goes to the consultancy tenant that serves the
 * visitor's province (patron decision). The map province → tenant is platform data managed
 * ONLY by the platform admin; tenants cannot read it (RLS `system_scope`). This file is what
 * the platform-admin screen (FE-NG, separate card) binds to: types plus the server action
 * signatures implemented in `src/app/[locale]/admin/lead-routes/actions.ts`.
 *
 * Rules fixed here, not in either side:
 *  - consent given + province mapped      → forwarded to that tenant ({@link PublicLeadRouteStatus} 'routed');
 *  - consent given + province empty/unmapped/target refused → NOT forwarded, marked 'unmatched'
 *    with a {@link UnmatchedReason}; it shows in the platform-admin worklist. There is no default tenant;
 *  - no consent → nothing happens at all (no mark, no row).
 *  - one province → at most one ACTIVE tenant; one tenant → many provinces.
 *  - every change to the map writes an AuditEvent ({@link PROVINCE_ROUTE_AUDIT}).
 */

/** Province in `TR_PROVINCES` spelling (src/lib/readiness/provinces.ts). */
export type RouteProvince = string;

export type PublicLeadRouteStatus = 'routed' | 'unmatched';

export type UnmatchedReason =
  /** The visitor left the province empty (or it is not one of the 81 names). */
  | 'province_missing'
  /** No ACTIVE ProvinceLeadRoute for the province. */
  | 'province_unmapped'
  /** Mapped, but M18 refused the target (tenant deleted / not a consultancy / agency). */
  | 'tenant_refused'
  /**
   * NG-204: the map's target is not the organisation the visitor consented to (the map moved after the
   * consent, or the lead carries no recorded recipient). Never forwarded: a new recipient needs a new consent.
   */
  | 'consent_recipient_mismatch';

/** One row of the map. */
export interface ProvinceLeadRouteRow {
  id: string;
  province: RouteProvince;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  active: boolean;
  /** User id of the platform admin who last changed it. */
  updatedBy: string | null;
  /** Display name only (never the e-mail) of that admin; null when unset, unknown or nameless. */
  updatedByName: string | null;
  updatedAt: Date;
}

/** One lead waiting in the platform-admin worklist. Contains the visitor's contact data. */
export interface UnmatchedLeadRow {
  publicLeadId: string;
  name: string;
  email: string;
  organisation: string;
  province: string | null;
  district: string | null;
  reason: UnmatchedReason;
  /** Readiness scorecard level the visitor reached (PublicLead.readinessLevel); null when not recorded. */
  readinessLevel: string | null;
  /** When the lead was left. */
  createdAt: Date;
  /** When it was marked unmatched. */
  markedAt: Date | null;
}

/**
 * NG-182 — a lead that is `routed` to a tenant but has NO copy there: neither a `LeadContact` nor a
 * `Deal` of that tenant carries `sourceRef = public-lead:<id>`. NG-181 keeps such a lead with its
 * tenant on purpose (a port that throws must not let a moved map copy it to a second tenant), so it
 * sits nowhere until someone looks. Read-only: nothing re-routes, copies or deletes it.
 */
export interface StuckRoutedLeadRow {
  publicLeadId: string;
  routedTenantId: string;
  /** Null when the tenant row is gone (hard-deleted). */
  routedTenantName: string | null;
  /** True when the tenant row is gone or soft-deleted. */
  tenantDeleted: boolean;
  /** When the lead was claimed for that tenant. */
  routedAt: Date | null;
  createdAt: Date;
  organisation: string;
  province: string | null;
}

export interface StuckRoutedLeadPage {
  rows: StuckRoutedLeadRow[];
  /** Every stuck lead past the threshold, not only the rows returned. */
  total: number;
  /** The age a routed lead must reach before it counts as stuck (PUBLIC_LEAD_STUCK_AFTER_MINUTES). */
  olderThanMinutes: number;
}

/** SystemAlert source of the `public-lead-stuck` job: one open alert per stuck lead, meta names the lead id only. */
export const STUCK_LEAD_ALERT_SOURCE = 'public-lead-stuck';

/** A tenant the platform admin may pick as a route target (see `isIntakeTenant`). */
export interface IntakeTenantOption {
  id: string;
  name: string;
}

export type ProvinceRouteError =
  | 'invalid_province'
  | 'tenant_not_found'
  /** Deleted tenant, or neither a consultancy nor an agency. */
  | 'tenant_ineligible'
  | 'route_not_found';

export type ProvinceRouteResult =
  | { ok: true; route: ProvinceLeadRouteRow }
  | { ok: false; error: ProvinceRouteError };

export interface SetProvinceLeadRouteInput {
  province: RouteProvince;
  tenantId: string;
}

export interface DeactivateProvinceLeadRouteInput {
  province: RouteProvince;
}

export interface ListUnmatchedLeadsInput {
  /** 1..200, default 50. */
  limit?: number;
  offset?: number;
}

export interface UnmatchedLeadPage {
  rows: UnmatchedLeadRow[];
  total: number;
}

/**
 * Server action signatures (all throw `PlatformAdminRequiredError` for a non-admin — they are
 * their own HTTP entry points, the admin layout is not relied on). Implemented in
 * `src/app/[locale]/admin/lead-routes/actions.ts`, where the exported names carry an `Action`
 * suffix: listProvinceLeadRoutesAction, setProvinceLeadRouteAction, deactivateProvinceLeadRouteAction,
 * listUnmatchedLeadsAction, listIntakeTenantOptionsAction, listStuckRoutedLeadsAction.
 *
 * `setProvinceLeadRoute` is an upsert on the ACTIVE row of the province: no active row → create;
 * an active row for another tenant → move it (the old assignment is replaced, not duplicated);
 * same tenant → no-op (no audit row).
 */
export interface LeadRoutingActions {
  listProvinceLeadRoutes(): Promise<ProvinceLeadRouteRow[]>;
  setProvinceLeadRoute(input: SetProvinceLeadRouteInput): Promise<ProvinceRouteResult>;
  deactivateProvinceLeadRoute(input: DeactivateProvinceLeadRouteInput): Promise<ProvinceRouteResult>;
  listUnmatchedLeads(input?: ListUnmatchedLeadsInput): Promise<UnmatchedLeadPage>;
  /** NG-182, read-only; no re-send. Action: listStuckRoutedLeadsAction. */
  listStuckRoutedLeads(): Promise<StuckRoutedLeadPage>;
  /** Tenants {@link isIntakeTenant} accepts, by name. Action: listIntakeTenantOptionsAction. */
  listIntakeTenantOptions(): Promise<IntakeTenantOption[]>;
}

/** AuditEvent types (tenantId NULL = platform-level; `target` = province, `actorId` = admin user). */
export const PROVINCE_ROUTE_AUDIT = {
  set: 'lead-route.set',
  moved: 'lead-route.moved',
  deactivated: 'lead-route.deactivated',
} as const;
