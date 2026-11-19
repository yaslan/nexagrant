import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { freePort, kernelPort, portFreeEverywhere } from './free-port';

// NG-260 (NG-255 root cause 2): a `*:port` listener (IPv6 wildcard, what `listen(port)` opens)
// must not let freePort hand that port out. NG-255 measured it on macOS: 127.0.0.1 and ::1 binds
// succeed next to such a listener, 0.0.0.0 and :: fail with EADDRINUSE.
const held: net.Server[] = [];

function holdWildcard(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(port, '::', () => {
      held.push(srv);
      resolve(srv);
    });
  });
}

afterEach(async () => {
  await Promise.all(held.splice(0).map((srv) => new Promise<void>((resolve) => srv.close(() => resolve()))));
});

describe('freePort (NG-260)', () => {
  it('skips a port a wildcard listener holds and returns one free on every address', async () => {
    const taken = await kernelPort();
    await holdWildcard(taken);
    expect(await portFreeEverywhere(taken)).toBe(false);

    const picks = [taken];
    const port = await freePort(async () => picks.shift() ?? kernelPort());

    expect(port).not.toBe(taken);
    expect(await portFreeEverywhere(port)).toBe(true);
  });

  it('gives up after a bounded number of busy picks, naming them', async () => {
    const taken = await kernelPort();
    await holdWildcard(taken);
    await expect(freePort(async () => taken)).rejects.toThrow(`busy: ${taken}`);
  });
});
