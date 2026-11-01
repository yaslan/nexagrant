import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, test, expect } from 'vitest';

/**
 * TASK-MTSJHTJZSCILI — the sentinel that replaces src/types/prisma-override.d.ts.
 *
 * The deleted file declared the `@prisma/client` module and re-typed every
 * delegate loosely, so `pnpm typecheck` accepted a call to a model or a column
 * prisma/schema.prisma does not declare. That was the gate's largest blind spot:
 * the only thing catching a phantom column was the source scan in
 * src/modules/m8/server/schema-contract.test.ts, which reads text rather than
 * types and has known limits of its own (shorthand properties, for one).
 *
 * Removing the file closed the hole; nothing stopped it coming back. Any ambient
 * augmentation of that module, anywhere on the tsconfig include path, silently
 * re-widens the delegates repo-wide — and the symptom is not a failing test, it
 * is tests that keep passing over queries that throw at runtime.
 *
 * So this guards the *property*, not the filename:
 *
 * 1. No file augments the generated client module.
 * 2. `tsc` actually rejects a phantom model and a phantom column — asserted by
 *    compiling a throwaway probe under the *project* tsconfig, so an ambient
 *    declaration anywhere in the repo is in the probe's program and the guard
 *    fails if the delegates go loose by a route this file did not anticipate.
 */

const REPO = resolve(__dirname, '..');
const SELF = 'tests/prisma-delegate-types-are-real.test.ts';
const SCANNED = ['src', 'prisma', 'scripts', 'tests', 'workers'];

/** Built from parts so this file does not match its own scan. */
const AUGMENTATION = new RegExp(`declare\\s+module\\s+['"]@prisma` + `/client['"]`);

function tsFilesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(join(REPO, dir));
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const rel = join(dir, entry);
    if (statSync(join(REPO, rel)).isDirectory()) return tsFilesUnder(rel);
    return /\.(ts|tsx|mts)$/.test(entry) ? [rel] : [];
  });
}

describe('Prisma delegates carry their generated types', () => {
  test('no file augments the generated client module', () => {
    const offenders = SCANNED.flatMap(tsFilesUnder)
      .filter((file) => file !== SELF)
      .filter((file) => AUGMENTATION.test(readFileSync(join(REPO, file), 'utf8')));

    expect(
      offenders,
      'An ambient augmentation of the generated Prisma client re-types every delegate repo-wide ' +
        'and hides phantom models and columns from `pnpm typecheck` — this is exactly what ' +
        'src/types/prisma-override.d.ts did. Narrow the type at the call site instead.'
    ).toEqual([]);
  });

  /**
   * The behavioural half. Grepping for a shape would pass over any other way the
   * delegates could go loose, so this compiles a file naming a model and a
   * column the schema does not have and requires `tsc` to reject both, while
   * leaving a valid query on the same delegate alone.
   *
   * The probe is written under the repo (so `paths` and every ambient
   * declaration resolve exactly as they do for `pnpm typecheck`) into a
   * dot-directory, which tsconfig's `**` globs skip — it can never leak into the
   * real typecheck even if a run is killed before the cleanup.
   */
  test('tsc rejects a phantom model and a phantom column', () => {
    const dir = join(REPO, '.prisma-delegate-probe');
    const probe = join(dir, 'probe.ts');

    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(
        probe,
        [
          "import { prisma } from '@/lib/db';",
          '',
          '// 3: a model prisma/schema.prisma does not declare',
          'export const model = () => prisma.ghostModelThatDoesNotExist.findMany();',
          '// 5: a column prisma/schema.prisma does not declare',
          "export const column = () => prisma.opportunity.findMany({ where: { ghostColumnXyz: 'a' } });",
          '// 7: a valid query on the same delegate — must still compile',
          "export const valid = () => prisma.opportunity.findMany({ where: { title: 'a' } });",
          '',
        ].join('\n'),
        'utf8'
      );

      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ extends: '../tsconfig.json', include: ['probe.ts', '../src/**/*.d.ts'] }),
        'utf8'
      );

      const result = spawnSync('npx', ['tsc', '--noEmit', '--incremental', 'false', '-p', dir], {
        cwd: REPO,
        encoding: 'utf8',
      });
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      expect(output, 'a call to a model the schema does not declare must not compile').toMatch(
        /ghostModelThatDoesNotExist/
      );
      expect(output, 'a filter on a column the schema does not declare must not compile').toMatch(
        /ghostColumnXyz/
      );
      // Without this, the two assertions above would also pass on a probe that
      // failed to resolve `@/lib/db` at all — a guard that proves nothing.
      expect(output, 'the valid query on line 8 must compile').not.toMatch(/probe\.ts\(8,/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
