import { describe, expect, test } from 'vitest';
import type { Role } from '@prisma/client';

import { can } from '@/lib/rbac';
import { toShellCoBrand } from '@/lib/agency/cobrand-store';

/**
 * NG-248 (K-584216) — the agency co-brand (name + logo) is shown to the five internal
 * roles only. Two parts:
 *   1. the door `view_tenant_branding` (rbac.ts) opens for exactly those five roles, and
 *      the shell and the logo route both read it from there;
 *   2. the shell payload `toShellCoBrand` builds carries only `name` and `logoSrc`
 *      (NG-247 option b): a field added later to the entry would not travel to a shell.
 */

const INTERNAL_ROLES: Role[] = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER'];

describe('NG-248 view_tenant_branding', () => {
  test.each(INTERNAL_ROLES)('%s may see the co-brand', (role) => {
    expect(can(role, 'view_tenant_branding')).toBe(true);
  });

  test('GUEST_PARTNER may not see the co-brand', () => {
    expect(can('GUEST_PARTNER', 'view_tenant_branding')).toBe(false);
  });

  test('a missing or unknown role sees no co-brand', () => {
    expect(can(undefined, 'view_tenant_branding')).toBe(false);
    expect(can(null, 'view_tenant_branding')).toBe(false);
    expect(can('NOT_A_ROLE' as Role, 'view_tenant_branding')).toBe(false);
  });
});

describe('NG-248 toShellCoBrand key guard', () => {
  test('the shell payload carries exactly name and logoSrc', () => {
    const shell = toShellCoBrand({
      logoKey: 'agency-1/agency/cobrand/6f1c0a8e-2b7d-4c3e-9a10-5d8e7f2b4c61.png',
      name: 'Ajans Adı',
      updatedAt: '2026-11-18T10:00:00.000Z',
    });
    expect(shell).not.toBeNull();
    expect(Object.keys(shell as object).sort()).toEqual(['logoSrc', 'name']);
  });

  test('no logo key means text only, still with the two keys', () => {
    const shell = toShellCoBrand({ logoKey: null, name: 'Ajans Adı', updatedAt: '2026-11-18T10:00:00.000Z' });
    expect(shell).toEqual({ name: 'Ajans Adı', logoSrc: null });
  });

  test('no entry means no co-brand', () => {
    expect(toShellCoBrand(null)).toBeNull();
  });
});
