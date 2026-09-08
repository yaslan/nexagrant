import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Keeps `ModelName` in src/types/prisma-override.d.ts equal to the set of model
 * delegates prisma/schema.prisma actually produces.
 *
 * Why a test and not a comment: that union is what makes `pnpm typecheck` reject
 * `prisma.organization.findMany()` — a model the schema does not declare. It
 * replaced a `[key: string]: any` index signature that let every name through,
 * and one sprint shipped at least five P0s of exactly that shape (M8 Find
 * Candidates, `/api/v1/partners`, M2 concept notes, CORDIS K1/K2). A union that
 * silently falls behind the schema fails in both directions: a model added to
 * the schema but not here makes correct code stop compiling, and — the reason
 * the union exists — a model *deleted* from the schema but left here keeps a
 * dead call compiling.
 *
 * The name mapping is Prisma's own: the delegate is the model name with its
 * first character lowercased. That was checked against a real
 * `prisma generate` run under TASK-MTSI7YQWUZOFH — all 71 delegate getters in
 * the generated client matched `lowerFirst(model)` exactly.
 *
 * Note this file is not a substitute for
 * src/modules/m8/server/schema-contract.test.ts, and neither replaces the other:
 * that one reads *relations and columns* out of query bodies but only scans
 * `src/`, while the union here is enforced by the compiler and so covers
 * `prisma/`, `scripts/` and `tests/` too — at model granularity only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Every `model X { … }` in the schema, as the delegate name Prisma generates. */
function delegatesFromSchema(): string[] {
  const schema = readFileSync(resolve(REPO_ROOT, 'prisma', 'schema.prisma'), 'utf8');
  return [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)]
    .map((match) => lowerFirst(match[1] as string))
    .sort();
}

/** The `ModelName` union as it is declared today. */
function delegatesFromOverride(): string[] {
  const source = readFileSync(resolve(REPO_ROOT, 'src', 'types', 'prisma-override.d.ts'), 'utf8');
  const union = /type ModelName\s*=([\s\S]*?);/.exec(source);
  if (!union) throw new Error('prisma-override.d.ts no longer declares a `ModelName` union');
  return [...(union[1] as string).matchAll(/'([A-Za-z0-9_]+)'/g)]
    .map((match) => match[1] as string)
    .sort();
}

describe('prisma-override.d.ts ModelName', () => {
  it('lists every model in prisma/schema.prisma', () => {
    const missing = delegatesFromSchema().filter((name) => !delegatesFromOverride().includes(name));
    expect(
      missing.length === 0
        ? ''
        : 'prisma/schema.prisma declares models that `ModelName` in ' +
          'src/types/prisma-override.d.ts does not list, so calling them will not ' +
          `compile: ${missing.join(', ')}`
    ).toBe('');
  });

  it('lists no model prisma/schema.prisma does not declare', () => {
    const schema = delegatesFromSchema();
    const extra = delegatesFromOverride().filter((name) => !schema.includes(name));
    expect(
      extra.length === 0
        ? ''
        : '`ModelName` in src/types/prisma-override.d.ts lists delegates that ' +
          'prisma/schema.prisma no longer declares. The delegate is `undefined` at ' +
          'runtime and every call to it throws, while the compiler still says the ' +
          `code is fine: ${extra.join(', ')}`
    ).toBe('');
  });

  it('has not been widened back to an index signature', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'src', 'types', 'prisma-override.d.ts'),
      'utf8'
    );
    // `ModelDelegate` keeps its own `[method: string]: any` — that one is about
    // query *methods* and is deliberate. What must not come back is an index
    // signature on the client itself, which is what let any model name through.
    const clientBlock = /export interface PrismaClient[\s\S]*?\n  \}/.exec(source);
    expect(
      clientBlock,
      'prisma-override.d.ts no longer declares `interface PrismaClient`'
    ).not.toBeNull();
    expect((clientBlock as RegExpExecArray)[0]).not.toMatch(/\[\s*[A-Za-z_]+\s*:\s*string\s*\]/);
  });
});
