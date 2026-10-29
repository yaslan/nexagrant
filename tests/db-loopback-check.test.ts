import { execFile } from 'node:child_process';
import net from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

/**
 * FO-203: scripts/db-loopback-check.mjs, run against real sockets. A fake
 * Postgres answers the SSLRequest with `N`, as a server without TLS does; the
 * intruder answers with HTTP, as whatever took [::1]:P during fe-fb's push did.
 */

const SCRIPT = resolve(__dirname, '../scripts/db-loopback-check.mjs');
const servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

function listen(host: string, port: number, reply: string): Promise<number> {
  const server = net.createServer((socket) => {
    socket.once('data', () => socket.end(reply));
  });
  servers.push(server);
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok((server.address() as net.AddressInfo).port));
  });
}
const postgres = (host: string, port = 0) => listen(host, port, 'N');
const intruder = (host: string, port: number) => listen(host, port, 'HTTP/1.1 400 Bad Request\r\n\r\n');

// Async: spawnSync would block this process, and with it the fake servers' replies.
function check(...urls: string[]): Promise<{ status: number | null; err: string }> {
  return new Promise((ok) => {
    execFile('node', [SCRIPT, ...urls], { encoding: 'utf8' }, (error, _out, err) => {
      ok({ status: error ? (typeof error.code === 'number' ? error.code : null) : 0, err });
    });
  });
}
const url = (host: string, port: number) => `postgresql://u:secret-pw@${host}:${port}/db?schema=public`;

describe('scripts/db-loopback-check.mjs', () => {
  test('localhost with Postgres on 127.0.0.1 only and nothing on ::1: refused, password not printed', async () => {
    const port = await postgres('127.0.0.1');
    const r = await check(url('localhost', port));
    expect(r.status).toBe(1);
    expect(r.err).toContain(`localhost:${port}/db: Postgres is on 127.0.0.1:${port} but not on [::1]:${port} (nothing listens there)`);
    expect(r.err).toContain('Write 127.0.0.1 instead of localhost');
    expect(r.err).not.toContain('secret-pw');
  });

  test('localhost with another process on [::1]:P: refused, and named as not Postgres', async () => {
    const port = await postgres('127.0.0.1');
    await intruder('::1', port);
    const r = await check(url('localhost', port));
    expect(r.status).toBe(1);
    expect(r.err).toContain('something that is not Postgres answers there');
  });

  test('localhost with Postgres on both stacks (docker compose :5433): passes', async () => {
    const port = await postgres('127.0.0.1');
    await postgres('::1', port);
    expect(await check(url('localhost', port))).toEqual({ status: 0, err: '' });
  });

  test('127.0.0.1 in the URL: passes, ::1 never consulted', async () => {
    const port = await postgres('127.0.0.1');
    await intruder('::1', port);
    expect(await check(url('127.0.0.1', port))).toEqual({ status: 0, err: '' });
  });

  test('nothing on the port at all: passes (the gate reports an unreachable database itself)', async () => {
    const port = await postgres('127.0.0.1');
    await new Promise((r) => servers.pop()!.close(r));
    expect(await check(url('localhost', port))).toEqual({ status: 0, err: '' });
  });
});
