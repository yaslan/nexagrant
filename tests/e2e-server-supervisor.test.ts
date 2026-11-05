import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SUPERVISOR = path.resolve('tests/e2e/support/server-supervisor.mjs');
const SIGNAL_LOG = path.resolve('tests/e2e/support/server-signal-log.mjs');

let dir: string;
let diagFile: string;
const started: ChildProcess[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(read: () => T | undefined | false, what: string, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}; diag:\n${diagText()}`);
    await sleep(50);
  }
}

const diagText = () => (fs.existsSync(diagFile) ? fs.readFileSync(diagFile, 'utf8') : '');

function diagEvents(): Array<Record<string, unknown>> {
  return diagText()
    .split('\n')
    .filter((line) => line.startsWith('[e2e-server-diag] {'))
    .map((line) => JSON.parse(line.slice('[e2e-server-diag] '.length)) as Record<string, unknown>);
}

const findEvent = (name: string) => () => diagEvents().find((event) => event.event === name);

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function track(child: ChildProcess) {
  started.push(child);
  return child;
}

/** A stand-in for the Playwright runner: records the SIGINT that stops a run. */
function fakeRunner() {
  const file = path.join(dir, 'runner-sigint');
  const code = `process.on('SIGINT',()=>{require('fs').writeFileSync(${JSON.stringify(file)},'1');process.exit(130)});setInterval(()=>{},1000)`;
  return { child: track(spawn(process.execPath, ['-e', code], { stdio: 'ignore' })), file };
}

/** A stand-in for `next dev`: listens on the port and writes its pid. */
function serverScript(port: number, extra = '') {
  const pidFile = path.join(dir, 'server-pid');
  const code = `const s=require('http').createServer((q,r)=>r.end('ok'));s.listen(${port},()=>require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid)));${extra}`;
  return { code, pidFile };
}

function supervise(port: number, code: string, runnerPid: number | undefined) {
  return track(
    spawn(process.execPath, [SUPERVISOR, process.execPath, '-e', code], {
      stdio: 'ignore',
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        E2E_PORT: String(port),
        E2E_RUNNER_PID: runnerPid ? String(runnerPid) : '',
        E2E_SERVER_DIAG_FILE: diagFile,
        E2E_DIAG_JUMP_MS: '1500',
      },
    }),
  );
}

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fo385-'));
  diagFile = path.join(dir, 'diag');
});

afterEach(() => {
  for (const child of started.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('e2e server supervisor (FO-385)', () => {
  it('reports the signal that killed the server and stops the runner', async () => {
    const port = await freePort();
    const runner = fakeRunner();
    const { code, pidFile } = serverScript(port);
    const supervisor = supervise(port, code, runner.child.pid);
    const pid = Number(await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8'), 'server start'));
    await waitFor(() => { try { return net.connect(port).destroy() && true; } catch { return false; } }, 'port');
    await sleep(600); // the supervisor must have seen the port answer, or this is a startup failure

    process.kill(pid, 'SIGTERM');

    const exit = await waitFor(findEvent('server-exit'), 'server-exit');
    expect(exit).toMatchObject({ signal: 'SIGTERM', code: null, readyBeforeExit: true, serverPid: pid });
    expect(exit.load).toHaveLength(3);
    expect(exit.freeMemMb).toEqual(expect.any(Number));
    expect(Array.isArray(exit.processes)).toBe(true);
    await waitFor(() => fs.existsSync(runner.file), 'SIGINT at the runner');
    await waitFor(() => supervisor.exitCode !== null, 'supervisor exit');
  }, 30_000);

  it('does not stop the runner when the server fails before it ever answered', async () => {
    const port = await freePort();
    const runner = fakeRunner();
    const supervisor = supervise(port, 'process.exit(3)', runner.child.pid);

    const exit = await waitFor(findEvent('server-exit'), 'server-exit');
    expect(exit).toMatchObject({ code: 3, readyBeforeExit: false });
    await waitFor(() => supervisor.exitCode === 3, 'supervisor passes the exit code on');
    expect(fs.existsSync(runner.file)).toBe(false);
  }, 30_000);

  it('reports a closed port while the process is still there, without restarting anything', async () => {
    const port = await freePort();
    const runner = fakeRunner();
    const { code, pidFile } = serverScript(port, `setTimeout(()=>s.close(),1200);s.on('connection',c=>c.destroy());setInterval(()=>{},1000);`);
    supervise(port, code, runner.child.pid);

    await waitFor(findEvent('server-port-closed'), 'server-port-closed');
    await waitFor(() => fs.existsSync(runner.file), 'SIGINT at the runner');
    expect(pidAlive(Number(fs.readFileSync(pidFile, 'utf8')))).toBe(true);
    expect(diagEvents().filter((event) => event.event === 'server-exit')).toHaveLength(0);
  }, 30_000);

  it('reports a wall-clock jump when the process was frozen', async () => {
    const port = await freePort();
    const runner = fakeRunner();
    const { code, pidFile } = serverScript(port);
    const supervisor = supervise(port, code, runner.child.pid);
    await waitFor(() => fs.existsSync(pidFile), 'server start');
    await sleep(500);

    process.kill(supervisor.pid as number, 'SIGSTOP');
    await sleep(2_500);
    process.kill(supervisor.pid as number, 'SIGCONT');

    const jump = await waitFor(findEvent('wall-clock-jump'), 'wall-clock-jump', 30_000);
    expect(jump.gapSec).toBeGreaterThanOrEqual(2);
    expect(fs.existsSync(runner.file)).toBe(false);
  }, 45_000);

  it('ends the server when the runner is gone, leaving no orphan', async () => {
    const port = await freePort();
    const runner = fakeRunner();
    const { code, pidFile } = serverScript(port);
    supervise(port, code, runner.child.pid);
    const pid = Number(await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8'), 'server start'));

    runner.child.kill('SIGKILL');

    await waitFor(findEvent('runner-gone'), 'runner-gone');
    await waitFor(() => !pidAlive(pid), 'server gone');
  }, 30_000);

  // Each form a sibling session's argv can take. The listing filter keeps lines with "next", so every
  // sibling carries that word. The secret value must never reach the diagnostics.
  it.each([
    ['a password in a URL', 'postgres://u:fo385-url-pw@h/db', 'fo385-url-pw'],
    ['NAME=value (KEY)', 'OPENAI_API_KEY=fo385-env-key', 'fo385-env-key'],
    ['--name=value (api-key flag)', '--api-key=fo385-flag-key', 'fo385-flag-key'],
    ['NAME=value (TOKEN, lower case)', 'access_token=fo385-tok', 'fo385-tok'],
    ['--name=value (SECRET)', '--client-secret=fo385-sec', 'fo385-sec'],
    ['NAME=value (PASSWORD)', 'DB_PASSWORD=fo385-db-pw', 'fo385-db-pw'],
  ])('hides a secret in a process listing: %s', async (_form, arg, secret) => {
    const port = await freePort();
    // The sibling's argv carries the secret in one form and a name the listing filter keeps.
    track(spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', 'next', arg], { stdio: 'ignore' }));
    await sleep(300);
    supervise(port, 'process.exit(1)', undefined);

    await waitFor(findEvent('server-exit'), 'server-exit');
    expect(diagText()).toContain('next');
    expect(diagText()).not.toContain(secret);
  }, 30_000);
});

describe('e2e server signal log (FO-385)', () => {
  function runWithPreload(code: string) {
    return track(
      spawn(process.execPath, ['--import', SIGNAL_LOG, '-e', code], {
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, NODE_OPTIONS: '', E2E_SERVER_DIAG_FILE: diagFile },
      }),
    );
  }

  const whenReady = (child: ChildProcess) =>
    new Promise<void>((resolve) => child.stdout?.once('data', () => resolve()));

  it('logs the signal and the process still dies by it when it has no handler', async () => {
    const child = runWithPreload(`console.log('up');setInterval(()=>{},1000)`);
    await whenReady(child);

    child.kill('SIGTERM');

    await waitFor(() => child.signalCode !== null, 'death by signal');
    expect(child.signalCode).toBe('SIGTERM');
    expect(diagEvents()[0]).toMatchObject({ event: 'signal-received', signal: 'SIGTERM', pid: child.pid });
  }, 30_000);

  it('leaves a process with its own handler to that handler', async () => {
    const child = runWithPreload(`process.on('SIGTERM',()=>process.exit(0));console.log('up');setInterval(()=>{},1000)`);
    await whenReady(child);

    child.kill('SIGTERM');

    await waitFor(() => child.exitCode !== null, 'clean exit');
    expect(child.exitCode).toBe(0);
    expect(diagEvents()[0]).toMatchObject({ event: 'signal-received', signal: 'SIGTERM' });
  }, 30_000);
});
