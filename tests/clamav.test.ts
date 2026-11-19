import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { parseClamdReply, scanBytes } from '@/lib/clamav';
import { EVIDENCE_SCAN_REFUSAL_CODE, evidenceScanRefusal, isEvidenceDownloadable } from '@/lib/evidence-scan-gate';

/**
 * NG-239 — the clamd client against a stand-in clamd on a local socket (the
 * real clamd is in evidence-scan.live.test.ts), and the one download rule.
 */

const servers: Server[] = [];
const sockets: Socket[] = [];
afterEach(async () => {
  for (const c of sockets.splice(0)) c.destroy();
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(null)));
});

/** A clamd that reads the INSTREAM framing and then does `reply(received, socket)`. */
async function fakeClamd(reply: (received: Buffer, socket: Socket) => void): Promise<number> {
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    sockets.push(socket);
    let buf = Buffer.alloc(0);
    socket.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      const cmd = Buffer.from('zINSTREAM\0');
      if (buf.length < cmd.length) return;
      expect(buf.subarray(0, cmd.length).equals(cmd)).toBe(true);
      let off = cmd.length;
      const parts: Buffer[] = [];
      for (;;) {
        if (buf.length < off + 4) return;
        const len = buf.readUInt32BE(off);
        if (len === 0) break;
        if (buf.length < off + 4 + len) return;
        parts.push(buf.subarray(off + 4, off + 4 + len));
        off += 4 + len;
      }
      reply(Buffer.concat(parts), socket);
    });
  });
  servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  return (server.address() as { port: number }).port;
}

describe('parseClamdReply', () => {
  test.each([
    ['stream: OK\0', { verdict: 'clean' }],
    ['stream: Eicar-Test-Signature FOUND\0', { verdict: 'infected', signature: 'Eicar-Test-Signature' }],
    ['stream: Win.Test.EICAR_HDB-1 FOUND', { verdict: 'infected', signature: 'Win.Test.EICAR_HDB-1' }],
    ['INSTREAM size limit exceeded. ERROR\0', { verdict: 'error', reason: 'clamd_error', detail: 'INSTREAM size limit exceeded. ERROR' }],
    ['', { verdict: 'error', reason: 'bad_reply', detail: '' }],
    ['stream: OKAY', { verdict: 'error', reason: 'bad_reply', detail: 'OKAY' }],
    ['FOUND', { verdict: 'error', reason: 'bad_reply', detail: 'FOUND' }],
  ])('%j', (raw, expected) => {
    expect(parseClamdReply(raw)).toEqual(expected);
  });
});

describe('scanBytes over INSTREAM', () => {
  test('sends the bytes in length-prefixed chunks and reads OK as clean', async () => {
    const body = Buffer.alloc(200_000, 7); // more than one 64 KiB chunk
    let seen: Buffer | null = null;
    const port = await fakeClamd((received, s) => {
      seen = received;
      s.end('stream: OK\0');
    });
    expect(await scanBytes(body, { host: '127.0.0.1', port, timeoutMs: 5000 })).toEqual({ verdict: 'clean' });
    expect(seen!.equals(body)).toBe(true);
  });

  test('FOUND is infected, with the signature', async () => {
    const port = await fakeClamd((_r, s) => s.end('stream: Eicar-Test-Signature FOUND\0'));
    expect(await scanBytes(Buffer.from('x'), { host: '127.0.0.1', port, timeoutMs: 5000 })).toEqual({
      verdict: 'infected',
      signature: 'Eicar-Test-Signature',
    });
  });

  test('a clamd that takes the file and never answers is a timeout, not clean', async () => {
    const port = await fakeClamd(() => {});
    const started = Date.now();
    expect(await scanBytes(Buffer.from('x'), { host: '127.0.0.1', port, timeoutMs: 300 })).toEqual({ verdict: 'error', reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test('a clamd that hangs up without a verdict is an error', async () => {
    const port = await fakeClamd((_r, s) => s.destroy());
    expect((await scanBytes(Buffer.from('x'), { host: '127.0.0.1', port, timeoutMs: 5000 })).verdict).toBe('error');
  });

  test('nothing listening is unreachable; no host configured is not_configured', async () => {
    expect(await scanBytes(Buffer.from('x'), { host: '127.0.0.1', port: 9, timeoutMs: 3000 })).toMatchObject({
      verdict: 'error',
      reason: 'unreachable',
    });
    expect(await scanBytes(Buffer.from('x'), { host: '' })).toEqual({ verdict: 'error', reason: 'not_configured' });
  });
});

describe('the download rule (evidence-scan-gate)', () => {
  test('only CLEAN downloads; everything else, unknown values included, is refused', () => {
    expect(isEvidenceDownloadable('CLEAN')).toBe(true);
    expect(evidenceScanRefusal('PENDING')).toBe('scan_pending');
    expect(evidenceScanRefusal('ERROR')).toBe('scan_error');
    expect(evidenceScanRefusal('INFECTED')).toBe('scan_infected');
    for (const v of [undefined, null, '', 'clean', 'SKIPPED', 1]) expect(isEvidenceDownloadable(v), String(v)).toBe(false);
    expect(EVIDENCE_SCAN_REFUSAL_CODE.scan_infected).toBe('EVIDENCE_SCAN_INFECTED');
  });
});
