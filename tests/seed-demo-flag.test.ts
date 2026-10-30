import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedDemoDecision } from '@/lib/env';

/**
 * FO-251 — `prisma/seed.ts` writes reference data on every run and the demo
 * tenant only when SEED_DEMO is on. The run on a real database is
 * tests/seed-demo-split.live.test.ts; this file pins the switch itself.
 */

describe('seedDemoDecision', () => {
  it.each(['development', 'test', undefined])('unset is on with NODE_ENV=%s', (NODE_ENV) => {
    expect(seedDemoDecision({ NODE_ENV })).toEqual({ enabled: true, warning: null });
  });

  it('unset is off with NODE_ENV=production', () => {
    expect(seedDemoDecision({ NODE_ENV: 'production' })).toEqual({ enabled: false, warning: null });
  });

  it.each(['development', 'test', 'production'])('false is off with NODE_ENV=%s', (NODE_ENV) => {
    expect(seedDemoDecision({ NODE_ENV, SEED_DEMO: 'false' })).toEqual({ enabled: false, warning: null });
  });

  it('true is on outside production without a warning', () => {
    expect(seedDemoDecision({ NODE_ENV: 'development', SEED_DEMO: 'true' })).toEqual({ enabled: true, warning: null });
  });

  it('true in production still runs, with a warning that names both settings', () => {
    const d = seedDemoDecision({ NODE_ENV: 'production', SEED_DEMO: 'true' });
    expect(d.enabled).toBe(true);
    expect(d.warning).toMatch(/SEED_DEMO=true/);
    expect(d.warning).toMatch(/NODE_ENV=production/);
  });
});

describe('prisma/seed.ts wiring', () => {
  const seed = readFileSync(resolve(import.meta.dirname, '../prisma/seed.ts'), 'utf8');
  const body = (name: string) => {
    const start = seed.indexOf(`async function ${name}(`);
    expect(start, `${name} not found in prisma/seed.ts`).toBeGreaterThanOrEqual(0);
    const next = seed.indexOf('\nasync function ', start + 1);
    return seed.slice(start, next === -1 ? undefined : next);
  };

  it('reads the switch through env.ts, never process.env', () => {
    expect(seed).toContain("import { seedDemoDecision } from '../src/lib/env';");
    expect(seed).not.toMatch(/process\.env/);
  });

  it('keeps every demo writer out of the reference part', () => {
    const reference = body('seedReferenceData');
    for (const demo of [
      'seedTenantWorkspace',
      'seedDemoModuleStates',
      'seedCalls',
      'seedOpportunities',
      'seedG0DemoEvidence',
      'seedGateDecisions',
      'seedProposals',
      'seedEfforts',
      'seedM6EvaluatorLens',
      'seedE11Feedback',
    ]) {
      expect(reference, demo).not.toContain(`${demo}(`);
      expect(body('seedDemoData'), demo).toContain(`await ${demo}(`);
    }
  });

  it('runs the demo part only after the switch says so', () => {
    const main = body('main');
    const ref = main.indexOf('await seedReferenceData()');
    const decide = main.indexOf('seedDemoDecision()');
    const guard = main.indexOf('if (!demo.enabled)');
    const demo = main.indexOf('await seedDemoData()');
    expect(ref).toBeGreaterThanOrEqual(0);
    expect(ref).toBeLessThan(decide);
    expect(decide).toBeLessThan(guard);
    expect(guard).toBeLessThan(demo);
  });
});
