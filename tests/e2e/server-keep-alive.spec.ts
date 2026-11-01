import net from 'node:net';
import { test, expect } from '@playwright/test';

/**
 * FO-199: the e2e web server must not close an idle keep-alive connection.
 *
 * Every API call the specs make (signInAs's GET /api/auth/session, page.request,
 * the `request` fixture) goes through one keep-alive agent in the worker, so the
 * next call reuses the last call's socket. Node's server used to close that socket
 * after ~6 s idle; a call sent at that moment failed with `read ECONNRESET`
 * (m1-partner-signal.spec.ts:347 in the #192 gate). The race itself is a few
 * milliseconds wide and cannot be asserted reliably; its cause can: here one
 * request is sent on a raw socket and the socket must still be open 8 s later.
 * Without tests/e2e/support/server-keep-alive.mjs the server ends it at ~6 s.
 */
const IDLE_MS = 8_000;

test('the e2e web server keeps an idle keep-alive socket open (FO-199)', async ({ baseURL }) => {
  test.setTimeout(30_000);
  const { hostname, port } = new URL(baseURL ?? 'http://localhost:3000');

  const outcome = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(Number(port), hostname === 'localhost' ? '127.0.0.1' : hostname);
    let received = '';
    let idleTimer: NodeJS.Timeout | undefined;
    socket.setEncoding('utf8');
    socket.on('error', reject);
    socket.on('data', (chunk: string) => {
      received += chunk;
      // The session route answers chunked; the zero-length chunk ends the response.
      if (!idleTimer && received.includes('\r\n0\r\n\r\n')) {
        idleTimer = setTimeout(() => {
          socket.destroy();
          resolve('open');
        }, IDLE_MS);
      }
    });
    socket.on('end', () => {
      clearTimeout(idleTimer);
      resolve(idleTimer ? 'closed by server while idle' : `closed before the response ended: ${received.slice(0, 200)}`);
    });
    socket.write(`GET /api/auth/session HTTP/1.1\r\nHost: ${hostname}:${port}\r\nConnection: keep-alive\r\n\r\n`);
  });

  expect(outcome).toBe('open');
});
