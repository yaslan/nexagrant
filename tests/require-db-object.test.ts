import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGateRun, skipOrFailOnMissingDbObject } from './helpers/require-db-object';

// NG-350: a live suite whose database lacks a migration, function or seed row skipped itself in
// a local `pnpm gate` and the gate went green. Inside the gate (and in CI) it now throws; outside
// both the old warning-and-skip stays. Every env is injected, so this file means the same inside
// the gate (FONBRIDGE_GATE_RUN=1) as outside it.
describe('skipOrFailOnMissingDbObject (NG-350)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws inside the gate, naming the suite, the reason and the fix', () => {
    expect(() =>
      skipOrFailOnMissingDbObject('agency-report.live', 'add-agency-funnel-province.sql is not applied', {
        FONBRIDGE_GATE_RUN: '1',
      }),
    ).toThrow(/^agency-report\.live: refusing to skip in the gate — add-agency-funnel-province\.sql is not applied\. Run `pnpm db:setup`/);
  });

  it('throws in CI, as skipOrFailInCi did for these sites', () => {
    expect(() => skipOrFailOnMissingDbObject('s', 'r', { CI: 'true' })).toThrow(/^s: refusing to skip in CI — r\./);
  });

  it('outside the gate and CI it warns on stderr and returns, so the suite skips as before', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => skipOrFailOnMissingDbObject('s', 'r', {})).not.toThrow();
    expect(write).toHaveBeenCalledWith('WARNING s skipped: r\n');
  });

  it('reads only FONBRIDGE_GATE_RUN=1 as the gate, and CI=0/false as not CI', () => {
    expect(isGateRun({ FONBRIDGE_GATE_RUN: '1' })).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'yes']) expect(isGateRun({ FONBRIDGE_GATE_RUN: v })).toBe(false);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    for (const CI of ['0', 'false', '']) expect(() => skipOrFailOnMissingDbObject('s', 'r', { CI })).not.toThrow();
  });
});

// The flag has to reach vitest: scripts/gate-lock.mjs sets it for `pnpm run gate:core` only.
// A throwaway root with a gate:core that writes the flag it received stands in for the real one.
describe('gate-lock.mjs sets FONBRIDGE_GATE_RUN for gate:core only (NG-350)', () => {
  const script = path.join(import.meta.dirname, '..', 'scripts');
  const baseEnv: NodeJS.ProcessEnv = { ...process.env, FONBRIDGE_GATE_LOCK_HELD: '', FONBRIDGE_E2E_PORT_AUTO: '' };
  delete baseEnv.FONBRIDGE_GATE_RUN;
  delete baseEnv.E2E_PORT;
  delete baseEnv.FONBRIDGE_E2E_PORT_PREPICK;

  function runIn(args: string[]) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ng350-gate-'));
    try {
      mkdirSync(path.join(root, 'scripts'));
      for (const f of ['gate-lock.mjs', 'gate-cache.mjs']) {
        writeFileSync(path.join(root, 'scripts', f), readFileSync(path.join(script, f)));
      }
      const out = path.join(root, 'flag.txt');
      const probe = `require('fs').writeFileSync(${JSON.stringify(out)}, process.env.FONBRIDGE_GATE_RUN ?? 'unset')`;
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ng350-probe', private: true, scripts: { 'gate:core': `node -e "${probe.replace(/"/g, '\\"')}"` } }));
      const res = spawnSync(process.execPath, [path.join(root, 'scripts', 'gate-lock.mjs'), ...args.map((a) => a.replace('$OUT', out))], {
        cwd: root,
        encoding: 'utf8',
        env: { ...baseEnv, FONBRIDGE_GATE_LOCK_DIR: path.join(root, 'lock'), FONBRIDGE_GATE_NO_CACHE: '1', FONBRIDGE_GATE_PASS_DIR: path.join(root, 'pass') },
      });
      return { status: res.status, stderr: res.stderr, flag: readFileSync(out, 'utf8') };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('pnpm run gate:core gets FONBRIDGE_GATE_RUN=1', () => {
    const r = runIn(['pnpm', 'run', 'gate:core']);
    expect(r.stderr).not.toContain('✖');
    expect(r.flag).toBe('1');
  }, 60_000);

  it('any other command does not', () => {
    const r = runIn([process.execPath, '-e', `require('fs').writeFileSync(process.argv[1], process.env.FONBRIDGE_GATE_RUN ?? 'unset')`, '$OUT']);
    expect(r.status).toBe(0);
    expect(r.flag).toBe('unset');
  });
});
