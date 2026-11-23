import { execFileSync, spawnSync } from 'node:child_process';
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

  // NG-331: kapı kırmızıysa push durmalı ve hook kapının gerçek çıkış kodunu yaymalı (sabit 0 değil).
  function runHookWithStubGate(exitCode: number) {
    const bin = mkdtempSync(join(tmpdir(), 'pre-push-red-'));
    dirs.push(bin);
    const pnpm = join(bin, 'pnpm');
    writeFileSync(pnpm, `#!/bin/sh\nexit ${exitCode}\n`);
    chmodSync(pnpm, 0o755);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      DATABASE_URL: 'postgresql://hook:hook@localhost:1/hook',
    };
    for (const v of HOOK_GIT_VARS) delete env[v];
    return spawnSync('sh', [HOOK, 'origin', 'git@example.invalid:repo.git'], {
      cwd: ROOT,
      env,
      input: '',
      encoding: 'utf8',
    });
  }

  test('kırmızı kapıda (pnpm gate → 4) push durur ve çıkış kodu 4 olur', () => {
    const r = runHookWithStubGate(4);
    expect(r.status).toBe(4);
    expect(r.stderr).toContain('KAPI KIRMIZI');
  });

  test('yeşil kapıda (pnpm gate → 0) hook 0 ile çıkar', () => {
    const r = runHookWithStubGate(0);
    expect(r.status).toBe(0);
  });

  // NG-331 (B1): kapı HEAD'i sınar. Push edilen commit HEAD değilse yeşil HEAD kırmızı bir commit'i geçirmemeli:
  // kanca stdin'deki ref satırlarını okur ve fail-closed durur. Silme push'u (yerel sha 0…0) muaf.
  function runHookWithPush(pushLines: string, exitCode: number) {
    const bin = mkdtempSync(join(tmpdir(), 'pre-push-ref-'));
    dirs.push(bin);
    const pnpm = join(bin, 'pnpm');
    writeFileSync(pnpm, `#!/bin/sh\necho "STUB-PNPM $*"\nexit ${exitCode}\n`);
    chmodSync(pnpm, 0o755);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      DATABASE_URL: 'postgresql://hook:hook@localhost:1/hook',
    };
    for (const v of HOOK_GIT_VARS) delete env[v];
    return spawnSync('sh', [HOOK, 'origin', 'git@example.invalid:repo.git'], {
      cwd: ROOT,
      env,
      input: pushLines,
      encoding: 'utf8',
    });
  }
  const HEAD_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const OTHER_SHA = 'a'.repeat(40);
  const ZERO_SHA = '0'.repeat(40);

  test('push edilen commit HEAD değilse kapı koşmadan fail-closed durur', () => {
    const r = runHookWithPush(`refs/heads/x ${OTHER_SHA} refs/heads/x ${ZERO_SHA}\n`, 0);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('HEAD değil');
    expect(r.stdout).not.toContain('STUB-PNPM');
  });

  test('silme push\'u (yerel sha 0…0) muaf: kapı koşar ve 0 döner', () => {
    const r = runHookWithPush(`(delete) ${ZERO_SHA} refs/heads/x ${OTHER_SHA}\n`, 0);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('STUB-PNPM gate');
  });

  test('push edilen commit HEAD ise kapı normal koşar (kırmızı → 4)', () => {
    const r = runHookWithPush(`refs/heads/x ${HEAD_SHA} refs/heads/x ${OTHER_SHA}\n`, 4);
    expect(r.status).toBe(4);
    expect(r.stdout).toContain('STUB-PNPM gate');
  });
});
