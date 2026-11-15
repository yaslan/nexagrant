import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NG-196. Module manifests are imported by `src/lib/modules/registry.ts`, which client
 * components (`src/lib/modules/hooks.tsx`) also import. A VALUE import from `@prisma/client`
 * anywhere on that path pulls the Prisma browser client into the client bundle, and the
 * build then fails when `prisma generate` has not run ("Can't resolve '.prisma/client/index-browser'").
 * Type-only imports are erased and stay allowed.
 */
const ROOT = process.cwd();
const VALUE_IMPORT_FROM_PRISMA = /^\s*import\s+(?!type\b)[^;]*from\s+['"]@prisma\/client['"]/m;

function manifestFiles(): string[] {
  const modulesDir = resolve(ROOT, 'src/modules');
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(modulesDir, entry.name, 'manifest.ts'))
    .filter((file) => {
      try {
        readFileSync(file, 'utf8');
        return true;
      } catch {
        return false;
      }
    });
}

describe('module manifests carry no Prisma runtime into the client bundle (NG-196)', () => {
  const files = [...manifestFiles(), resolve(ROOT, 'src/lib/modules/registry.ts'), resolve(ROOT, 'src/lib/modules/types.ts')];

  it('scans every module manifest, so the guard cannot pass on an empty list', () => {
    expect(manifestFiles().length).toBeGreaterThanOrEqual(13);
  });

  it.each(files.map((f) => [f.replace(ROOT + '/', '')]))('%s has no value import from @prisma/client', (rel) => {
    const source = readFileSync(resolve(ROOT, rel), 'utf8');
    expect(VALUE_IMPORT_FROM_PRISMA.test(source)).toBe(false);
  });
});
