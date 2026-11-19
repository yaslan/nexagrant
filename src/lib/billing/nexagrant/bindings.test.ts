/**
 * NG-250 — every NexaGrant feature is either bound to the product routes that use it, or
 * listed as unbound with the reason. A bound route really calls the gate with that feature,
 * and a route that sits behind a module has that module in NG_FEATURE_MODULE (review U5:
 * a module-backed feature missing from the map is gated by plan and role only, which skips
 * the module switch — CLAUDE.md rule 4).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NG_FEATURE_MODULE } from './authz';
import { NG_ROUTE_BINDINGS, NG_UNBOUND_FEATURES } from './bindings';
import { NG_FEATURE_KEYS } from './features';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('NG feature → route bindings (NG-250)', () => {
  it('every feature is bound or unbound-with-reason, never both, never neither', () => {
    const bound = new Set(NG_ROUTE_BINDINGS.map((b) => b.feature));
    for (const key of NG_FEATURE_KEYS) {
      const unbound = Object.hasOwn(NG_UNBOUND_FEATURES, key);
      expect(bound.has(key) !== unbound, `${key}: bound=${bound.has(key)} unbound=${unbound}`).toBe(true);
    }
    for (const reason of Object.values(NG_UNBOUND_FEATURES)) expect(reason.length).toBeGreaterThan(10);
  });

  it.each(NG_ROUTE_BINDINGS.map((b) => [`${b.method} ${b.route} → ${b.feature}`, b] as const))(
    '%s calls the gate with that feature and action',
    (_name, b) => {
      expect(existsSync(path.join(ROOT, b.file)), b.file).toBe(true);
      const src = read(b.file);
      expect(src).toContain(`export async function ${b.method}`);
      expect(src).toMatch(new RegExp(`ngGateResponse\\([^)]*'${b.action}',\\s*'${b.feature}'`));
    }
  );

  it('a route behind a module names that module in NG_FEATURE_MODULE (U5)', () => {
    for (const b of NG_ROUTE_BINDINGS) {
      expect(NG_FEATURE_MODULE[b.feature] ?? null, `${b.feature} @ ${b.route}`).toBe(b.module);
      if (b.module) {
        // The module check is real: the route or its declared guard names the module.
        const guard = read(b.moduleGuardFile ?? b.file);
        expect(guard, `${b.moduleGuardFile ?? b.file} does not gate ${b.module}`).toMatch(new RegExp(`'${b.module}'|\\b${b.module}\\b`));
      }
    }
  });

  it('every module in NG_FEATURE_MODULE stands behind at least one bound route', () => {
    for (const [feature, moduleId] of Object.entries(NG_FEATURE_MODULE)) {
      expect(NG_ROUTE_BINDINGS.some((b) => b.feature === feature && b.module === moduleId), feature).toBe(true);
    }
  });

  it('the review measurement: partner_search is no longer outside the map', () => {
    expect(NG_FEATURE_MODULE.partner_search).toBe('M1');
    expect(Object.keys(NG_FEATURE_MODULE).length).toBeGreaterThan(0);
  });
});
