import { describe, it, expect } from 'vitest';
import { canEnable, getDisableCascade } from '../../src/lib/modules/state-machine';
import { ModuleId } from '../../src/lib/modules/types';

describe('Module State Machine', () => {
  describe('canEnable', () => {
    it('allows enabling M1 (no dependencies) on team plan', () => {
      const result = canEnable('M1', [], 'team');
      expect(result.allowed).toBe(true);
    });

    it('rejects M1 on discover plan (plan tier restriction)', () => {
      const result = canEnable('M1', [], 'discover');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Plan upgrade required.');
    });

    it('rejects M4 if M1 is not active', () => {
      const result = canEnable('M4', [], 'business');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Missing dependencies.');
      expect(result.missingDependencies).toContain('M1');
    });

    it('allows M4 if M1 is active', () => {
      const result = canEnable('M4', ['M1'], 'business');
      expect(result.allowed).toBe(true);
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
});
