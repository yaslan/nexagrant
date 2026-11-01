import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

/**
 * TASK-MUPVLWSIPC5WU (PR #5, B-1) — the UserMenu role badge never invents a role.
 *
 * TASK-MTR5BGKNELCO2 fixed a session with no role being shown an owner badge:
 * `effectiveRole` used to fall back to 'TENANT_OWNER'. `displayRoleName` is unit
 * tested in `src/lib/user-display.test.ts`, but UserMenu cannot be mounted in a
 * test (see `brand-surfaces-render.test.tsx`), so nothing else would notice the
 * fallback coming back. This is a source guard, like `fabricated-fallbacks.test.ts`:
 * it pins the wiring, not the rendering.
 */

const SOURCE = readFileSync(resolve(__dirname, '../src/components/UserMenu.tsx'), 'utf8');

/** Strip comments so the guards read code; the file's comments quote 'TENANT_OWNER'. */
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('UserMenu role badge', () => {
  test('labels the role through displayRoleName with the translated "no role" label', () => {
    expect(code).toMatch(/displayRoleName\(\s*effectiveRole\s*,\s*tIdentity\(\s*'noRole'\s*\)\s*\)/);
  });

  test('never falls back to TENANT_OWNER when the session carries no role', () => {
    expect(code).not.toMatch(/(\|\||\?\?)\s*['"`]TENANT_OWNER['"`]/);
  });

  test('effectiveRole falls back to no role, not to any invented role name', () => {
    const assignment = code.match(/const effectiveRole\s*=\s*([^;]+);/);
    expect(assignment).not.toBeNull();
    expect(assignment![1]).not.toMatch(/['"`]/);
  });
});
