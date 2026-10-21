import { describe, it, expect } from 'vitest';
import {
  canAccessStatus,
  canEnable,
  canEnableEntitled,
  getDisableCascade,
} from '../../src/lib/modules/state-machine';
import { ModuleId } from '../../src/lib/modules/types';

describe('Module State Machine', () => {
  describe('canEnable', () => {
    it('allows enabling M1 (no dependencies) on the pro plan', () => {
      const result = canEnable('M1', [], 'pro');
      expect(result.allowed).toBe(true);
    });

    it('rejects M1 on the basic plan (plan tier restriction)', () => {
      const result = canEnable('M1', [], 'basic');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Plan upgrade required.');
    });

    it('rejects M4 if M1 is not active', () => {
      const result = canEnable('M4', [], 'ultra');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Missing dependencies.');
      expect(result.missingDependencies).toContain('M1');
    });

    it('allows M4 if M1 is active', () => {
      const result = canEnable('M4', ['M1'], 'ultra');
      expect(result.allowed).toBe(true);
    });

    it('opens M6 on ultra and refuses it on basic — the retired EUR ladder no longer decides', () => {
      expect(canEnable('M6', [], 'ultra').allowed).toBe(true);
      expect(canEnable('M6', [], 'basic')).toMatchObject({
        allowed: false,
        reason: 'Plan upgrade required.',
      });
    });
  });

  describe('getDisableCascade', () => {
    it('returns empty array if no modules depend on the disabled module', () => {
      // M3 has no dependents that are active
      const cascade = getDisableCascade('M3', ['M1', 'M2', 'M3']);
      expect(cascade).toEqual([]);
    });

    it('cascades to direct dependents', () => {
      // Disabling M1 should cascade to M4
      const cascade = getDisableCascade('M1', ['M1', 'M2', 'M4']);
      expect(cascade).toEqual(['M4']);
    });

    it('cascades recursively to deep dependents', () => {
      // Disabling M1 should cascade to M4, which cascades to M10
      const activeModules: ModuleId[] = ['M1', 'M4', 'M10', 'M2'];
      const cascade = getDisableCascade('M1', activeModules);
      expect(cascade).toContain('M4');
      expect(cascade).toContain('M10');
      expect(cascade).not.toContain('M2');
      expect(cascade.length).toBe(2);
    });

    it('handles multiple dependency chains correctly', () => {
      // M11 depends on M2, M3, M5, M8. 
      // M8 depends on M1.
      // Disabling M1 cascades to M8, which then cascades to M11.
      const activeModules: ModuleId[] = ['M1', 'M2', 'M3', 'M5', 'M8', 'M11'];
      const cascade = getDisableCascade('M1', activeModules);
      expect(cascade).toContain('M8');
      expect(cascade).toContain('M11');
      expect(cascade.length).toBe(2);
    });
  });

  describe('canAccessStatus', () => {
    const member = { role: 'MEMBER', isPlatformAdmin: false };
    const owner = { role: 'TENANT_OWNER', isPlatformAdmin: false };
    const manager = { role: 'PIPELINE_MANAGER', isPlatformAdmin: false };
    const staff = { role: 'MEMBER', isPlatformAdmin: true };

    it('ON is open to every member of the tenant', () => {
      expect(canAccessStatus('ON', member).allowed).toBe(true);
    });

    it('OFF is closed to everyone, platform staff included', () => {
      expect(canAccessStatus('OFF', member)).toEqual({ allowed: false, reason: 'MODULE_OFF' });
      expect(canAccessStatus('OFF', owner).allowed).toBe(false);
      expect(canAccessStatus('OFF', staff).allowed).toBe(false);
    });

    // The regression this gate was built for: a beta partner's own TENANT_OWNER used to
    // pass the DEV check, so moving M9 to DEV hid it from nobody.
    it('DEV is Fabrika staff only — a tenant owner is not an insider', () => {
      expect(canAccessStatus('DEV', owner)).toEqual({
        allowed: false,
        reason: 'DEV_INTERNAL_ONLY',
      });
      expect(canAccessStatus('DEV', member).allowed).toBe(false);
      expect(canAccessStatus('DEV', staff).allowed).toBe(true);
    });

    it('PILOT admits the tenant managers and staff, not plain members', () => {
      expect(canAccessStatus('PILOT', manager).allowed).toBe(true);
      expect(canAccessStatus('PILOT', owner).allowed).toBe(true);
      expect(canAccessStatus('PILOT', staff).allowed).toBe(true);
      expect(canAccessStatus('PILOT', member)).toEqual({
        allowed: false,
        reason: 'PILOT_MANAGERS_ONLY',
      });
    });

    // A tenant's API key is a machine audience (TASK-MVDPYNG1JI0S1): PILOT opens to it
    // like to the managers, DEV does not, because it is not staff.
    it('PILOT admits a machine audience (the tenant API key), DEV does not', () => {
      const apiKey = { role: 'API_KEY', isPlatformAdmin: false, isMachine: true };
      expect(canAccessStatus('PILOT', apiKey).allowed).toBe(true);
      expect(canAccessStatus('DEV', apiKey)).toEqual({
        allowed: false,
        reason: 'DEV_INTERNAL_ONLY',
      });
    });
  });

});

describe('Yakında (statusBadge: soon) modules cannot be opened', () => {
  const everything = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16'] as ModuleId[];
  const soon: ModuleId[] = ['M0', 'M12', 'M13', 'M14', 'M15', 'M16'];

  it('refuses every soon module on the top plan, even with its dependencies on', () => {
    for (const id of soon) {
      expect(canEnable(id, everything, 'ultra'), id).toMatchObject({ allowed: false, reason: 'Module is coming soon.' });
      expect(canEnableEntitled(id, everything, everything), id).toMatchObject({
        allowed: false,
        reason: 'Module is coming soon.',
      });
    }
  });

  it('a GA module is still allowed through the same path (the refusal is for soon only)', () => {
    expect(canEnableEntitled('M1', [], ['M1']).allowed).toBe(true);
    expect(canEnableEntitled('M11', ['M1', 'M2', 'M3', 'M5', 'M8'], ['M11']).allowed).toBe(true);
  });

  it('cascades through the new dependency edges when a GA parent is switched off', () => {
    expect(getDisableCascade('M5', ['M5', 'M13', 'M15'])).toEqual(['M13', 'M15']);
    expect(getDisableCascade('M11', ['M1', 'M2', 'M3', 'M5', 'M8', 'M11', 'M14'])).toEqual(['M14']);
    expect(getDisableCascade('M14', ['M11', 'M14'])).toEqual([]);
  });
});
