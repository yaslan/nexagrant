/**
 * The body of the PDF text extraction thread (İNCELEME-52 B-1').
 *
 * `extractPdfText` (src/lib/rag-pdf-extract.ts) runs this in a `worker_threads`
 * Worker, never on the web server's own thread: pdf.js does all of one page's
 * work in a single synchronous stretch, so a 37 KB PDF whose one compressed
 * content stream repeats a text operator 100 000 times held the event loop for
 * 20 s — no other request of any tenant was answered. Here it only holds this
 * thread, which the caller terminates at its deadline.
 *
 * Self-contained on purpose: it imports only Node built-ins and pdf-parse, and
 * takes its limits from `workerData`, so it runs the same bundled by Next.js
 * and loaded as a plain `.ts` file by Node in the tests. Erasable TypeScript
 * only (no enums, no parameter properties) for the same reason.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { deflateSync } from 'node:zlib';
// Before pdf-parse, for its side effect: it imports @napi-rs/canvas statically
// and sets `DOMMatrix`, `Path2D` and `ImageData` on the global object, which
// pdf.js needs just to load in Node. pdf.js's own fallback loads the canvas
// package through a runtime `createRequire`, which Next's file tracing cannot
// follow — the standalone build (the Docker `runner` image) shipped without it
// and every upload failed with "DOMMatrix is not defined". The static import
// here is what makes the tracer copy the package.
import 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';

export interface PdfWorkerInput {
  bytes: Uint8Array;
  limits: {
    maxPages: number;
    /** Past this many characters of text, `maxChunks` is out of reach. */
    maxChars: number;
    /** All streams of the file, inflated. */
    maxInflatedBytes: number;
    /** One stream, inflated. */
    maxStreamInflatedBytes: number;
  };
}

export type PdfWorkerOutput =
  | { kind: 'ok'; pages: number; text: string }
  | { kind: 'limit'; code: 'too_many_pages' | 'too_many_chunks' | 'parse_too_heavy'; detail: Record<string, number> }
  | { kind: 'error'; message: string };

/** Pages per `getText` call — the text length is checked between calls. */
const PAGES_PER_SLICE = 20;
const MB = 1024 * 1024;

/*
 * The inflated-bytes cap (TASK-MUNRAWJ0N84T6, İNCELEME-60 Y-1).
 *
 * It used to be a text scan of the file before pdf.js started: it inflated
 * the bytes between `stream` and the first `endstream` when they began with a
 * zlib header. Every other shape went past it uncounted — LZW, RunLength,
 * ASCIIHex/ASCII85 in front of Flate, a fourth Flate layer, `endstream` bytes
 * inside the compressed data — and an 852-byte file grew the server's RSS by
 * 2 GB inside the 30 s deadline.
 *
 * Now pdf.js's own decoding is counted, as it decodes. Every filter pdf.js
 * implements is a subclass of its internal `DecodeStream`, and each one grows
 * its output through `DecodeStream.prototype.ensureBuffer(requested)` —
 * before it writes the bytes — or, for the image decoders (DCT, JBIG2, JPX),
 * assigns a whole decoded `buffer` at once (those do not run at all here:
 * see `offImageDecoder`). What is counted is the buffer
 * pdf.js allocates, before it allocates it (it grows by doubling, so up to 2×
 * the decoded bytes: that is the memory the cap is for), against
 * `maxStreamInflatedBytes` (one stream object) and `maxInflatedBytes` (all of
 * them, over the whole extraction: a stream that several pages share counts
 * once per page, as pdf.js decodes it once per page). Past either, the counter
 * throws inside pdf.js and the refusal is posted at once, so the caller
 * terminates the thread even if pdf.js catches the error and goes on.
 *
 * `DecodeStream` is not exported by pdf.js. It is found from the first
 * instance pdf.js constructs: its constructor assigns `_rawMinBufferLength`,
 * which a one-shot setter on `Object.prototype` intercepts. That name is
 * pdfjs-dist's (5.4.296, pinned by pdf-parse); if a new version drops it the
 * hook would stay uninstalled, so every extraction first decodes a small Flate
 * PDF and refuses to go on when that was not counted (fail closed).
 */

/** Thrown inside pdf.js to stop a decode; the refusal itself is `meter.refused`. */
class DecodeLimitError extends Error {}

interface DecodeMeter {
  limits: PdfWorkerInput['limits'];
  /** Bytes counted per decode stream object. */
  perStream: WeakMap<object, number>;
  total: number;
  refused: PdfWorkerOutput | null;
  onRefused?: (out: PdfWorkerOutput) => void;
}

/** The extraction being counted; null outside one (the self-test is not counted). */
let meter: DecodeMeter | null = null;
let hookInstalled = false;
const BUFFER = Symbol('decodeStreamBuffer');

/** `stream` now holds `bytes` decoded bytes. Throws past a limit. */
function countDecoded(stream: object, bytes: number): void {
  const m = meter;
  if (!m) return;
  // pdf.js may catch the first throw and go on to the next stream: keep refusing.
  if (m.refused) throw new DecodeLimitError('decode limit');
  const had = m.perStream.get(stream) ?? 0;
  if (bytes <= had) return;
  const total = m.total + bytes - had;
  if (bytes > m.limits.maxStreamInflatedBytes || total > m.limits.maxInflatedBytes) {
    m.refused = {
      kind: 'limit',
      code: 'parse_too_heavy',
      detail: {
        maxInflatedMb: Math.round(m.limits.maxInflatedBytes / MB),
        maxStreamInflatedMb: Math.round(m.limits.maxStreamInflatedBytes / MB),
      },
    };
    m.onRefused?.(m.refused);
    throw new DecodeLimitError('decode limit');
  }
  m.perStream.set(stream, bytes);
  m.total = total;
}

type DecodeStreamLike = { ensureBuffer(requested: number): Uint8Array; minBufferLength: number; [BUFFER]?: unknown };

const imageDecodersSeen = new WeakSet<object>();

/**
 * The image decoders (DCT, JBIG2, JPX) size their output from the image's own
 * header — a 49-byte JBIG2 stream declares a 60000 × 60000 page, 450 MB, which
 * the decoder allocates before `buffer` is assigned and counted. Text
 * extraction never needs one: pdf.js skips images, and a font program (the
 * way to reach them) that is an image is not a font. So while an extraction
 * is counted, they refuse to run and pdf.js falls back to a standard font.
 */
function offImageDecoder(proto: Record<string, unknown>): void {
  if (imageDecodersSeen.has(proto)) return;
  imageDecodersSeen.add(proto);
  if (!Object.prototype.hasOwnProperty.call(proto, 'decodeImage')) return;
  const decodeImage = proto.decodeImage as (this: unknown, ...args: unknown[]) => unknown;
  proto.decodeImage = function (this: unknown, ...args: unknown[]) {
    if (meter) throw new Error('image decoding is off during text extraction');
    return decodeImage.apply(this, args);
  };
}

function hookDecodeStream(instance: object): void {
  // The topmost prototype with its own `ensureBuffer` is DecodeStream's: its
  // subclasses (JpegStream, Jbig2Stream, JpxStream) override it with a no-op.
  let proto: Record<string, unknown> | null = null;
  for (let p = Object.getPrototypeOf(instance); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (Object.prototype.hasOwnProperty.call(p, 'ensureBuffer')) proto = p;
  }
  if (!proto) return;
  const ensureBuffer = proto.ensureBuffer as (this: DecodeStreamLike, requested: number) => Uint8Array;
  Object.defineProperty(proto, 'ensureBuffer', {
    configurable: true,
    writable: true,
    value(this: DecodeStreamLike, requested: number) {
      // Counted before pdf.js allocates: it doubles `minBufferLength` until
      // that holds `requested`. What it then assigns to `buffer` is counted
      // again below, should its growth rule ever differ.
      const held = ArrayBuffer.isView(this[BUFFER]) ? this[BUFFER].byteLength : 0;
      if (requested > held) {
        let size = this.minBufferLength > 0 ? this.minBufferLength : requested;
        while (size < requested) size *= 2;
        countDecoded(this, size);
      }
      return ensureBuffer.call(this, requested);
    },
  });
  Object.defineProperty(proto, 'buffer', {
    configurable: true,
    get(this: DecodeStreamLike) {
      return this[BUFFER];
    },
    set(this: DecodeStreamLike, value: unknown) {
      // The constructor's first assignment shows each subclass once.
      offImageDecoder(Object.getPrototypeOf(this));
      if (ArrayBuffer.isView(value)) countDecoded(this, value.byteLength);
      this[BUFFER] = value;
    },
  });
  hookInstalled = true;
}

function installDecodeHook(): void {
  const name = '_rawMinBufferLength';
  if (hookInstalled || Object.prototype.hasOwnProperty.call(Object.prototype, name)) return;
  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    set(this: object, value: unknown) {
      delete (Object.prototype as Record<string, unknown>)[name];
      Object.defineProperty(this, name, { value, writable: true, enumerable: true, configurable: true });
      hookDecodeStream(this);
    },
  });
}
installDecodeHook();

/** One page whose content stream is Flate: pdf.js must decode it to read the text. */
function selfTestPdf(): Uint8Array {
  const content = deflateSync(Buffer.from('BT /F1 9 Tf 40 800 Td (ok) Tj ET', 'latin1'));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>',
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0]!.length;
  const push = (b: Buffer) => {
    parts.push(b);
    length += b.length;
  };
  objects.forEach((o, i) => {
    offsets.push(length);
    push(Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1'));
  });
  offsets.push(length);
  push(Buffer.from(`4 0 obj\n<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'));
  push(content);
  push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
  const xref = length;
  push(
    Buffer.from(
      `xref\n0 5\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}` +
        `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
      'latin1'
    )
  );
  return new Uint8Array(Buffer.concat(parts));
}

/** Whether pdf.js's decoding is being counted in this thread; decodes a small PDF once to find out. */
async function decodeHookWorks(): Promise<boolean> {
  if (hookInstalled) return true;
  const parser = new PDFParse({ data: selfTestPdf() });
  try {
    await parser.getText();
  } finally {
    await parser.destroy();
  }
  return hookInstalled;
}

/**
 * - The page count is read first (`getInfo`, no text extraction): 30 000 pages
 *   are refused in a fraction of a second instead of being parsed for minutes.
 * - Extraction stops as soon as the text is past what `maxChunks` could hold.
 * - Pages are joined from `pages[].text`, never from pdf-parse's `text`: that
 *   one carries `-- N of M --` after every page (its default `pageJoiner`),
 *   which made a scan look like a text PDF (İNCELEME-45 B-2).
 */
export async function extractInThisThread(
  input: PdfWorkerInput,
  onRefused?: (out: PdfWorkerOutput) => void
): Promise<PdfWorkerOutput> {
  if (!(await decodeHookWorks())) {
    return { kind: 'error', message: 'the decoded-bytes counter could not be attached to pdf.js' };
  }
  const m: DecodeMeter = { limits: input.limits, perStream: new WeakMap(), total: 0, refused: null, onRefused };
  meter = m;
  const parser = new PDFParse({ data: input.bytes });
  try {
    const { total } = await parser.getInfo();
    if (m.refused) return m.refused;
    if (total > input.limits.maxPages) {
      return { kind: 'limit', code: 'too_many_pages', detail: { pages: total, maxPages: input.limits.maxPages } };
    }
    const pageTexts: string[] = [];
    let length = 0;
    for (let first = 1; first <= total; first += PAGES_PER_SLICE) {
      const last = Math.min(first + PAGES_PER_SLICE - 1, total);
      const slice = await parser.getText({ first, last, pageJoiner: '' });
      // pdf.js may have caught the counter's throw and left a page out.
      if (m.refused) return m.refused;
      for (const page of slice.pages) {
        pageTexts.push(page.text);
        length += page.text.length + 2;
      }
      if (length > input.limits.maxChars) {
        return { kind: 'limit', code: 'too_many_chunks', detail: { pagesRead: last, pages: total } };
      }
    }
    return { kind: 'ok', pages: total, text: pageTexts.join('\n\n') };
  } catch (e) {
    if (m.refused) return m.refused;
    throw e;
  } finally {
    meter = null;
    await parser.destroy();
  }
}

if (parentPort) {
  const port = parentPort;
  extractInThisThread(workerData as PdfWorkerInput, (out) => port.postMessage(out)).then(
    (out) => port.postMessage(out),
    (e: unknown) => port.postMessage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
  );
}
