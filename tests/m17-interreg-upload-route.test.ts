/**
 * FO-186 fix (se-fb B2) — POST /api/interreg-review/analyses/[id]/documents counts
 * the body as it arrives and cuts it past the cap, whether `content-length` is
 * honest, lying or absent (a chunked request has none).
 *
 * The route handler runs for real on a streamed `NextRequest`; only the session
 * gate and the analysis storage are replaced (the DB side has its own live test,
 * tests/m17-interreg-analyses.live.test.ts). Extraction is the real one.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INTERREG_UPLOAD_LIMITS } from '../src/modules/m17/limits';

const saveDocument = vi.fn();
vi.mock('@/modules/m17/server/gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/m17/server/gate')>();
  return { ...actual, gateInterreg: async () => ({ ok: true, scope: { tenantId: 't1', userId: 'u1', role: 'MEMBER' } }) };
});
vi.mock('@/modules/m17/server/analyses', () => ({
  getAnalysis: async () => ({ id: 'a1', status: 'UPLOADING' }),
  saveDocument: (...args: unknown[]) => saveDocument(...args),
}));

const { POST } = await import('../src/app/api/interreg-review/analyses/[id]/documents/route');

const BOUNDARY = 'm17boundary';
const CAP = INTERREG_UPLOAD_LIMITS.maxFileBytes + INTERREG_UPLOAD_LIMITS.maxFormOverheadBytes;
// A ReadableStream pulls one chunk ahead of its reader to fill its queue, so the
// source may have produced up to two 1 MB chunks past what the route counted.
const READ_SLACK = 2 * 1024 * 1024;
const PROSE = 'The project addresses cross-border cooperation between regions in the programme area. ';

function multipart(fileName: string, content: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="kind"\r\n\r\ncall\r\n` +
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    ),
    content,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

/**
 * A chunked body: `total` bytes of a valid multipart upload, produced on demand
 * 1 MB at a time. `pulled()` says how much the route actually read.
 */
function streamedBody(total: number) {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="kind"\r\n\r\ncall\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="big.txt"\r\n\r\n`,
  );
  const chunk = Buffer.alloc(1024 * 1024, 0x61);
  let sent = 0;
  let first = true;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (first) {
        first = false;
        controller.enqueue(head);
        sent += head.length;
        return;
      }
      if (sent >= total) return controller.close();
      const piece = chunk.subarray(0, Math.min(chunk.length, total - sent));
      sent += piece.length;
      controller.enqueue(new Uint8Array(piece));
    },
  });
  return { stream, pulled: () => sent };
}

function request(body: ReadableStream<Uint8Array> | Buffer, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/interreg-review/analyses/a1/documents', {
    method: 'POST',
    body,
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, ...headers },
    duplex: 'half',
  } as ConstructorParameters<typeof NextRequest>[1]);
}

const params = { params: Promise.resolve({ id: 'a1' }) };

beforeEach(() => {
  saveDocument.mockReset();
  saveDocument.mockImplementation(async () => ({ ok: true, analysis: { id: 'a1', status: 'CALL_READY' } }));
});

describe('document upload body cap (se-fb B2)', () => {
  it('cuts a chunked body without content-length at the cap, never reading on to its end', async () => {
    const body = streamedBody(25 * 1024 * 1024);
    const req = request(body.stream);
    expect(req.headers.get('content-length')).toBeNull();
    const res = await POST(req, params);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large', maxBytes: INTERREG_UPLOAD_LIMITS.maxFileBytes });
    expect(body.pulled()).toBeLessThanOrEqual(CAP + READ_SLACK);
    expect(body.pulled()).toBeLessThan(25 * 1024 * 1024);
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('does not trust a content-length that understates the body, nor one that is not a number', async () => {
    for (const declared of ['100', 'abc']) {
      const body = streamedBody(25 * 1024 * 1024);
      const res = await POST(request(body.stream, { 'content-length': declared }), params);
      expect(res.status, declared).toBe(413);
      expect(body.pulled(), declared).toBeLessThanOrEqual(CAP + READ_SLACK);
    }
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('refuses an honest oversize content-length before reading the body', async () => {
    const body = streamedBody(25 * 1024 * 1024);
    const res = await POST(request(body.stream, { 'content-length': String(25 * 1024 * 1024) }), params);
    expect(res.status).toBe(413);
    // Only the multipart head the stream queued on its own when the request was built.
    expect(body.pulled()).toBeLessThan(1024);
  });

  it('accepts a chunked upload under the cap and stores the extracted text', async () => {
    const payload = multipart('call.md', Buffer.from(`# Call\n\n${PROSE.repeat(5)}`, 'utf8'));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < payload.length; i += 100) controller.enqueue(new Uint8Array(payload.subarray(i, i + 100)));
        controller.close();
      },
    });
    const res = await POST(request(stream), params);
    expect(res.status).toBe(200);
    expect(saveDocument).toHaveBeenCalledTimes(1);
    const [, id, kind, fileName, doc] = saveDocument.mock.calls[0] as [unknown, string, string, string, { text: string }];
    expect([id, kind, fileName]).toEqual(['a1', 'call', 'call.md']);
    expect(doc.text.startsWith('# Call\n\nThe project addresses')).toBe(true);
  });

  it('answers bad_form for a body that is not multipart', async () => {
    const res = await POST(request(Buffer.from('not a form'), { 'content-type': 'text/plain' }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_form' });
  });
});
