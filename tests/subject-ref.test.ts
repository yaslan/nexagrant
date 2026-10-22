import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { subjectRefOf } from '../src/lib/legal/subject-ref';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * TASK-MVDZHJ0N9MHRY — the erasure request, the data export and the scheduled
 * erasure each write the subject's one-way reference into AuditEvent. If one
 * of them hashed differently, the rows of one person would stop matching. All
 * three now call `subjectRefOf`; this pins its output and keeps a fourth copy
 * from appearing.
 */
const CALL_SITES = [
  'src/actions/user/request-deletion.ts',
  'src/actions/user/export-data.ts',
  'src/lib/jobs/tasks/users-scheduled-deletion.ts',
];

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('subjectRefOf', () => {
  it('is the unchanged sha256 hex of the user id', () => {
    // Known vectors (sha256 of the UTF-8 id, hex): rows written before the
    // refactor must still match what is computed now.
    expect(subjectRefOf('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(subjectRefOf('user-due')).toBe('50d80fb5ceaa3d892af1bead1bf31312f4097f4e7f38851f2e7c7032ace994c8');
  });

  it.each(CALL_SITES)('%s takes the reference from the shared module', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/import \{ subjectRefOf \} from '@\/lib\/legal\/subject-ref';/);
    expect(src).toMatch(/subjectRefOf\(\w+(\.id)?\)/);
    expect(src).not.toMatch(/createHash\(/);
  });

  it('has a single definition under src/', () => {
    const hits = walk(path.join(REPO_ROOT, 'src'))
      .filter((f) => /createHash\(\s*'sha256'\s*\)\s*\.update\(\s*userId\s*\)/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(REPO_ROOT, f));
    expect(hits).toEqual(['src/lib/legal/subject-ref.ts']);
  });
});
