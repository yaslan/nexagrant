import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');

/**
 * TASK-MUMMQDJPXQH63 — every script that pulls in app code loads `.env` with
 * `import 'dotenv/config'` as its FIRST import.
 *
 * ES imports are evaluated before the module body, and src/lib/db.ts and
 * src/lib/env.ts read `process.env` at load time. So the old pattern
 *
 *     import dotenv from 'dotenv';
 *     dotenv.config();
 *     import { prisma } from '../src/lib/db';
 *
 * builds the Prisma pool before `.env` is read: with DATABASE_URL unset in the
 * shell, `pnpm jobs:k2` and friends fell back to db.ts's hard-coded
 * localhost:5432 — on this machine another project's Postgres — instead of the
 * database in `.env`. A side-effect import placed first is evaluated first.
 *
 * `--env-file` on the pnpm command was not used: it covers only `pnpm <script>`
 * (not `pnpm tsx scripts/x.ts`), and Node exits when the file is missing, while
 * the worker image has no `.env`. dotenv skips a missing file and never
 * overrides a variable the environment already sets.
 */

/** Scripts whose runtime imports reach into app code (`../src/…` or `@/…`). */
function importsAppCode(source: string): boolean {
  return /^import\s+(?!type\s)[^;]*?from\s+['"](\.\.\/src\/|@\/)/m.test(source);
}

/** Block comments and whole-line `//` comments, which may quote the old pattern. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Why `source` does not load `.env` before its other imports, or null if it does. */
function dotenvProblem(raw: string): string | null {
  const source = stripComments(raw);
  if (/\bdotenv\.config\s*\(/.test(source)) {
    return 'calls dotenv.config() in the module body — it runs after every import';
  }
  const firstImport = source.match(/^import\b[^;]*;/m)?.[0];
  if (firstImport === undefined) return 'has no import statements';
  if (!/^import\s+['"]dotenv\/config['"];$/.test(firstImport)) {
    return `first import is \`${firstImport.split('\n')[0]}\`, not \`import 'dotenv/config';\``;
  }
  return null;
}

function scriptFiles(): string[] {
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(SCRIPTS_DIR, name));
}

describe('scripts load .env before app code', () => {
  it('the scan finds the scripts it is meant to guard', () => {
    const guarded = scriptFiles().filter((file) => importsAppCode(fs.readFileSync(file, 'utf8')));
    const names = guarded.map((file) => path.basename(file));
    // A scan that matches nothing would pass vacuously.
    expect(names).toEqual(expect.arrayContaining(['run-k2-monthly.ts', 'jobs-worker.ts', 'run-alerts-sweep.ts']));
  });

  it("every script importing app code starts with import 'dotenv/config'", () => {
    const offenders = scriptFiles()
      .map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }))
      .filter(({ source }) => importsAppCode(source))
      .map(({ file, source }) => ({ file: path.relative(REPO_ROOT, file), problem: dotenvProblem(source) }))
      .filter((row) => row.problem !== null);
    expect(offenders).toEqual([]);
  });
});

describe('the detector', () => {
  it('rejects the body-call pattern that caused the bug', () => {
    const src = "import dotenv from 'dotenv';\ndotenv.config();\nimport { prisma } from '../src/lib/db';\n";
    expect(dotenvProblem(src)).toMatch(/dotenv\.config/);
  });

  it('rejects dotenv/config imported after app code', () => {
    const src = "import { prisma } from '../src/lib/db';\nimport 'dotenv/config';\n";
    expect(dotenvProblem(src)).toMatch(/first import/);
  });

  it('does not trip on a comment that quotes the old pattern', () => {
    const src = "// dotenv.config() in a body would run late\nimport 'dotenv/config';\nimport { x } from '../src/x';\n";
    expect(dotenvProblem(src)).toBeNull();
  });

  it('accepts dotenv/config first, after a doc comment and shebang', () => {
    const src = "#!/usr/bin/env tsx\n/**\nimport x from 'y';\n */\nimport 'dotenv/config';\n\nimport { prisma } from '@/lib/db';\n";
    expect(dotenvProblem(src)).toBeNull();
  });

  it('ignores helpers with no runtime app import', () => {
    expect(importsAppCode("import { readFileSync } from 'node:fs';\n")).toBe(false);
    expect(importsAppCode("import type { X } from '../src/lib/x';\n")).toBe(false);
    expect(importsAppCode("import {\n  a,\n} from '../src/lib/x';\n")).toBe(true);
  });
});
