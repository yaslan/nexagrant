import { defineConfig } from 'vitest/config';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { parseEnv } from 'util';

const root = import.meta.dirname || __dirname;

/**
 * TASK-MULQKN4K7SRN0 — a bare `pnpm test` reads `.env`, so the live suites
 * reach the local DB (host port 5433) instead of falling back to
 * `src/lib/db.ts`'s localhost:5432 default, which on this machine is another
 * project's Postgres ("Authentication failed").
 *
 * - The process environment wins: CI has no `.env` and gets its URLs from the
 *   job's `env:`, and a developer's `DATABASE_URL=… pnpm test` still overrides.
 * - `NODE_ENV` is never taken from `.env` (it says `development`); vitest owns it.
 * - The switches that open a live suite's guard on the shared `fabrika` database,
 *   `CI` and `ALLOW_SWEEP_ON_SHARED_DB`, are never taken from `.env` either. A file
 *   stays behind and opens the guard for every later run; these must be said by the
 *   one command they apply to (FO-357).
 * - `util.parseEnv` (Node >= 21.7) instead of vite's `loadEnv`: `vite` is not a
 *   direct dependency, so pnpm does not let this file import it.
 */
const NEVER_FROM_DOTENV = new Set(['NODE_ENV', 'CI', 'ALLOW_SWEEP_ON_SHARED_DB']);

export function dotenvForTests(file = path.join(root, '.env')): Record<string, string> {
  if (!existsSync(file)) return {};
  const parsed = parseEnv(readFileSync(file, 'utf8')) as Record<string, string>;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (NEVER_FROM_DOTENV.has(key) || process.env[key] !== undefined) continue;
    env[key] = value;
  }
  return env;
}

export default defineConfig({
  test: {
    env: {
      ...dotenvForTests(),
      // TASK-MULSCEK4JHK8X — tests exercise the demo sign-in path, which is off
      // unless this says otherwise (src/lib/demo-login.ts).
      DEMO_LOGIN_ENABLED: 'true',
    },
    // TASK-MUNSRKW0HJYBV (İNCELEME-63 Ö-C) — vitest's 5 s default is a
    // budget for one test on an idle machine. The property sweeps
    // (withholding-rounding, vat-by-country, invoice-writer: every amount × every
    // rate), the source scanners (use-server-exports, server-action-rbac-guard:
    // 3.6–4.3 s idle) and the live suites' database fixtures took 5–10 s at a
    // load average of 40–120 on the shared machine, and a full run showed 31
    // "Test timed out in 5000ms" reds that pass alone. A test with its own
    // budget still sets it; a test that hangs still fails.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/.next/**', '**/docs/**', '**/.claude/worktrees/**', '**/.claude-fo49/**', '**/_workspace/**'],
    alias: {
      '@': path.resolve(root, './src'),
    },
    // TASK-MUM676F010E9G — next-auth's ESM imports `next/server` without an
    // extension, which Node's resolver refuses when the package is loaded
    // externally. Inlined, vite resolves it; tests/oauth-registration.live.test.ts
    // runs the real Auth.js callback through it. next-intl's middleware has the
    // same import; src/lib/security-headers.test.ts runs src/proxy.ts through it.
    server: { deps: { inline: ['next-auth', 'next-intl'] } },
  },
});
