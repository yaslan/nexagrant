import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// NG-331 (O1/O2): gate-lock.mjs'in önbellek ve belge-yalnız dallarının ÇIKIŞ KODU doğrudan test edilir.
// Belge-yalnız dalında lint + i18n:check adımları koşar; adım kırmızıysa kapı kırmızı (≠0) dönmeli, sinyalle
// ölürse 128+n. Önbellek isabetinde kapı 0 döner ve hiçbir adım koşmaz. Geçici git fixture'ı kullanılır;
// stub `pnpm` PATH'in başında durur, gerçek pnpm/DB çağrılmaz.
const scripts = path.join(import.meta.dirname, '..', 'scripts');
const LOCK = path.join(scripts, 'gate-lock.mjs');
const CACHE = path.join(scripts, 'gate-cache.mjs');

let root: string;
let bin: string;
let repo: string;
let env: NodeJS.ProcessEnv;

function git(...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.stderr}`);
  return r.stdout;
}

function writeIn(rel: string, body: string) {
  const file = path.join(repo, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

// Taban: `base` dalı. Feat dalında yalnız docs/*.md değişir → gate-cache docsOnly() = true.
function makeDocsOnlyRepo() {
  repo = mkdtempSync(path.join(os.tmpdir(), 'gate-cache-exit-repo-'));
  git('init', '-q', '-b', 'main');
  writeIn('pnpm-lock.yaml', 'lockfile-v1\n');
  writeIn('src/x.ts', 'export const x = 1\n');
  writeIn('docs/README.md', 'belge\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('branch', 'base');
  git('checkout', '-q', '-b', 'feat');
  writeIn('docs/README.md', 'belge v2\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'docs');
}

// Stub pnpm: `script` her çağrıda verilen gövdeyi koşar (exit kodu ya da sinyal).
function stubPnpm(body: string) {
  writeFileSync(path.join(bin, 'pnpm'), `#!/bin/sh\n${body}\n`);
  chmodSync(path.join(bin, 'pnpm'), 0o755);
}

function runGate() {
  return spawnSync(process.execPath, [LOCK, 'pnpm', 'run', 'gate:core'], { cwd: repo, env, encoding: 'utf8' });
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'gate-cache-exit-'));
  bin = path.join(root, 'bin');
  mkdirSync(bin);
  makeDocsOnlyRepo();
  env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    FONBRIDGE_GATE_LOCK_DIR: path.join(root, 'lock'),
    FONBRIDGE_GATE_LOCK_HELD: '',
    FONBRIDGE_GATE_BASE: 'base',
    FONBRIDGE_GATE_PASS_DIR: path.join(root, 'pass'),
    FONBRIDGE_GATE_NO_CACHE: '',
    FONBRIDGE_E2E_PORT_AUTO: '',
  };
  delete env.E2E_PORT;
  delete env.FONBRIDGE_E2E_PORT_PREPICK;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('gate-lock belge-yalnız dalı çıkış kodu (NG-331 O1)', () => {
  it('lint adımı yeşil → kapı 0 (lint + i18n:check koşar)', () => {
    stubPnpm('echo "STUB $*"; exit 0');
    const r = runGate();
    expect(r.stdout).toContain('belge-yalnız');
    expect(r.status).toBe(0);
  });

  it('lint adımı kırmızı (3) → kapı 3 döner, 0 değil', () => {
    stubPnpm('exit 3');
    const r = runGate();
    expect(r.stdout).toContain('belge-yalnız');
    expect(r.status).toBe(3);
  });

  it('lint adımı sinyalle ölür (SIGKILL) → kapı 137 (128+9), 1 değil (O2)', () => {
    stubPnpm('kill -9 $$');
    const r = runGate();
    expect(r.stdout).toContain('belge-yalnız');
    expect(r.status).toBe(128 + 9);
  });
});

describe('gate-lock önbellek dalı çıkış kodu (NG-331 O1)', () => {
  it('yeşil kayıt varken kapı 0 döner ve hiçbir adım (pnpm) koşmaz', () => {
    // Kayıt: aynı tree + lockfile için gateExit 0. Stub pnpm kırmızı olsa da önbellek koşmamalı.
    const w = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `const m = await import(${JSON.stringify(CACHE)}); m.writePass({ tree: m.treeHash(), lock: m.lockHash(), command: 'test' })`],
      { cwd: repo, env, encoding: 'utf8' },
    );
    expect(w.status).toBe(0);
    stubPnpm('echo "STUB-RAN $*"; exit 3');
    const r = runGate();
    expect(r.stdout).toContain('önbellek:');
    expect(r.stdout).not.toContain('STUB-RAN');
    expect(r.status).toBe(0);
  });
});
