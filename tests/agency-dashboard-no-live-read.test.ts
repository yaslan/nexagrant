import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * NG-340 (HUKUK-5 5b) — no agency-facing response reads the live funnel.
 *
 * Everything under src/app (pages, server actions, route handlers) answers a
 * browser. None of it may call the live path of src/lib/agency/funnel.ts; the
 * dashboard reads the month-end snapshot (src/lib/agency/dashboard-snapshot.ts).
 * The live path stays on the server for the monthly job (src/lib/agency/report.ts)
 * and for tests.
 */

const ROOT = join(__dirname, '..');
const LIVE = ['getAgencyFunnel', 'readAgencyFunnelRaw', 'buildAgencyFunnel', 'maskAgencyFunnel', 'buildFunnel', 'agency_funnel_counts_by_province'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('the live funnel never reaches an agency', () => {
  const files = walk(join(ROOT, 'src', 'app'));

  test('src/app has files to check', () => expect(files.length).toBeGreaterThan(50));

  test('no page, action or route under src/app calls the live funnel', () => {
    const hits = files.flatMap((f) => {
      const src = readFileSync(f, 'utf8');
      return LIVE.filter((name) => new RegExp(`\\b${name}\\b`).test(src)).map((name) => `${relative(ROOT, f)}: ${name}`);
    });
    expect(hits).toEqual([]);
  });

  test('the dashboard page reads the month-end snapshot', () => {
    const page = readFileSync(join(ROOT, 'src', 'app', '[locale]', '(app)', 'ajans', 'page.tsx'), 'utf8');
    expect(page).toMatch(/getAgencyDashboardFunnelIn\(/);
  });

  test('the live path has one caller outside funnel.ts: the monthly job', () => {
    const lib = walk(join(ROOT, 'src', 'lib')).filter((f) => !f.endsWith(join('agency', 'funnel.ts')));
    const callers = lib.filter((f) => /\b(getAgencyFunnel|readAgencyFunnelRaw)\b/.test(readFileSync(f, 'utf8')));
    expect(callers.map((f) => relative(ROOT, f).split('\\').join('/'))).toEqual(['src/lib/agency/report.ts']);
  });
});
