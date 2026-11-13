import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { can, canRoleApprove, type Action } from '@/lib/rbac';
import { canEnable, isComingSoon } from '@/lib/modules/state-machine';
import { decideModuleAccess } from '@/lib/modules/tenant-access';
import { getManifest } from '@/lib/modules/registry';
import { m18Manifest } from '@/modules/m18/manifest';
import { plansGrantingModule } from '@/lib/billing/catalog';

/**
 * NG-143 (M18-F1). The manifest is the data layer's contract: these tests pin the parts a
 * later phase could silently break — the role ladder in `can()` vs the manifest's minRole,
 * "no plan sells M18 yet", and every M18 table carrying strict RLS in prisma/rls.sql.
 */
const ACTION_FOR: Record<string, Action> = {
  'client-pipeline:read': 'client_pipeline_read',
  'client-pipeline:write': 'client_pipeline_write',
  'client-pipeline:admin': 'client_pipeline_admin',
};

describe('M18 client-pipeline manifest', () => {
  it('is registered under M18', () => {
    expect(getManifest('M18')).toBe(m18Manifest);
    expect(m18Manifest.key).toBe('client-pipeline');
    expect(m18Manifest.requires).toEqual([]);
    expect(m18Manifest.recommends).toEqual(['M9', 'M16']);
    expect(m18Manifest.statusBadge).toBe('soon');
  });

  it('is "Yakında": never offered as a plan upgrade, not even to a tenant entitled to everything', () => {
    expect(isComingSoon('M18')).toBe(true);
    const viewer = { role: Role.TENANT_OWNER, isPlatformAdmin: true };
    expect(decideModuleAccess('M18', 'ON', [], viewer).reason).toBe('COMING_SOON');
    expect(decideModuleAccess('M18', 'DEV', ['M18'], viewer).allowed).toBe(false);
  });

  it('is sold by no plan and no add-on, so plan-based enabling refuses it', () => {
    expect(m18Manifest.planTiers).toEqual([]);
    expect(m18Manifest.addOnSku ?? null).toBeNull();
    expect(plansGrantingModule('M18')).toEqual([]);
    expect(canEnable('M18', [], 'ultra').allowed).toBe(false);
  });

  it.each(Object.values(Role))('can(%s) matches each permission minRole', (role) => {
    for (const p of m18Manifest.permissions) {
      const action = ACTION_FOR[p.id];
      expect(action, `no rbac action for ${p.id}`).toBeDefined();
      expect(can(role, action as Action), `${role} × ${p.id}`).toBe(canRoleApprove(role, p.minRole));
    }
  });

  it('declares every M18 table in the RLS FOREACH list and in the migration policy loop', () => {
    const rls = readFileSync(resolve(process.cwd(), 'prisma/rls.sql'), 'utf8');
    const migration = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/add-m18-client-pipeline.sql'),
      'utf8'
    );
    expect(m18Manifest.tables).toHaveLength(9);
    for (const table of m18Manifest.tables) {
      expect(rls, table).toContain(`'${table}'`);
      expect(migration, table).toContain(`'${table}'`);
      expect(migration, table).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });
});
