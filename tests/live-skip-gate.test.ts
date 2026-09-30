import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ALLOWED_LIVE_SKIPS, checkLiveSkips, type VitestJsonReport } from '../scripts/live-skip-gate';

/**
 * İNCELEME-62 O-1 / O-2 (TASK-MUNRAZC9Q758W) — the CI gate that no live test is
 * skipped, the CI step that runs it, and the one skip pattern the gate cannot
 * see (a test that returns early is "passed", not "skipped").
 */

const root = path.resolve(import.meta.dirname, '..');

function report(files: Record<string, Array<[string, string]>>): VitestJsonReport {
  return {
    testResults: Object.entries(files).map(([name, tests]) => ({
      name: `/runner/work/app/${name}`,
      assertionResults: tests.map(([fullName, status]) => ({ fullName, status })),
    })),
  };
}

describe('checkLiveSkips', () => {
  it('passes when every live test ran', () => {
    const v = checkLiveSkips(
      report({
        'tests/a.live.test.ts': [['a one', 'passed'], ['a two', 'passed']],
        'tests/b.test.ts': [['unit', 'skipped']],
      }),
    );
    expect(v).toMatchObject({ ok: true, liveFiles: 1, livePassed: 2, skipped: [] });
  });

  it.each(['skipped', 'pending', 'todo', undefined])('fails on a live test with status %j', (status) => {
    const v = checkLiveSkips(
      report({ 'tests/a.live.test.ts': [['a one', 'passed'], ['a two', status as string]] }),
    );
    expect(v.ok).toBe(false);
    expect(v.skipped).toEqual([expect.stringContaining('tests/a.live.test.ts :: a two')]);
  });

  it('a failed live test is not this gate’s business (vitest already fails the step)', () => {
    expect(checkLiveSkips(report({ 'tests/a.live.test.ts': [['x', 'passed'], ['y', 'failed']] })).ok).toBe(true);
  });

  it('allows only the listed paid opt-in, and only in its own file', () => {
    const name = 'K1 embeddings (live, REAL OpenAI) scores topics';
    const ok = checkLiveSkips(
      report({ 'tests/k1-embeddings.live.test.ts': [['K1 other', 'passed'], [name, 'skipped']] }),
    );
    expect(ok.ok).toBe(true);
    expect(ok.allowed).toHaveLength(1);
    const elsewhere = checkLiveSkips(
      report({ 'tests/other.live.test.ts': [['x', 'passed'], [name, 'skipped']] }),
    );
    expect(elsewhere.ok).toBe(false);
    expect(ALLOWED_LIVE_SKIPS.map((a) => a.file)).toEqual([
      'tests/k1-embeddings.live.test.ts',
      'tests/evidence-upload-s3.live.test.ts',
      'tests/evidence-confirm-store-faults.live.test.ts',
    ]);
  });

  it('refuses a report with no live files, no passes, or a live file with no results', () => {
    expect(checkLiveSkips(report({ 'tests/b.test.ts': [['u', 'passed']] })).ok).toBe(false);
    expect(checkLiveSkips({}).problems).toEqual(['the report has no *.live.test.ts files']);
    expect(checkLiveSkips(report({ 'tests/a.live.test.ts': [['x', 'failed']] })).ok).toBe(false);
    expect(
      checkLiveSkips(report({ 'tests/a.live.test.ts': [['x', 'passed']], 'tests/c.live.test.ts': [] })).problems,
    ).toEqual(['tests/c.live.test.ts: no test results (did the file load?)']);
  });

  it('the CLI exits 1 on a skip and 0 on a clean report', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'live-skip-'));
    const bad = path.join(dir, 'bad.json');
    const good = path.join(dir, 'good.json');
    writeFileSync(bad, JSON.stringify(report({ 'tests/a.live.test.ts': [['x', 'passed'], ['y', 'skipped']] })));
    writeFileSync(good, JSON.stringify(report({ 'tests/a.live.test.ts': [['x', 'passed']] })));
    const run = (f: string) => {
      try {
        execFileSync(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'scripts/check-live-skips.ts'), f], {
          stdio: 'pipe',
        });
        return 0;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };
    expect(run(good)).toBe(0);
    expect(run(bad)).toBe(1);
    expect(run(path.join(dir, 'missing.json'))).toBe(1);
  });

  it('outside CI a failing gate says why a CI run may differ; the exit stays 1 (TASK-MUOEY2GBFHY7U)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'live-skip-'));
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify(report({ 'tests/a.live.test.ts': [['x', 'passed'], ['y', 'skipped']] })));
    const stderr = (ci: string | undefined) => {
      const env = { ...process.env };
      if (ci === undefined) delete env.CI;
      else env.CI = ci;
      try {
        execFileSync(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'scripts/check-live-skips.ts'), bad], {
          stdio: 'pipe',
          env,
        });
        return { status: 0, err: '' };
      } catch (e) {
        const x = e as { status: number; stderr: Buffer };
        return { status: x.status, err: x.stderr.toString() };
      }
    };
    const local = stderr(undefined);
    expect(local.status).toBe(1);
    expect(local.err).toMatch(/note — CI is not set/);
    const ci = stderr('true');
    expect(ci.status).toBe(1);
    expect(ci.err).not.toMatch(/CI is not set/);
  });
});

describe('.github/workflows/ci.yml Test step', () => {
  const yml = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const step = /\n {4}- name: Test\n([\s\S]*?)(?=\n {4}- name: |\n\S|$)/.exec(yml)?.[1] ?? '';

  it('writes the JSON report and runs the gate on it, after vitest', () => {
    const lines = step.split('\n').map((l) => l.trim());
    const vitest = lines.findIndex((l) => /^pnpm exec vitest run\b/.test(l));
    const gate = lines.findIndex((l) => l === 'pnpm exec tsx scripts/check-live-skips.ts vitest-report.json');
    expect(vitest).toBeGreaterThanOrEqual(0);
    expect(lines[vitest]).toContain('--reporter=json');
    expect(lines[vitest]).toContain('--outputFile.json=vitest-report.json');
    expect(lines[vitest]).toContain('--reporter=default');
    expect(gate).toBeGreaterThan(vitest);
  });

  it('sets a non-empty test-only AUTH_SECRET (İNCELEME-54 Y-1)', () => {
    const value = /\n\s+AUTH_SECRET:\s*'([^']*)'/.exec(step)?.[1] ?? '';
    expect(value.length).toBeGreaterThanOrEqual(32);
    expect(value).toMatch(/not-for-any-deployment/);
  });
});

describe('no live test turns a skip into a pass (İNCELEME-62 O-2)', () => {
  it('no *.live.test.ts returns `expect(skipReason)…` — that reports "passed", and the gate above cannot see it', () => {
    const offenders = readdirSync(path.join(root, 'tests'))
      .filter((f) => f.endsWith('.live.test.ts'))
      .filter((f) => /return\s+expect\(\s*skipReason\s*\)/.test(readFileSync(path.join(root, 'tests', f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
