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
  | "approve_dual_approval";

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
  ],
  PIPELINE_MANAGER: [
    "manage_workspaces",
    "evaluate_gates",
    "edit_proposal",
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
    "manage_approvals",
  ],
  WRITER: [
    "edit_proposal",
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
  ],
  MEMBER: [
    "view_proposal",
    "contribute_assigned",
    "request_dual_approval",
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

