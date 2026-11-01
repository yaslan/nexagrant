import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// scripts/gate-lock.mjs'i gerçek süreç olarak koşar; kilit dizini geçici bir yola yönlendirilir.
const script = path.join(import.meta.dirname, '..', 'scripts', 'gate-lock.mjs');
// Bu test bir gate'in içinde koşabilir; miras gelen HELD=1 kilidi atlatır ve testi boşa çıkarır.
const baseEnv = { ...process.env, FONBRIDGE_GATE_LOCK_HELD: '' };

describe('gate-lock (FO-55)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'gate-lock-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('ebeveyn dizini yokken kilidi oluşturur, komutu koşar ve kilidi bırakır', () => {
    const lockDir = path.join(root, 'yok-ebeveyn', 'lock');

    const out = execFileSync(process.execPath, [script, process.execPath, '-e', 'console.log("calisti")'], {
      env: { ...baseEnv, FONBRIDGE_GATE_LOCK_DIR: lockDir },
      encoding: 'utf8',
    });

    expect(out).toContain('calisti');
    expect(existsSync(lockDir)).toBe(false);
  });

  it('alt komut başarısız olursa çıkış kodunu aynen iletir', () => {
    const lockDir = path.join(root, 'yok-ebeveyn', 'lock');

    let status: number | undefined;
    try {
      execFileSync(process.execPath, [script, process.execPath, '-e', 'process.exit(3)'], {
        env: { ...baseEnv, FONBRIDGE_GATE_LOCK_DIR: lockDir },
        stdio: 'ignore',
      });
    } catch (err) {
      status = (err as { status?: number }).status;
    }
    expect(status).toBe(3);
    expect(existsSync(lockDir)).toBe(false);
  });
});
