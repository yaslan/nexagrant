import { Role } from "@prisma/client";

/**
 * NG-272: the server acting for a call with no member behind it (an API key). Not a
 * membership role and not stored anywhere: `can` skips the role table for it, so the
 * decision left is the plan and module the caller passes as the resource.
 *
 * A symbol, not a string (NG-272 review B-1): session roles are plain strings cast to
 * `Role`, and a string "SYSTEM" in that path would skip the role table too. No string can
 * equal a symbol, so only code that holds this constant can act as the system.
 */
export const SYSTEM_ROLE: unique symbol = Symbol("SYSTEM_ROLE");
export type ActingRole = Role | typeof SYSTEM_ROLE;

export type Action =
  | "manage_billing"
  | "manage_modules"
  | "manage_users"
  | "manage_workspaces"
  | "evaluate_gates"
  | "edit_proposal"
  | "view_proposal"
  | "contribute_assigned"
  | "request_dual_approval"
  | "manage_approvals"
  | "approve_dual_approval"
  /** M1 Partner Search announcements: read and export (FO-61). Not for guest partners. */
  | "view_partner_search"
  /** M18 Client Pipeline (NG-143): read = MEMBER+, write = WRITER+, admin = TENANT_ADMIN+. */
  | "client_pipeline_read"
  | "client_pipeline_write"
  | "client_pipeline_admin"
  /** NG-248 (K-584216): the agency co-brand (name + logo) in the app shell and its logo route. Not for guest partners. */
  | "view_tenant_branding"
  /**
   * NG-250: the call search (`/api/cagrilar`). Every role keeps it, a guest partner too, so the
   * list keeps the audience it had before the NexaGrant plan gate; the plan narrows it
   * (`call_search`, src/lib/billing/nexagrant/bindings.ts), never the role.
   */
  | "search_calls";

const rolePermissions: Record<Role, Action[]> = {
  TENANT_OWNER: [
    "manage_billing",
    "manage_modules",
    "manage_users",
    "manage_workspaces",
    "evaluate_gates",
    "edit_proposal",
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "manage_approvals",
    "approve_dual_approval",
    "view_partner_search",
    "client_pipeline_read",
    "client_pipeline_write",
    "client_pipeline_admin",
    "view_tenant_branding",
    "search_calls",
  ],
  TENANT_ADMIN: [
    "manage_users",
    "manage_workspaces",
    "evaluate_gates",
    "edit_proposal",
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "manage_approvals",
    "approve_dual_approval",
    "view_partner_search",
    "client_pipeline_read",
    "client_pipeline_write",
    "client_pipeline_admin",
    "view_tenant_branding",
    "search_calls",
  ],
  PIPELINE_MANAGER: [
    "manage_workspaces",
    "evaluate_gates",
    "edit_proposal",
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "manage_approvals",
    "view_partner_search",
    "client_pipeline_read",
    "client_pipeline_write",
    "view_tenant_branding",
    "search_calls",
  ],
  WRITER: [
    "edit_proposal",
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "view_partner_search",
    "client_pipeline_read",
    "client_pipeline_write",
    "view_tenant_branding",
    "search_calls",
  ],
  MEMBER: [
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "view_partner_search",
    "client_pipeline_read",
    "view_tenant_branding",
    "search_calls",
  ],
  GUEST_PARTNER: [
    "contribute_assigned",
    "search_calls",
  ],
};

/**
 * The plan half of a decision (CLAUDE.md rule 4: plan + module switch + role). Built by
 * the caller from the tenant's plan entitlement — for NexaGrant by `canUseNgFeature`
 * (src/lib/billing/nexagrant/authz.ts) — never typed by hand.
 */
export interface PlanFeatureResource {
  /** The plan feature the action uses, e.g. `partner_search`. */
  feature: string;
  /** Every feature the tenant's current plan grants. */
  grantedFeatures: ReadonlySet<string>;
  /**
   * Whether the module behind the feature is open to tenant members
   * (`isOpenToTenantMembers`). Undefined = no module stands behind the feature.
   */
  moduleOpen?: boolean;
}

/**
 * Check if a role has permission to perform a specific action — and, when a
 * `resource` is given, that the tenant's plan grants the feature and the module
 * behind it is open. A module switched on does not open a feature the plan does not
 * grant (CLAUDE.md rule 4).
 * @param role The role of the user (e.g. from session)
 * @param action The action the user is trying to perform
 * @param resource The plan feature the action uses, with the tenant's entitlement
 * @returns boolean
 */
export function can(
  role: ActingRole | undefined | null,
  action: Action,
  resource?: PlanFeatureResource
): boolean {
  if (!role) return false;
  // NG-272: the server acting for an API key. A key has no member, so no role table applies;
  // the plan and the module the resource names still decide (see the caller's resource).
  if (role !== SYSTEM_ROLE) {
    // Own-property check: a bare lookup would hand back Object.prototype members
    // ('constructor', 'toString', ...) and `.includes` would then throw (NG-259).
    if (!Object.hasOwn(rolePermissions, role)) return false;
    const permissions = rolePermissions[role];
    if (!permissions || !permissions.includes(action)) return false;
  }
  // Only an absent resource is "no plan question" (NG-250 Ö1): a null one, which only a cast can
  // pass, refuses instead of skipping the plan check.
  if (resource === undefined) return true;
  if (!resource) return false;
  if (resource.moduleOpen === false) return false;
  return resource.grantedFeatures.has(resource.feature);
}

/**
 * Narrows a session's `role` claim to a {@link Role}, or `null` when it names
 * no current role.
 *
 * `Session.role` is a plain string because a token minted before a role was
 * renamed still carries the old value. A value outside the enum grants nothing,
 * which is what `can` already did for it — the permission table simply has no
 * entry to look up.
 */
export function asRole(role: string | undefined | null): Role | null {
  // Own-property check, not `in`: `in` also walks the prototype chain, so
  // 'constructor' or '__proto__' would be taken for roles (NG-259).
  return role !== null && role !== undefined && Object.hasOwn(rolePermissions, role)
    ? (role as Role)
    : null;
}

export type DualApprovalActionType =
  | "GATE_G4_SUBMISSION"
  | "BUDGET_ALLOCATION"
  | "LEGAL_COMMITMENT"
  | "MEMBER_ROLE_ELEVATION"
  | "SENSITIVE_SETTINGS_CHANGE";

export const DUAL_APPROVAL_REQUIRED_ROLES: Record<DualApprovalActionType, Role> = {
  GATE_G4_SUBMISSION: Role.TENANT_ADMIN,
  BUDGET_ALLOCATION: Role.TENANT_ADMIN,
  LEGAL_COMMITMENT: Role.TENANT_OWNER,
  MEMBER_ROLE_ELEVATION: Role.TENANT_OWNER,
  SENSITIVE_SETTINGS_CHANGE: Role.TENANT_OWNER,
};

/**
 * M10 follow-up document kinds that are a legal commitment are signed by the
 * dual approval flow only (İNCELEME-59 Y-4). The list and the gate live in
 * `followup-doc-kinds.ts`, which the documents client can import; the gate is
 * fail-closed on any spelling it does not know (İNCELEME-65 B-1).
 */
export { DUAL_APPROVAL_DOCUMENT_KINDS, documentKindRequiresDualApproval } from '@/lib/followup-doc-kinds';

/**
 * Checks if a user role meets or exceeds the required threshold role for dual-approval.
 */
export function canRoleApprove(userRole: Role, requiredRole: Role): boolean {
  const hierarchy: Record<Role, number> = {
    GUEST_PARTNER: 0,
    MEMBER: 1,
    WRITER: 2,
    PIPELINE_MANAGER: 3,
    TENANT_ADMIN: 4,
    TENANT_OWNER: 5,
  };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

