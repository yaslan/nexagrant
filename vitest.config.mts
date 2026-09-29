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
 * - `util.parseEnv` (Node >= 21.7) instead of vite's `loadEnv`: `vite` is not a
 *   direct dependency, so pnpm does not let this file import it.
 */
function dotenvForTests(): Record<string, string> {
  const file = path.join(root, '.env');
  if (!existsSync(file)) return {};
  const parsed = parseEnv(readFileSync(file, 'utf8')) as Record<string, string>;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'NODE_ENV' || process.env[key] !== undefined) continue;
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
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/.next/**', '**/docs/**', '**/.claude/worktrees/**'],
    alias: {
      '@': path.resolve(root, './src'),
    },
  },
});
