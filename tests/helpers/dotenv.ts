import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Reads a single key out of the repo's .env.
 *
 * Vitest does not load .env into process.env, and loading the whole file for
 * every test run would change behaviour of suites that depend on a variable
 * being absent. So we look up only the one key a test explicitly asks for, and
 * we never mutate process.env.
 */
export function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];

  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return undefined;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) !== key) continue;
    const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '');
    return value === '' ? undefined : value;
  }
  return undefined;
}
