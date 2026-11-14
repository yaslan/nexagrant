import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { m18Manifest } from '@/modules/m18/manifest';
import { getAllManifests } from '@/lib/modules/registry';
import { isStaffPreviewStatus, isUnsoldBeta } from '@/lib/modules/state-machine';
import { decideModuleAccess } from '@/lib/modules/tenant-access';
import { plansGrantingModule } from '@/lib/billing/catalog';

/**
 * NG-135 (K-581676 = A). M18 is `beta` and never sold: a tenant sees it only when its
 * ModuleState is `dev` (staff) or `pilot` (the tenant's managers), and it is never
 * offered as a plan upgrade.
 */
const owner = { role: Role.TENANT_OWNER, isPlatformAdmin: false };
const staff = { role: Role.MEMBER, isPlatformAdmin: true };
const member = { role: Role.MEMBER, isPlatformAdmin: false };
// A paying tenant on the top plan: its allowedModules list never contains M18.
const PAYING: string[] = ['M1', 'M2', 'M5', 'M9'];

describe('M18 beta access (unsold, staff/pilot preview)', () => {
  it('is beta and sold by nothing', () => {
    expect(m18Manifest.statusBadge).toBe('beta');
    expect(m18Manifest.planTiers).toEqual([]);
    expect(m18Manifest.addOnSku ?? null).toBeNull();
    expect(isUnsoldBeta('M18')).toBe(true);
    expect(plansGrantingModule('M18')).toEqual([]);
  });

  it('dev is open to staff', () => {
    const r = decideModuleAccess('M18', 'DEV', PAYING, staff);
    expect(r.allowed).toBe(true);
    expect(r.status).toBe('DEV');
  });

  it('dev is closed to a tenant owner (DEV is for staff)', () => {
    const r = decideModuleAccess('M18', 'DEV', PAYING, owner);
    expect(r).toMatchObject({ allowed: false, reason: 'DEV_INTERNAL_ONLY' });
  });

  it('dev is open even with no plan entitlement (the plan check is skipped)', () => {
    expect(decideModuleAccess('M18', 'DEV', [], staff).allowed).toBe(true);
  });

  it('pilot is open to the tenant managers', () => {
    const r = decideModuleAccess('M18', 'PILOT', [], owner);
    expect(r.allowed).toBe(true);
    expect(r.status).toBe('PILOT');
  });

  it('pilot is closed to a plain member', () => {
    expect(decideModuleAccess('M18', 'PILOT', [], member)).toMatchObject({
      allowed: false,
      reason: 'PILOT_MANAGERS_ONLY',
    });
  });

  it('off is closed to everyone, staff included', () => {
    for (const viewer of [owner, staff, member]) {
      expect(decideModuleAccess('M18', 'OFF', PAYING, viewer)).toMatchObject({
        allowed: false,
        reason: 'MODULE_OFF',
      });
    }
  });

  it('on is closed to everyone: nothing sells it, so nothing opens it', () => {
    for (const viewer of [owner, staff, member]) {
      expect(decideModuleAccess('M18', 'ON', PAYING, viewer)).toMatchObject({
        allowed: false,
        reason: 'MODULE_OFF',
      });
    }
  });

  it('is never a plan upgrade: a closed M18 is not PLAN_UPGRADE_REQUIRED', () => {
    for (const status of ['OFF', 'ON'] as const) {
      expect(decideModuleAccess('M18', status, PAYING, owner).reason).not.toBe('PLAN_UPGRADE_REQUIRED');
    }
  });

  it('is not in the upgrade list (nav: upgradeModules only collects PLAN_UPGRADE_REQUIRED)', () => {
    const upgradeIds = getAllManifests()
      .map((m) => m.id)
      .filter((id) => {
        const access = decideModuleAccess(id, 'ON', PAYING, owner);
        return !access.allowed && access.reason === 'PLAN_UPGRADE_REQUIRED';
      });
    expect(upgradeIds).not.toContain('M18');
  });

  it('the staff-preview predicate only opens DEV and PILOT on an unsold beta module', () => {
    expect(isStaffPreviewStatus('M18', 'DEV')).toBe(true);
    expect(isStaffPreviewStatus('M18', 'PILOT')).toBe(true);
    expect(isStaffPreviewStatus('M18', 'OFF')).toBe(false);
    expect(isStaffPreviewStatus('M18', 'ON')).toBe(false);
    // A sold module is never widened by the rule.
    expect(isStaffPreviewStatus('M1', 'DEV')).toBe(false);
  });
});
