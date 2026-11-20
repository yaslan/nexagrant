import { connect } from 'node:net';
import { env } from '@/lib/env';

/**
 * NG-239 — the clamd client (TCP `INSTREAM`), and nothing else.
 *
 * The protocol: `zINSTREAM\0`, then the file as chunks of `<uint32 BE length><bytes>`,
 * then a zero-length chunk; clamd answers one NUL-terminated line:
 *   `stream: OK`                         → clean
 *   `stream: <Signature> FOUND`          → infected
 *   `stream: Heuristics.Limits.Exceeded.<Limit> FOUND` → error (`limits_exceeded`)
 *   `... ERROR` (e.g. size limit exceeded) → error
 *
 * Limits (NG-239 Ö-1): clamd stops unpacking at its MaxScanSize / MaxRecursion /
 * MaxFiles and, by default, still answers `OK`. (One archive member larger than
 * MaxFileSize is cut to that size and scanned, with no alert, on ClamAV 1.5.4.)
 * clamd must run with `AlertExceedsMax yes` (docker-compose.yml
 * `CLAMD_CONF_AlertExceedsMax`), so a file it could not read to the end is
 * reported as `Heuristics.Limits.Exceeded.*`. That is not a signature: the file
 * was not fully scanned, so it is `error`, never clean and never "infected"
 * (the object is kept; it just does not download).
 *
 * Never throws. Anything that is not a clear `OK` is not clean: no host
 * configured, connection refused, a timeout, a reply that cut off or that we
 * cannot read — all are `error`, and the caller keeps the file from download
 * (fail closed, NG-239 kilit kural).
 *
 * The bytes are sent as they are; the verdict line carries no file content and
 * no tenant data, so it may be logged.
 */

export type ClamdVerdict =
  | { verdict: 'clean' }
  | { verdict: 'infected'; signature: string }
  | { verdict: 'error'; reason: ClamdErrorReason; detail?: string };

export type ClamdErrorReason = 'not_configured' | 'unreachable' | 'timeout' | 'clamd_error' | 'bad_reply' | 'limits_exceeded';

/** clamd's name for "this file was not scanned to the end" under `AlertExceedsMax yes`. */
const LIMITS_EXCEEDED = /^Heuristics\.Limits\.Exceeded(\.|$)/;

export interface ClamdOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

/** clamd's own default StreamMaxLength is far above this; chunks keep each write small. */
const CHUNK_BYTES = 64 * 1024;
/** A verdict line is short; a longer reply is not one we understand. */
const MAX_REPLY_BYTES = 4096;

function clamdOptions(opts: ClamdOptions): { host?: string; port: number; timeoutMs: number } {
  return {
    host: opts.host ?? env.CLAMD_HOST,
    port: opts.port ?? Number(env.CLAMD_PORT),
    timeoutMs: opts.timeoutMs ?? Number(env.CLAMD_TIMEOUT_MS),
  };
}

/** Reads clamd's one-line answer. Exported for the unit test of the reply grammar. */
export function parseClamdReply(raw: string): ClamdVerdict {
  const line = raw.replace(/\0+$/, '').trim();
  // `stream: OK` (with or without the `z`-mode prefix "stream:")
  const body = line.replace(/^stream:\s*/, '');
  if (body === 'OK') return { verdict: 'clean' };
  const found = /^(.+)\s+FOUND$/.exec(body);
  if (found && found[1]) {
    const name = found[1].trim().slice(0, 200);
    if (LIMITS_EXCEEDED.test(name)) return { verdict: 'error', reason: 'limits_exceeded', detail: name };
    return { verdict: 'infected', signature: name };
  }
  if (/ERROR$/.test(body)) return { verdict: 'error', reason: 'clamd_error', detail: body.slice(0, 200) };
  return { verdict: 'error', reason: 'bad_reply', detail: body.slice(0, 200) };
}

/** Scans `bytes` with clamd. Resolves within `timeoutMs` (plus a tick); never rejects. */
export function scanBytes(bytes: Buffer, opts: ClamdOptions = {}): Promise<ClamdVerdict> {
  const { host, port, timeoutMs } = clamdOptions(opts);
  if (!host) return Promise.resolve({ verdict: 'error', reason: 'not_configured' });

  return new Promise<ClamdVerdict>((resolve) => {
    let settled = false;
    let reply = '';
    const socket = connect({ host, port });

    const finish = (v: ClamdVerdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(v);
    };
    // One budget for the whole exchange: a clamd that accepts and then stalls is a timeout too.
    const timer = setTimeout(() => finish({ verdict: 'error', reason: 'timeout' }), timeoutMs);

    socket.on('error', (err) => finish({ verdict: 'error', reason: 'unreachable', detail: (err as NodeJS.ErrnoException).code ?? 'socket_error' }));
    socket.on('data', (chunk) => {
      reply += chunk.toString('latin1');
      if (reply.length > MAX_REPLY_BYTES) finish({ verdict: 'error', reason: 'bad_reply', detail: 'reply too long' });
      // clamd ends the verdict with NUL in z-mode.
      else if (reply.includes('\0')) finish(parseClamdReply(reply));
    });
    socket.on('end', () => finish(reply ? parseClamdReply(reply) : { verdict: 'error', reason: 'bad_reply', detail: 'empty reply' }));
    socket.on('close', () => finish(reply ? parseClamdReply(reply) : { verdict: 'error', reason: 'unreachable', detail: 'closed' }));

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let off = 0; off < bytes.length; off += CHUNK_BYTES) {
        const part = bytes.subarray(off, off + CHUNK_BYTES);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length, 0);
        socket.write(len);
        socket.write(part);
      }
      // Zero-length chunk: end of stream. Half-close only; the reply still comes back.
      socket.end(Buffer.alloc(4));
    });
  });
}
