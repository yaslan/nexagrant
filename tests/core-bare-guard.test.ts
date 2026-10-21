import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { gitEnvFor } from '../scripts/tenant-bypass-scan';

/**
 * FO-114: core.bare=true in the shared .git/config breaks the main checkout
 * while linked worktrees keep committing. Both hooks must stop with a fix-it
 * message and must not flip the setting back themselves. The hooks run for
 * real against a throwaway repository that carries copies of them; `pnpm` is
 * a stub so no gate runs.
 */

const ROOT = resolve('.');
const COPIED = ['githooks/pre-commit', 'githooks/pre-push', 'scripts/git-core-bare.sh', 'scripts/db-target.sh'];
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const env = gitEnvFor(process.env);

function git(cwd: string, ...args: string[]) {
  return spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
}

/** A repository with the hooks committed, plus a linked worktree of it. */
function repoWithWorktree(): { main: string; wt: string } {
  const base = mkdtempSync(join(tmpdir(), 'core-bare-guard-'));
  dirs.push(base);
  const main = join(base, 'main');
  mkdirSync(main);
  git(main, 'init', '-q');
  for (const file of COPIED) {
    mkdirSync(join(main, file, '..'), { recursive: true });
    copyFileSync(join(ROOT, file), join(main, file));
  }
  git(main, 'add', '--', ...COPIED);
  git(main, 'commit', '-qm', 'hooks');
  git(main, 'config', 'core.hooksPath', 'githooks');
  const wt = join(base, 'wt');
  git(main, 'worktree', 'add', '-q', '-b', 'wt', wt);
  return { main, wt };
}

function bare(main: string): string {
  return git(main, 'config', '--get', 'core.bare').stdout.trim();
}

/** A `pnpm` first on PATH that leaves a marker and runs `then` (shell). */
function stubPnpm(then = ''): { path: string; ran: string } {
  const bin = mkdtempSync(join(tmpdir(), 'core-bare-pnpm-'));
  dirs.push(bin);
  const ran = join(bin, 'ran');
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\ntouch "${ran}"\n${then}\n`);
  chmodSync(join(bin, 'pnpm'), 0o755);
  return { path: `${bin}${delimiter}${process.env.PATH ?? ''}`, ran };
}

function prePush(wt: string, path: string) {
  return spawnSync('sh', ['githooks/pre-push', 'origin', 'git@example.invalid:repo.git'], {
    cwd: wt,
    // DATABASE_URL: the hook refuses to run without a database target.
    env: { ...env, PATH: path, DATABASE_URL: 'postgresql://hook:hook@localhost:1/hook' },
    input: '',
    encoding: 'utf8',
  });
}

describe('githooks/pre-commit', () => {
  test('a linked-worktree commit is refused while core.bare=true, and passes once it is false', () => {
    const { main, wt } = repoWithWorktree();
    writeFileSync(join(wt, 'note.txt'), 'x\n');
    git(wt, 'add', 'note.txt');
    git(main, 'config', 'core.bare', 'true');

    const refused = git(wt, 'commit', '-qm', 'note');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('pre-commit: paylaşılan git yapılandırmasında core.bare=true');
    expect(refused.stderr).toContain('core.bare false');
    expect(bare(main)).toBe('true'); // reported, not silently repaired

    git(main, 'config', 'core.bare', 'false');
    expect(git(wt, 'commit', '-qm', 'note').status).toBe(0);
    expect(git(wt, 'log', '-1', '--format=%s').stdout.trim()).toBe('note');
  });
});

describe('githooks/pre-push', () => {
  test('stops before the gate while core.bare=true', () => {
    const { main, wt } = repoWithWorktree();
    git(main, 'config', 'core.bare', 'true');
    const pnpm = stubPnpm();

    const r = prePush(wt, pnpm.path);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pre-push: paylaşılan git yapılandırmasında core.bare=true');
    expect(existsSync(pnpm.ran)).toBe(false);
    expect(bare(main)).toBe('true');
  });

  test('a green gate that flipped core.bare still fails the push', () => {
    const { main, wt } = repoWithWorktree();
    const pnpm = stubPnpm('git config core.bare true');

    const r = prePush(wt, pnpm.path);
    expect(existsSync(pnpm.ran)).toBe(true);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pre-push (gate sonrası): paylaşılan git yapılandırmasında core.bare=true');
    expect(bare(main)).toBe('true');
  });

  test('runs the gate and passes when core.bare=false', () => {
    const { main, wt } = repoWithWorktree();
    const pnpm = stubPnpm();

    const r = prePush(wt, pnpm.path);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(pnpm.ran)).toBe(true);
    expect(bare(main)).toBe('false');
  });
});
