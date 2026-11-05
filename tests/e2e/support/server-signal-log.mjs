// Preloaded into every Node process of the e2e web server (playwright.config.ts, NODE_OPTIONS --import),
// and imported by that config, which logs the same for the Playwright runner and its workers.
//
// Why (FO-385): `next dev` handles SIGTERM itself and exits 0, so its parent cannot tell a kill from a
// normal exit. This line, written before anything else runs, is what proves a signal arrived.
// It only logs: a process with no handler of its own still dies by that signal, as it would without this.
// Rollback: delete this file and its --import in playwright.config.ts.
import fs from 'node:fs';
import path from 'node:path';

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.prependListener(signal, () => {
    const record = {
      event: 'signal-received',
      signal,
      at: new Date().toISOString(),
      pid: process.pid,
      ppid: process.ppid,
      title: process.title.slice(0, 60),
      script: path.basename(process.argv[1] ?? ''),
    };
    const line = `[e2e-server-diag] ${JSON.stringify(record)}\n`;
    try {
      fs.writeSync(2, line);
    } catch {
      // EPIPE
    }
    try {
      if (process.env.E2E_SERVER_DIAG_FILE) fs.appendFileSync(process.env.E2E_SERVER_DIAG_FILE, line);
    } catch {
      // Diagnostics must not change how the server behaves.
    }
    if (process.listenerCount(signal) === 1) {
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    }
  });
}
