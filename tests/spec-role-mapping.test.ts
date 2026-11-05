import { describe, test, expect } from 'vitest';
import { Role } from '@prisma/client';
import { can } from '@/lib/rbac';
import {
  CODE_ROLES_OUTSIDE_SPEC,
  SPEC_ROLE_MAPPING,
  SPEC_ROLES,
  codeRolesForSpecRole,
} from '@/lib/roles/spec-role-mapping';

/**
 * NG-32 (BE-19): the written mapping from the five roles of the specification
 * (§3) to the six code roles. Each claim is read from the real `can()` table,
 * so a change in `rbac.ts` that invalidates the mapping turns this file red.
 */

const ALL_ROLES = Object.values(Role);

/** The actions that change something. `view_*` are the only read actions in `rbac.ts`. */
const WRITE_ACTIONS = [
  'manage_billing',
  'manage_modules',
  'manage_users',
  'manage_workspaces',
  'evaluate_gates',
  'edit_proposal',
  'contribute_assigned',
  'request_dual_approval',
  'manage_approvals',
  'approve_dual_approval',
] as const;

const writesOf = (role: Role) => WRITE_ACTIONS.filter((action) => can(role, action));

describe('spec role mapping', () => {
  test('names the five roles of the specification', () => {
    expect([...SPEC_ROLES].sort()).toEqual(['ADMIN', 'DENETCI', 'KOORDINATOR', 'ORTAK', 'UZMAN']);
  });

  test('accounts for every code role exactly once', () => {
    const mapped = SPEC_ROLES.flatMap((specRole) => codeRolesForSpecRole(specRole));
    expect([...mapped, ...CODE_ROLES_OUTSIDE_SPEC].sort()).toEqual([...ALL_ROLES].sort());
  });

  test('flags a gap on every mapping that is not a full match', () => {
    for (const specRole of SPEC_ROLES) {
      const { status, gaps } = SPEC_ROLE_MAPPING[specRole];
      expect(status === 'full', specRole).toBe(gaps.length === 0);
    }
  });

  test('Admin: only the owner holds both approvals the specification lists', () => {
    expect(codeRolesForSpecRole('ADMIN')).toEqual([Role.TENANT_OWNER, Role.TENANT_ADMIN]);
    expect(can(Role.TENANT_OWNER, 'manage_modules')).toBe(true);
    expect(can(Role.TENANT_OWNER, 'manage_users')).toBe(true);
    expect(can(Role.TENANT_ADMIN, 'manage_users')).toBe(true);
    expect(can(Role.TENANT_ADMIN, 'manage_modules')).toBe(false);
    expect(SPEC_ROLE_MAPPING.ADMIN.status).toBe('partial');
  });

  test('Koordinatör: evaluates gates and manages approvals, cannot give the second approval', () => {
    expect(codeRolesForSpecRole('KOORDINATOR')).toEqual([Role.PIPELINE_MANAGER]);
    expect(can(Role.PIPELINE_MANAGER, 'evaluate_gates')).toBe(true);
    expect(can(Role.PIPELINE_MANAGER, 'manage_approvals')).toBe(true);
    expect(can(Role.PIPELINE_MANAGER, 'approve_dual_approval')).toBe(false);
    expect(SPEC_ROLE_MAPPING.KOORDINATOR.status).toBe('partial');
  });

  test('Ortak: contributes to its assignments, has no proposal read', () => {
    expect(codeRolesForSpecRole('ORTAK')).toEqual([Role.GUEST_PARTNER]);
    expect(can(Role.GUEST_PARTNER, 'contribute_assigned')).toBe(true);
    expect(can(Role.GUEST_PARTNER, 'view_proposal')).toBe(false);
    expect(SPEC_ROLE_MAPPING.ORTAK.status).toBe('partial');
  });
});

describe('roles with no code counterpart', () => {
  test('Denetçi and Uzman map to nothing and are flagged', () => {
    for (const specRole of ['DENETCI', 'UZMAN'] as const) {
      expect(codeRolesForSpecRole(specRole), specRole).toEqual([]);
      expect(SPEC_ROLE_MAPPING[specRole].status, specRole).toBe('none');
    }
  });

  /**
   * Why Denetçi stays empty, as a fact about the table: a read-only role would
   * read proposals and write nothing. When such a role is added this test goes
   * red, and the mapping above has to be decided again.
   */
  test('no code role reads without also writing', () => {
    const readers = ALL_ROLES.filter((role) => can(role, 'view_proposal'));
    expect(readers.length).toBeGreaterThan(0);
    expect(readers.filter((role) => writesOf(role).length === 0)).toEqual([]);
  });

  test('the role that writes least still has no read at all', () => {
    expect(writesOf(Role.GUEST_PARTNER)).toEqual(['contribute_assigned']);
    expect(can(Role.GUEST_PARTNER, 'view_proposal')).toBe(false);
  });

  test('a role outside the enum gets nothing', () => {
    for (const name of ['DENETCI', 'UZMAN', 'AUDITOR', 'EXPERT']) {
      expect(can(name as Role, 'view_proposal'), name).toBe(false);
    }
  });
});
