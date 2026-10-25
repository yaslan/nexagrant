import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { HOOK_GIT_VARS } from '../scripts/tenant-bypass-scan';

/**
 * FO-111: git runs pre-push with GIT_DIR (and in a worktree GIT_INDEX_FILE)
 * exported. The hook must not hand those to `pnpm gate`, or every test that
 * calls git from another cwd talks to this repository instead. A stub `pnpm`
 * first on PATH records what the gate would have inherited.
 */

const ROOT = resolve('.');
const HOOK = join(ROOT, 'githooks/pre-push');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('githooks/pre-push', () => {
  test('runs `pnpm gate` without the git variables the hook was started with', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pre-push-stub-'));
    dirs.push(bin);
    const record = join(bin, 'seen');
    const pnpm = join(bin, 'pnpm');
    writeFileSync(
      pnpm,
      `#!/bin/sh\n{ echo "args=$*"; ${HOOK_GIT_VARS.map((v) => `echo "${v}=\${${v}-<unset>}"`).join('; ')}; } > "${record}"\n`,
    );
    chmodSync(pnpm, 0o755);

    // DATABASE_URL: the hook refuses to run without a database target; a dummy
    // one keeps this test independent of whether the checkout has a .env.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      DATABASE_URL: 'postgresql://hook:hook@localhost:1/hook',
    };
    for (const v of HOOK_GIT_VARS) env[v] = `/leaked/${v}`;
    execFileSync('sh', [HOOK, 'origin', 'git@example.invalid:repo.git'], {
      cwd: ROOT,
      env,
      input: '',
      stdio: ['pipe', 'ignore', 'inherit'],
    });

    expect(readFileSync(record, 'utf8').trim().split('\n')).toEqual([
      'args=gate',
      ...HOOK_GIT_VARS.map((v) => `${v}=<unset>`),
    ]);
  });
});
