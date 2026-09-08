import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, test, expect } from 'vitest';

/**
 * TASK-MTSJHTJZSCILI — the sentinel that replaces src/types/prisma-override.d.ts.
 *
 * The deleted file declared `module '@prisma/client'` and re-typed every
 * delegate loosely, so `pnpm typecheck` accepted a call to a model or a column
 * prisma/schema.prisma does not declare. That was the gate's largest blind spot:
 * the only thing catching a phantom column was the source scan in
 * src/modules/m8/server/schema-contract.test.ts, which reads text rather than
 * types and therefore has known limits of its own (shorthand properties, for
 * one).
 *
 * Removing the file fixed the hole; nothing stopped it coming back. Any ambient
 * `declare module '@prisma/client'` anywhere on the tsconfig include path
 * silently re-widens the delegates for the whole repo, and the symptom is not a
 * failing test — it is tests that keep passing over queries that throw.
 *
 * So this guards the *property*, not the filename:
 *
 * 1. No file may augment the `@prisma/client` module.
 * 2. `tsc` must actually reject a phantom model and a phantom column — asserted
 *    by compiling a throwaway probe, so the guard fails if the delegates go
 *    loose by some route this file did not anticipate.
 */

const REPO = resolve(__dirname, '..');
const SCANNED = ['src', 'prisma', 'scripts', 'tests', 'workers'];

function tsFilesUnder(dir: string): string[] {
  const abs = join(REPO, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const full = join(abs, entry);
    if (statSync(full).isDirectory()) return tsFilesUnder(join(dir, entry));
    return /\.(ts|tsx|mts|d\.ts)$/.test(entry) ? [join(dir, entry)] : [];
  });
}

describe('Prisma delegates carry their generated types', () => {
  test('no file augments the @prisma/client module', () => {
    const offenders = SCANNED.flatMap(tsFilesUnder).filter((file) =>
      /declare\s+module\s+['"]@prisma\/client['"]/.test(readFileSync(join(REPO, file), 'utf8'))
    );

    expect(
      offenders,
      'An ambient `declare module "@prisma/client"` re-types every delegate repo-wide and hides ' +
        'phantom models and columns from `pnpm typecheck`. This is what src/types/prisma-override.d.ts ' +
        'did. Narrow the type at the call site instead.'
    ).toEqual([]);
  });

  /**
   * The behavioural half. Grepping for the old filename would pass over any
   * other way the delegates could go loose, so this compiles a file that names
   * a model and a column the schema does not have and requires `tsc` to reject
   * both. The probe lives in a temp dir outside the tsconfig include path and is
   * compiled on its own, so it never enters `pnpm typecheck`.
   */
  test('tsc rejects a phantom model and a phantom column', () => {
    const probe = [
      "import { prisma } from '../src/lib/db';",
      'export const model = () => prisma.ghostModelThatDoesNotExist.findMany();',
      "export const column = () => prisma.opportunity.findMany({ where: { ghostColumnXyz: 'a' } });",
      'export const ok = () => prisma.opportunity.findMany({ where: { title: "a" } });',
    ].join('\n');

    const dir = join(REPO, 'node_modules', '.cache', 'prisma-delegate-probe');
    const file = join(dir, 'probe.ts');
    spawnSync('mkdir', ['-p', dir]);
    const { writeFileSync, rmSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(file, probe, 'utf8');

    try {
      const result = spawnSync(
        'npx',
        ['tsc', '--noEmit', '--strict', '--skipLibCheck', '--moduleResolution', 'bundler',
         '--module', 'esnext', '--target', 'ES2022', '--incremental', 'false', file],
        { cwd: REPO, encoding: 'utf8' }
      );
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      expect(output, 'a call to a model the schema does not declare must not compile').toMatch(
        /ghostModelThatDoesNotExist/
      );
      expect(output, 'a filter on a column the schema does not declare must not compile').toMatch(
        /ghostColumnXyz/
      );
      // The valid query on the same delegate must not be what failed — otherwise
      // the two assertions above could pass on an unrelated compile error.
      expect(output).not.toMatch(new RegExp(`${relative(REPO, file)}\\(4,`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
