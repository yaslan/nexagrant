import { Role } from '@prisma/client';

/**
 * The roles of the NexaGrant specification (02-Yazilim-Sartnamesi.md §3) mapped
 * to the code roles of `enum Role` (NG-32, BE-19). Permissions stay in
 * `src/lib/rbac.ts`; this file only records which code role stands for which
 * specification role, and where the two differ.
 *
 * Denetçi and Uzman have no code role. Their lists stay empty on purpose: a
 * caller must not treat MEMBER or GUEST_PARTNER as a stand-in for them.
 */

export const SPEC_ROLES = ['ADMIN', 'KOORDINATOR', 'ORTAK', 'UZMAN', 'DENETCI'] as const;
export type SpecRole = (typeof SPEC_ROLES)[number];

/** `full`: same rights. `partial`: mapped, with `gaps`. `none`: no code role. */
export type SpecRoleMatch = 'full' | 'partial' | 'none';

export interface SpecRoleMapping {
  codeRoles: readonly Role[];
  status: SpecRoleMatch;
  gaps: readonly string[];
}

export const SPEC_ROLE_MAPPING: Record<SpecRole, SpecRoleMapping> = {
  ADMIN: {
    codeRoles: [Role.TENANT_OWNER, Role.TENANT_ADMIN],
    status: 'partial',
    gaps: [
      'TENANT_ADMIN has manage_users but not manage_modules; only TENANT_OWNER holds both.',
      'The specification says "whole system". Code roles stop at the tenant; platform admin is a separate check.',
    ],
  },
  KOORDINATOR: {
    codeRoles: [Role.PIPELINE_MANAGER],
    status: 'partial',
    gaps: [
      'PIPELINE_MANAGER has no approve_dual_approval and code has no expense approval.',
      'The specification limits it to its own projects; view_proposal is not limited to assigned projects.',
      'project.role (coordinator or partner) is per project; Role is per tenant.',
    ],
  },
  ORTAK: {
    codeRoles: [Role.GUEST_PARTNER],
    status: 'partial',
    gaps: [
      'GUEST_PARTNER has contribute_assigned only: no view_proposal, so no consortium status table.',
      'No action approves the documents of its own organisation.',
    ],
  },
  UZMAN: {
    codeRoles: [],
    status: 'none',
    gaps: [
      'No code role. ExpertPreRegistration has no account and no Role.',
      'A Reviewer seat with contribute_assigned covers the internal evaluation only; no role scopes reading to assigned calls.',
      'The specification gives it approvals (call eligibility, internal evaluation), so it is not read-only.',
    ],
  },
  DENETCI: {
    codeRoles: [],
    status: 'none',
    gaps: [
      'No code role reads without writing: every role with view_proposal also has contribute_assigned and request_dual_approval.',
      'Code has no expense records; Invoice is the bill of the tenant.',
      'The specification conflicts: §3 lists no approvals, §17 lets it approve the expense of a coordinator.',
    ],
  },
};

/** Code roles with no role in the specification. */
export const CODE_ROLES_OUTSIDE_SPEC: readonly Role[] = [Role.WRITER, Role.MEMBER];

export function codeRolesForSpecRole(specRole: SpecRole): readonly Role[] {
  return SPEC_ROLE_MAPPING[specRole].codeRoles;
}
