import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * TASK-MUOGMUUAWFEQX (İNCELEME-115 Ö-2). Every rollback file must stop when
 * run with plain psql, before its first statement: scripts/apply-migrations.sh
 * --down is the only caller that opens the system_scope session. The live
 * behaviour is measured in migration-owner-chain.live.test.ts; this file makes
 * sure a new rollback file cannot be added without the guard.
 */
const DIR = resolve(__dirname, '../prisma/migrations');

function rollbackFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(DIR)) {
    const full = join(DIR, entry);
    if (statSync(full).isDirectory()) {
      if (existsSync(join(full, 'down.sql'))) out.push(join(full, 'down.sql'));
    } else if (entry.endsWith('.down.sql')) {
      out.push(full);
    }
  }
  return out.sort();
}

describe('rollback files carry the plain-psql guard', () => {
  const files = rollbackFiles();

  test('there are rollback files to check', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  test.each(files.map((f) => [f.slice(DIR.length + 1), f]))('%s', (_name, file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    const code = lines.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('--'));
    // Nothing may run before the guard, and ON_ERROR_STOP must be on first or
    // psql would print the guard's error and carry on with the file.
    expect(code.slice(0, 2)).toEqual(['\\set ON_ERROR_STOP on', expect.stringMatching(/^\\ir /)]);
    const target = resolve(dirname(file), (code[1] ?? '').slice(4).trim());
    expect(target).toBe(resolve(DIR, '../migration-down-guard.sql'));
  });
});
