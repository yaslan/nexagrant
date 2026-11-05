import { spawnSync } from 'child_process';
import net from 'net';
import path from 'path';
import { describe, expect, it } from 'vitest';

// FO-388 (3. inceleme): gate-isolated.sh'ın e2e portu kararı. GATE_ISOLATED_DRY_RUN=1 karar satırını basıp
// konteyner/DB işi yapmadan çıkar. Gerçek `git push` yolu (pre-push → pnpm gate → gate-lock) ayrıca
// `bash scripts/gate-isolated.sh git push ...` ile elle koşulur; bkz. docs/agent-results/FO-388-devop-fb-2.md.
const script = path.join(import.meta.dirname, '..', 'scripts', 'gate-isolated.sh');

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

function decide(args: string[], extraEnv: Record<string, string>) {
  const env: Record<string, string | undefined> = { ...process.env, GATE_ISOLATED_DRY_RUN: '1' };
  delete env.E2E_PORT;
  delete env.FONBRIDGE_E2E_PORT_AUTO;
  delete env.FONBRIDGE_E2E_PORT_PREPICK;
  Object.assign(env, extraEnv);
  const res = spawnSync('bash', [script, ...args], { env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
  const line = /auto=(\S*) e2e_port=(\S*) prepick=(\S*)/.exec(`${res.stdout}${res.stderr}`);
  return { status: res.status, out: `${res.stdout}${res.stderr}`, auto: line?.[1] ?? null, e2e: line?.[2] ?? null, prepick: line?.[3] ?? null };
}

describe('gate-isolated.sh e2e port decision (FO-388 3. inceleme)', () => {
  it('komut verilmiş, elle E2E_PORT yok: betik kendi ön seçimini işaretleyip yazar (AUTO=1)', async () => {
    const r = decide(['git', 'push', 'origin', 'x'], {});
    expect(r.status).toBe(0);
    expect(r.auto).toBe('1');
    expect(Number(r.e2e)).toBeGreaterThanOrEqual(3400);
    expect(r.prepick).toBe(r.e2e);
    expect(r.out).toContain('E2E_PORT kilit alındıktan sonra seçilir');
  });

  it('elle verilmiş E2E_PORT: betik ona dokunmaz, AUTO kapalı kalır, ön seçim yazılmaz', async () => {
    const port = await freePort();
    const r = decide(['git', 'push', 'origin', 'x'], { E2E_PORT: String(port) });
    expect(r.status).toBe(0);
    expect(r.auto).toBe('');
    expect(r.e2e).toBe(String(port));
    expect(r.prepick).toBe('');
    expect(r.out).toContain(`E2E_PORT=${port}, elle verilmiş`);
  });
});
