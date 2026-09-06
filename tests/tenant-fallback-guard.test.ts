import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

/**
 * Guards the "no fallback tenant" rule of `src/lib/tenant.ts`.
 *
 * `prisma.tenant.findFirst()` with no WHERE clause returns whichever tenant
 * happened to be seeded first. Every place that used it as a stand-in for a
 * missing session tenant was a silent cross-tenant read; the last one (the M8
 * consortium page) was removed in this pass. The prose in the surviving JSDoc
 * blocks explains *why* it is gone, so comments are stripped before scanning —
 * only executable code counts.
 */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** Blanks out `/* … *​/` and `// …` so a comment cannot trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('tenant resolution', () => {
  it('never falls back to the first tenant row', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const code = stripComments(fs.readFileSync(file, 'utf-8'));
      if (/\btenant\.findFirst\(\s*\)/.test(code)) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }

    expect(offenders, 'files resolving a tenant with an unfiltered findFirst()').toEqual([]);
  });
});
