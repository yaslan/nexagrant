import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * İNCELEME-39 B-2 of TASK-MUN3OAFIVW9NA — every link the app builds to itself
 * goes through `src/lib/app-url.ts`. The rules there have their own tests
 * (`src/lib/app-url.test.ts`); this file pins the call sites. In the review a
 * hard-coded `http://localhost:3000`, an old domain or a deleted startup check
 * put back into a caller left every test green (mutants A1–A7), because under
 * `NODE_ENV=test` the fallback is localhost anyway.
 *
 * Code only: comments that tell the history of a fixed default stay allowed.
 */

const ROOT = resolve(__dirname, '..');

/** Old or local origins no caller may carry. `docs.fabrika.app` and the mock `storage.fabrika.app` do not match `//fabrika.app`. */
const FORBIDDEN = [/localhost:3000/, /app\.fabrika\.(io|dev)/, /\/\/fabrika\.app/];

/** The only files that may hold them, or read NEXT_PUBLIC_APP_URL directly. */
const RULE_FILES = new Set(['src/lib/app-url.ts']);
const ENV_READERS = new Set(['src/lib/app-url.ts', 'src/lib/env.ts']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Block and line comments out, string literals (and a `//` inside them) kept. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n');
}

const files = sourceFiles(join(ROOT, 'src')).map((f) => ({ path: relative(ROOT, f), code: codeOnly(readFileSync(f, 'utf8')) }));

describe('self-links go through src/lib/app-url.ts', () => {
  test('the scan sees the files it guards', () => {
    const paths = files.map((f) => f.path);
    for (const p of [
      'src/app/layout.tsx',
      'src/app/api/invitations/route.ts',
      'src/app/api/billing/checkout/route.ts',
      'src/app/[locale]/(app)/[workspace]/settings/api-keys/page.tsx',
      'src/lib/jobs/tasks/alerts-daily.ts',
      'src/lib/feedback/digest-run.ts',
      'src/lib/beta/constants.ts',
      'src/lib/calendar/google.ts',
    ]) {
      expect(paths).toContain(p);
    }
    // The comment stripper keeps a URL inside a string.
    expect(codeOnly(`const a = 'http://localhost:3000'; // http://localhost:3000`)).toBe(`const a = 'http://localhost:3000'; `);
  });

  test('no source file outside app-url.ts carries localhost:3000 or an old domain', () => {
    const offenders = files
      .filter((f) => !RULE_FILES.has(f.path) && FORBIDDEN.some((re) => re.test(f.code)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  test('NEXT_PUBLIC_APP_URL is read only by app-url.ts (and declared in env.ts)', () => {
    const offenders = files
      .filter((f) => !ENV_READERS.has(f.path) && /\.\s*NEXT_PUBLIC_APP_URL\b|\[\s*['"]NEXT_PUBLIC_APP_URL['"]\s*\]/.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe('instrumentation', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/app-url-alert');
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  test('reports a production NEXT_PUBLIC_APP_URL problem once at server start', async () => {
    vi.resetModules();
    const reportAppUrlProblem = vi.fn(async () => null);
    vi.doMock('@/lib/app-url-alert', () => ({ reportAppUrlProblem }));
    vi.doMock('@/lib/auth-secret', () => ({ assertAuthSecretConfigured: () => {} }));
    vi.doMock('@/lib/demo-login', () => ({ assertDemoLoginAllowed: () => {} }));
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const { register } = await import('@/instrumentation');
    await register();
    expect(reportAppUrlProblem).toHaveBeenCalledTimes(1);
  });
});
