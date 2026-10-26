import { Role } from "@prisma/client";

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
  | "view_partner_search";

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
  ],
  WRITER: [
    "edit_proposal",
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "view_partner_search",
  ],
  MEMBER: [
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "view_partner_search",
  ],
  GUEST_PARTNER: [
    "contribute_assigned",
  ],
};

/**
 * Check if a role has permission to perform a specific action.
 * @param role The role of the user (e.g. from session)
 * @param action The action the user is trying to perform
 * @returns boolean
 */
export function can(role: Role | undefined | null, action: Action): boolean {
  if (!role) return false;
  const permissions = rolePermissions[role];
  return permissions ? permissions.includes(action) : false;
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
  return role !== null && role !== undefined && role in rolePermissions ? (role as Role) : null;
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

