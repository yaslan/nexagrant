#!/usr/bin/env node
// Runs the e2e web server (playwright.config.ts, webServer.command) and reports how it ended (FO-385).
//
// Why: gates went red with ECONNREFUSED halfway through and nothing said why the server was gone.
// Three of those deaths were `pkill -f "next dev"` from another project's session on this machine,
// and the runner kept going for minutes, turning one kill into up to 253 failures.
//
// What it does, and nothing else:
//   - reports the server's exit (code, signal, load, memory, process list) to stderr and to
//     E2E_SERVER_DIAG_FILE, and stops the runner with SIGINT, so the run ends red with its summary
//   - does the same if the port stops answering while the process is still there
//   - reports a wall-clock jump, which is what a sleeping machine looks like from inside
//   - ends the server when the runner is gone, instead of leaving an orphan behind
// It never restarts the server: a dead server stays a red gate.
//
// Playwright ends the run with SIGKILL to the whole process group, so a normal teardown reports nothing.
// macOS and Node do not expose who sent a signal; docs/GATE.md says how to look for the sender.
// Rollback: delete this file and restore webServer.command in playwright.config.ts.
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: server-supervisor.mjs <command> [args...]');
  process.exit(2);
}

const DIAG_FILE = process.env.E2E_SERVER_DIAG_FILE;
const RUNNER_PID = Number(process.env.E2E_RUNNER_PID) || 0;
const PORT = Number(process.env.E2E_PORT) || portFromArgs(args);
const JUMP_MS = Number(process.env.E2E_DIAG_JUMP_MS) || 30_000;
const TICK_MS = Math.min(5_000, Math.ceil(JUMP_MS / 6));
// `next dev` restarts itself when its config changes, and the port is closed meanwhile. 30 seconds is not that.
const REFUSED_TICKS_TO_STOP = 6;
const startedAt = Date.now();

function portFromArgs(list) {
  const i = list.indexOf('--port');
  return i >= 0 ? Number(list[i + 1]) || 0 : 0;
}

// The runner's stderr pipe may already be gone (runner killed); the file still gets the record.
function emit(line) {
  try {
    fs.writeSync(2, `${line}\n`);
  } catch {
    // EPIPE
  }
  if (DIAG_FILE) {
    try {
      fs.appendFileSync(DIAG_FILE, `${line}\n`);
    } catch {
      // Diagnostics must not change how the server behaves.
    }
  }
}

// Command lines of other sessions can carry credentials in a URL.
const redact = (text) => text.replace(/:\/\/[^\s/@]+@/g, '://***@');

function processList() {
  try {
    const out = execFileSync('ps', ['-axww', '-o', 'pid=,ppid=,etime=,rss=,pcpu=,command='], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .filter((line) => /next|playwright|gate-|pkill|killall/.test(line))
      .slice(0, 40)
      .map((line) => redact(line.trim()).slice(0, 170));
  } catch {
    return ['ps unavailable'];
  }
}

function report(event, details = {}) {
  emit(
    `[e2e-server-diag] ${JSON.stringify({
      event,
      at: new Date().toISOString(),
      supervisorPid: process.pid,
      serverPid: child.pid,
      runnerPid: RUNNER_PID,
      port: PORT,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      load: os.loadavg().map((n) => Number(n.toFixed(2))),
      freeMemMb: Math.round(os.freemem() / 1_048_576),
      totalMemMb: Math.round(os.totalmem() / 1_048_576),
      ...details,
    })}`,
  );
}

function stopRunner() {
  if (!RUNNER_PID) return;
  try {
    process.kill(RUNNER_PID, 'SIGINT');
  } catch {
    // Runner already gone.
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Answers false only on a refused connection: a slow answer under load is not a closed port.
function portRefused() {
  return new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host: 'localhost' });
    const done = (refused) => {
      socket.destroy();
      resolve(refused);
    };
    socket.setTimeout(2_000, () => done(false));
    socket.once('connect', () => done(false));
    socket.once('error', (error) => done(error.code === 'ECONNREFUSED'));
  });
}

// macOS keeps the reason a sleep started; other platforms have no such log here.
function lastSleepReason() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    execFile('pmset', ['-g', 'log'], { timeout: 20_000, maxBuffer: 256 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      const lines = stdout.split('\n').filter((line) => /Entering Sleep state due to '(?!Maintenance)/.test(line));
      resolve(lines.at(-1)?.replace(/\s+/g, ' ').slice(0, 120) ?? null);
    });
  });
}

const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
emit(`[e2e-server-diag] started supervisor=${process.pid} server=${child.pid} runner=${RUNNER_PID} port=${PORT}`);

let ready = false;
let finished = false;
let refusedTicks = 0;
let lastTick = Date.now();

function finish(event, details) {
  if (finished) return false;
  finished = true;
  report(event, { ...details, processes: processList() });
  return true;
}

child.on('error', (error) => {
  finish('server-spawn-failed', { message: error.message });
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (finish('server-exit', { code, signal, readyBeforeExit: ready }) && ready) stopRunner();
  process.exit(code ?? 1);
});

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => {
    report('supervisor-signal', { signal });
    child.kill(signal);
  });
}

setInterval(async () => {
  const now = Date.now();
  const gap = now - lastTick;
  lastTick = now;
  if (gap >= JUMP_MS) {
    report('wall-clock-jump', {
      gapSec: Math.round(gap / 1000),
      meaning: 'this process did not run for that long; the machine slept or was frozen',
      lastSleep: await lastSleepReason(),
    });
  }

  if (finished) return;
  if (RUNNER_PID && !alive(RUNNER_PID)) {
    finish('runner-gone', { meaning: 'the test runner ended without tearing the server down; ending the server' });
    child.kill('SIGTERM');
    return;
  }

  if (!PORT) return;
  if (await portRefused()) {
    refusedTicks += 1;
    if (ready && refusedTicks >= REFUSED_TICKS_TO_STOP && finish('server-port-closed', {})) stopRunner();
  } else {
    refusedTicks = 0;
    ready = true;
  }
}, TICK_MS);
