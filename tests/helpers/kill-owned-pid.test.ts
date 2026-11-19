import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { killPidFromFile } from './kill-owned-pid';

// NG-260 review B1: the supervisor test's afterEach kills the pid in <dir>/server-pid. If that
// server already exited and the pid went to an unrelated process, the kill must not land on it.

let dir: string;
const children: ChildProcess[] = [];

function idle(extraArg = '') {
  const code = `${extraArg ? `/*${extraArg}*/` : ''}setInterval(()=>{},1e9)`;
  const child = spawn(process.execPath, ['-e', code], { stdio: 'ignore' });
  children.push(child);
  return child;
}

const exited = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) => child.once('exit', () => resolve()));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng260-kill-'));
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited(child);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('killPidFromFile (NG-260 B1)', () => {
  it('leaves a live process alone when its command does not name the pid file', async () => {
    const foreign = idle();
    const pidFile = path.join(dir, 'server-pid');
    fs.writeFileSync(pidFile, String(foreign.pid));

    expect(killPidFromFile(pidFile)).toBe('not-ours');
    await sleep(300);
    expect(foreign.exitCode).toBeNull();
    expect(foreign.signalCode).toBeNull();
    expect(() => process.kill(foreign.pid!, 0)).not.toThrow();
  });

  it('kills the process whose command names the pid file (the test server)', async () => {
    const pidFile = path.join(dir, 'server-pid');
    const own = idle(pidFile);
    fs.writeFileSync(pidFile, String(own.pid));

    expect(killPidFromFile(pidFile)).toBe('killed');
    await exited(own);
    expect(own.signalCode).toBe('SIGKILL');
  });

  it('does nothing for a missing, empty or garbage pid file', () => {
    const pidFile = path.join(dir, 'server-pid');
    expect(killPidFromFile(pidFile)).toBe('no-pid');
    for (const content of ['', 'abc', '-5', '0', '1.5', 'NaN']) {
      fs.writeFileSync(pidFile, content);
      expect(killPidFromFile(pidFile)).toBe('no-pid');
    }
  });

  it('reports a pid that no longer runs', async () => {
    const pidFile = path.join(dir, 'server-pid');
    const gone = idle(pidFile);
    gone.kill('SIGKILL');
    await exited(gone);
    fs.writeFileSync(pidFile, String(gone.pid));
    expect(killPidFromFile(pidFile)).toBe('not-alive');
  });
});
