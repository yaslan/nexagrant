import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dotenvForTests } from '../vitest.config.mjs';

/**
 * FO-357 (FO-356 scenario G): a line in `.env` used to open the shared-database
 * guards of the live suites for every later run in that checkout.
 */
function envFile(body: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'dotenv-guard-')), '.env');
  writeFileSync(file, body);
  return file;
}

afterEach(() => vi.unstubAllEnvs());

describe('dotenvForTests', () => {
  it('passes ordinary keys through', () => {
    vi.stubEnv('FO357_ORDINARY', undefined);
    expect(dotenvForTests(envFile('FO357_ORDINARY=x\n'))).toEqual({ FO357_ORDINARY: 'x' });
  });

  // NG-206 review tur 4 (B-1): RLS_MUTATION_DB opens the ExpertDirectoryEntry mutation tests on
  // a non-"fabrika" shared database; a stale .env line must not be able to open them.
  it.each([['ALLOW_SWEEP_ON_SHARED_DB=1'], ['CI=true'], ['NODE_ENV=development'], ['RLS_MUTATION_DB=fabrika_dev']])(
    'never takes %s from .env',
    (line) => {
      vi.stubEnv('ALLOW_SWEEP_ON_SHARED_DB', undefined);
      vi.stubEnv('CI', undefined);
      vi.stubEnv('RLS_MUTATION_DB', undefined);
      expect(dotenvForTests(envFile(`${line}\n`))).toEqual({});
    },
  );

  it('lets the process environment win over .env', () => {
    vi.stubEnv('FO357_ORDINARY', 'from-process');
    expect(dotenvForTests(envFile('FO357_ORDINARY=x\n'))).toEqual({});
  });
});
