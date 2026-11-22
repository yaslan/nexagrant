import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { freePort, kernelPort, portFreeEverywhere } from './free-port';

// NG-260 (NG-255 root cause 2): a `*:port` listener (IPv6 wildcard, what `listen(port)` opens)
// must not let freePort hand that port out. NG-255 measured it on macOS: 127.0.0.1 and ::1 binds
// succeed next to such a listener, 0.0.0.0 and :: fail with EADDRINUSE.
const held: net.Server[] = [];

// NG-294: the kernel picks the port and the wildcard listener that got it stays open. The old
// kernelPort() -> close -> listen(taken) sequence left a gap in which another process could take
// the port, and the test then failed with EADDRINUSE on a busy machine.
async function holdWildcardPort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '::', () => resolve());
  });
  held.push(srv);
  return (srv.address() as net.AddressInfo).port;
}

afterEach(async () => {
  await Promise.all(held.splice(0).map((srv) => new Promise<void>((resolve) => srv.close(() => resolve()))));
});

describe('freePort (NG-260)', () => {
  it('skips a port a wildcard listener holds and returns one free on every address', async () => {
    const taken = await holdWildcardPort();
    expect(await portFreeEverywhere(taken)).toBe(false);

    const picks = [taken];
    const port = await freePort(async () => picks.shift() ?? kernelPort());

    expect(port).not.toBe(taken);
    expect(await portFreeEverywhere(port)).toBe(true);
  });

  it('gives up after a bounded number of busy picks, naming them', async () => {
    const taken = await holdWildcardPort();
    await expect(freePort(async () => taken)).rejects.toThrow(`busy: ${taken}`);
  });
});
