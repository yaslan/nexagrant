import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// NG-331: kapının çıkış kodu gerçek alt süreçten gelmeli. Sabit 0 (ya da sinyalin 1'e indirilmesi) kırmızı
// kapıyı yeşil gösterir ve pre-push onu geçirir. Bu testler scripts/gate-lock.mjs'i gerçek süreç olarak koşar;
// kilit dizini geçici bir yola yönlendirilir, paylaşılan ~/.cache kilidine dokunulmaz.
const script = path.join(import.meta.dirname, '..', 'scripts', 'gate-lock.mjs');

let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'gate-exit-'));
  env = {
    ...process.env,
    FONBRIDGE_GATE_LOCK_DIR: path.join(root, 'lock'),
    FONBRIDGE_GATE_LOCK_HELD: '',
    FONBRIDGE_E2E_PORT_AUTO: '',
    FONBRIDGE_GATE_PASS_DIR: path.join(root, 'pass'),
  };
  delete env.E2E_PORT;
  delete env.FONBRIDGE_E2E_PORT_PREPICK;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(...command: string[]) {
  return spawnSync(process.execPath, [script, ...command], { env, encoding: 'utf8' });
}

describe('gate-lock çıkış kodu (NG-331)', () => {
  it('yeşil alt süreç → 0', () => {
    const r = run(process.execPath, '-e', 'process.exit(0)');
    expect(r.status).toBe(0);
  });

  it('kırmızı alt süreç → gerçek kodu yayar (3 → 3, sabit 0 değil)', () => {
    const r = run(process.execPath, '-e', 'process.exit(3)');
    expect(r.status).toBe(3);
  });

  it('sinyalle ölen alt süreç → 128+n (SIGKILL → 137), 1 değil', () => {
    const r = run(process.execPath, '-e', "process.kill(process.pid, 'SIGKILL')");
    expect(r.status).toBe(128 + 9);
  });

  it('kırmızı kapıdan sonra kilit bırakılır (sonraki koşu bekletilmez)', () => {
    const first = run(process.execPath, '-e', 'process.exit(5)');
    expect(first.status).toBe(5);
    const second = run(process.execPath, '-e', 'process.exit(0)');
    expect(second.status).toBe(0);
  });
});
