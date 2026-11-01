import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedDemoDecision } from '@/lib/env';

/**
 * FO-251 — `prisma/seed.ts` writes reference data on every run and the demo
 * tenant only when SEED_DEMO is on. The run on a real database is
 * tests/seed-demo-split.live.test.ts; this file pins the switch itself.
 */

describe('seedDemoDecision', () => {
  it.each(['development', 'test'])('unset is on with NODE_ENV=%s', (NODE_ENV) => {
    expect(seedDemoDecision({ NODE_ENV })).toEqual({ enabled: true, warning: null });
  });

  // FO-296: a seed run from a server shell has no NODE_ENV. Unset must not
  // read as development — the demo tenant stays out (fail closed).
  it.each([undefined, ''])('unset is off when NODE_ENV is not set (%j)', (NODE_ENV) => {
    expect(seedDemoDecision({ NODE_ENV })).toEqual({ enabled: false, warning: null });
    expect(seedDemoDecision({ NODE_ENV, SEED_DEMO: undefined })).toEqual({ enabled: false, warning: null });
  });

  it('true without NODE_ENV is still obeyed', () => {
    expect(seedDemoDecision({ SEED_DEMO: 'true' })).toEqual({ enabled: true, warning: null });
  });

  describe('default source (the env this process really has)', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });
    const load = async (NODE_ENV: string | undefined, SEED_DEMO = '') => {
      vi.stubEnv('NODE_ENV', NODE_ENV);
      vi.stubEnv('SEED_DEMO', SEED_DEMO);
      vi.resetModules();
      return import('@/lib/env');
    };

    it('NODE_ENV absent: env.NODE_ENV falls back to development, the seed still stays off', async () => {
      const m = await load(undefined);
      expect(m.env.NODE_ENV).toBe('development');
      expect(m.declaredNodeEnv).toBeUndefined();
      expect(m.seedDemoDecision()).toEqual({ enabled: false, warning: null });
    });

    it('NODE_ENV blank never reaches the decision: env.ts refuses it at import', async () => {
      await expect(load('')).rejects.toThrow(/NODE_ENV/);
    });

    it.each(['development', 'test'])('NODE_ENV=%s: on', async (NODE_ENV) => {
      const m = await load(NODE_ENV);
      expect(m.declaredNodeEnv).toBe(NODE_ENV);
      expect(m.seedDemoDecision()).toEqual({ enabled: true, warning: null });
    });

    it('NODE_ENV absent with SEED_DEMO=true: on', async () => {
      const m = await load(undefined, 'true');
      expect(m.seedDemoDecision()).toEqual({ enabled: true, warning: null });
    });
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

  // FO-296: the name list above only sees the helpers; a demo row written
  // straight through the client in the reference part must fail too.
  it('writes no tenant-scoped demo rows directly in the reference part', () => {
    const reference = body('seedReferenceData');
    expect(reference).not.toMatch(/\b(?:prisma|tx)\s*\.\s*(?:tenant|user|call|opportunity|moduleState|membership)\s*\./);
  });

  // FO-296: db-setup.sh (CI, gate:isolated, laptops) runs without NODE_ENV, so
  // the fail-closed default would leave e2e without demo-tenant. The local/CI
  // setup path must ask for it explicitly, and still let a caller turn it off.
  it('scripts/db-setup.sh seeds with SEED_DEMO on unless the caller set it', () => {
    const setup = readFileSync(resolve(import.meta.dirname, '../scripts/db-setup.sh'), 'utf8');
    const commands = setup.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    const seeds = commands.filter((l) => /\bpnpm db:seed\b/.test(l));
    expect(seeds).toEqual(['SEED_DEMO=${SEED_DEMO:-true} pnpm db:seed']);
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
