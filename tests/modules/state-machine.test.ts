import { describe, it, expect } from 'vitest';
import { canAccessStatus, canEnable, getDisableCascade } from '../../src/lib/modules/state-machine';
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
  });

});
