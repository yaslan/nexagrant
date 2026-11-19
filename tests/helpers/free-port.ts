import net from 'node:net';

/**
 * NG-260 (NG-255 root cause 2): a port that is free on every address a test may listen on.
 *
 * `listen(0, '127.0.0.1')` gives a port that is free on 127.0.0.1 only. On macOS a listener
 * on `*:port` (IPv6 wildcard, what `listen(port)` and `next dev` open) does not stop a
 * 127.0.0.1 bind, so that "free" port then fails with EADDRINUSE on 0.0.0.0 or `::`. Tests
 * hit it when another process (a stray dev server, a left-over test server) sat on the
 * port the kernel handed out.
 *
 * The same rule as scripts/gate-lock.mjs (PROBE_HOSTS / bindFree): the four addresses are
 * tried one by one and only EADDRINUSE means busy; an address the machine lacks (no IPv6:
 * EADDRNOTAVAIL, EAFNOSUPPORT) does not count. A busy pick is dropped and a new one taken,
 * a bounded number of times.
 */
export const PROBE_HOSTS = ['127.0.0.1', '0.0.0.0', '::1', '::'] as const;
const MAX_TRIES = 20;

function bindFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err: NodeJS.ErrnoException) => resolve(err.code !== 'EADDRINUSE'));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/** Free on every address in PROBE_HOSTS right now. */
export async function portFreeEverywhere(port: number): Promise<boolean> {
  for (const host of PROBE_HOSTS) {
    if (!(await bindFree(port, host))) return false;
  }
  return true;
}

/** The kernel's pick on 127.0.0.1, the old freePort(). */
export function kernelPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** `pick` is for the helper's own test; callers use the default. */
export async function freePort(pick: () => Promise<number> = kernelPort): Promise<number> {
  const busy: number[] = [];
  for (let i = 0; i < MAX_TRIES; i++) {
    const port = await pick();
    if (await portFreeEverywhere(port)) return port;
    busy.push(port);
  }
  throw new Error(`freePort: no port free on ${PROBE_HOSTS.join(', ')} after ${MAX_TRIES} tries (busy: ${busy.join(', ')})`);
}
