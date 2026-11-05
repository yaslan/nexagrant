import { execFileSync, spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// FO-388 yardımcıları: bir portu dinleyip kapatmadan tutmak ve süreç çıktısını toplamak.
function holdPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}
function closeServer(srv: net.Server): Promise<void> {
  return new Promise((resolve) => srv.close(() => resolve()));
}
function waitFor(cond: () => boolean, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() > until) return reject(new Error('waitFor zaman aşımı'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

// scripts/gate-lock.mjs'i gerçek süreç olarak koşar; kilit dizini geçici bir yola yönlendirilir.
const script = path.join(import.meta.dirname, '..', 'scripts', 'gate-lock.mjs');
// Bu test bir gate'in içinde koşabilir; miras gelen HELD=1 kilidi atlatır ve testi boşa çıkarır.
// FO-388: gate-isolated.sh FONBRIDGE_E2E_PORT_AUTO=1 dışa aktarır; miras gelirse elle verilen
// E2E_PORT yok sayılır ve "dolu port" testi hata üretmez. Her testin kendi bayrağı açıkça verilir.
const baseEnv = { ...process.env, FONBRIDGE_GATE_LOCK_HELD: '', FONBRIDGE_E2E_PORT_AUTO: '' };

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

  // FO-388: E2E portu kilit alındıktan sonra seçilir; dolu tabanı atlar.
  it('FO-388: FONBRIDGE_E2E_PORT_AUTO ile e2e portunu dolu tabandan sonraki ilk boş port yapar', async () => {
    const lockDir = path.join(root, 'auto', 'lock');
    const base = await freePort();
    const holder = await holdPort(base);
    try {
      const out = execFileSync(
        process.execPath,
        [script, process.execPath, '-e', 'console.log("E2E=" + process.env.E2E_PORT)'],
        {
          env: {
            ...baseEnv,
            FONBRIDGE_GATE_LOCK_DIR: lockDir,
            FONBRIDGE_E2E_PORT_AUTO: '1',
            FONBRIDGE_E2E_PORT_BASE: String(base),
            E2E_PORT: String(base),
          },
          encoding: 'utf8',
        },
      );
      const port = Number(/E2E=(\d+)/.exec(out)?.[1]);
      expect(port).toBeGreaterThan(base);
    } finally {
      await closeServer(holder);
    }
  });

  it('FO-388: elle verilen E2E_PORT doluysa açık hatayla düşer, komutu koşmaz, kilidi bırakır', () => {
    const lockDir = path.join(root, 'explicit', 'lock');
    const marker = path.join(root, 'ran.txt');
    return freePort().then(async (port) => {
      const holder = await holdPort(port);
      let status: number | undefined;
      let stderr = '';
      try {
        execFileSync(
          process.execPath,
          [script, process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`],
          {
            env: { ...baseEnv, FONBRIDGE_GATE_LOCK_DIR: lockDir, E2E_PORT: String(port) },
            stdio: ['ignore', 'ignore', 'pipe'],
            encoding: 'utf8',
          },
        );
      } catch (err) {
        const e = err as { status?: number; stderr?: string };
        status = e.status;
        stderr = e.stderr ?? '';
      } finally {
        await closeServer(holder);
      }
      expect(status).toBe(1);
      expect(stderr).toContain(`E2E_PORT ${port} dolu`);
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(lockDir)).toBe(false);
    });
  }, 30_000);

  // FO-388 yeniden üretimi: A kilidi tutarken B bekler; B beklerken taban port bir dinleyiciyle
  // doldurulur. Düzeltme öncesi B taban portu miras alır (kırmızı); düzeltme sonrası başka port seçer.
  it('FO-388: kuyrukta bekleyen koşu, kilit alındığında taban portun dolu olduğunu görür ve başka port seçer', async () => {
    const lockDir = path.join(root, 'queue', 'lock');
    const outB = path.join(root, 'b-port.txt');
    const base = await freePort();
    const env = { ...baseEnv, FONBRIDGE_GATE_LOCK_DIR: lockDir };

    // A: kilidi ~3 sn tutar.
    const a = spawn(process.execPath, [script, process.execPath, '-e', 'setTimeout(() => {}, 3000)'], { env });
    await waitFor(() => existsSync(path.join(lockDir, 'owner.json')));

    // B: pre-pick gibi E2E_PORT=base ve AUTO ile başlar; kilidi bekler.
    const b = spawn(
      process.execPath,
      [script, process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(outB)}, process.env.E2E_PORT)`],
      {
        env: {
          ...env,
          FONBRIDGE_E2E_PORT_AUTO: '1',
          FONBRIDGE_E2E_PORT_BASE: String(base),
          E2E_PORT: String(base),
        },
        stdio: 'ignore',
      },
    );
    const bDone = new Promise<number | null>((resolve) => b.on('exit', (code) => resolve(code)));

    // B beklerken taban portu dinleyiciyle doldur (A hâlâ kilitte).
    const holder = await holdPort(base);
    try {
      await new Promise<void>((resolve) => a.on('exit', () => resolve()));
      expect(await bDone).toBe(0);
    } finally {
      await closeServer(holder);
    }
    const chosen = Number(readFileSync(outB, 'utf8'));
    expect(chosen).not.toBe(base);
    expect(chosen).toBeGreaterThan(base);
  }, 60_000);
});
