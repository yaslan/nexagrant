/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-2) — source guard.
 *
 * A route's 500 body used to be `errorMessage(error)`: whatever the thrown value
 * said, which for Prisma is the query shape with table and column names. The
 * detail belongs in the server log; the body is a fixed code. This guard fails
 * on any route handler that puts `errorMessage(...)` into an `error:` or
 * `message:` field again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

const API_DIR = resolve(__dirname, '../../src/app/api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

describe('API route 500 bodies', () => {
  test('the guard sees the routes it is meant to guard', () => {
    const files = routeFiles(API_DIR).map((f) => relative(API_DIR, f));
    expect(files).toEqual(expect.arrayContaining(['cagrilar/route.ts', 'cordis/projects/route.ts', 'billing/quote/route.ts']));
  });

  test('no route returns errorMessage(...) in a response field', () => {
    const offenders = routeFiles(API_DIR).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /\b(error|message)\s*:\s*errorMessage\(/.test(line))
        .map(({ n }) => `${relative(API_DIR, file)}:${n}`)
    );
    expect(offenders).toEqual([]);
  });
});
