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
import { constants, inflateSync } from 'node:zlib';
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
/** `[/FlateDecode /FlateDecode …]` nests; deeper than this is not a document. */
const MAX_INFLATE_DEPTH = 3;
const MB = 1024 * 1024;

/** A zlib header: CM = 8 (deflate) and the FCHECK bits (RFC 1950 §2.2). */
function looksLikeZlib(b: Uint8Array): boolean {
  return b.length >= 2 && (b[0]! & 0x0f) === 8 && ((b[0]! << 8) | b[1]!) % 31 === 0;
}

/**
 * How many bytes `data` inflates to, following nested deflate layers — or
 * `cap + 1` as soon as it is past `cap`. zlib stops at `maxOutputLength`, so a
 * 1000:1 stream costs at most `cap` bytes to measure, never its full size.
 * Data that is not deflate (images, fonts in other filters, an encrypted file)
 * counts as 0: pdf.js decodes it or fails on its own, under the deadline.
 */
function inflatedBytes(data: Uint8Array, cap: number, depth = 0): number {
  if (!looksLikeZlib(data)) return 0;
  let out: Buffer;
  try {
    // Z_SYNC_FLUSH: a stream cut short (a common PDF defect) still reports what it held.
    out = inflateSync(data, { maxOutputLength: cap + 1, finishFlush: constants.Z_SYNC_FLUSH });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') return cap + 1;
    return 0;
  }
  if (out.length > cap || depth + 1 >= MAX_INFLATE_DEPTH) return out.length;
  return out.length + inflatedBytes(out, cap - out.length, depth + 1);
}

/**
 * Walk the file's `stream … endstream` bodies and add up what they inflate to.
 * pdf.js keeps a decoded stream as a typed array, whose bytes are outside the
 * V8 heap — the Worker's `resourceLimits` do not see them, so this is the
 * bound on them. Returns a refusal, or null when the file is within the limits.
 */
export function inflateCheck(buf: Buffer, limits: PdfWorkerInput['limits']): PdfWorkerOutput | null {
  let total = 0;
  let pos = 0;
  while ((pos = buf.indexOf('stream', pos, 'latin1')) !== -1) {
    // `endstream` also contains the word.
    if (pos >= 3 && buf.toString('latin1', pos - 3, pos) === 'end') {
      pos += 6;
      continue;
    }
    let start = pos + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    else if (buf[start - 1] !== 0x0d) {
      // Not the keyword (e.g. `/stream` in a name): the keyword ends its line.
      pos = start;
      continue;
    }
    const end = buf.indexOf('endstream', start, 'latin1');
    if (end === -1) break;
    const cap = Math.min(limits.maxStreamInflatedBytes, limits.maxInflatedBytes - total);
    const n = inflatedBytes(buf.subarray(start, end), cap);
    if (n > cap) {
      return {
        kind: 'limit',
        code: 'parse_too_heavy',
        detail: {
          maxInflatedMb: Math.round(limits.maxInflatedBytes / MB),
          maxStreamInflatedMb: Math.round(limits.maxStreamInflatedBytes / MB),
        },
      };
    }
    total += n;
    pos = end + 9;
  }
  return null;
}

/**
 * - The page count is read first (`getInfo`, no text extraction): 30 000 pages
 *   are refused in a fraction of a second instead of being parsed for minutes.
 * - Extraction stops as soon as the text is past what `maxChunks` could hold.
 * - Pages are joined from `pages[].text`, never from pdf-parse's `text`: that
 *   one carries `-- N of M --` after every page (its default `pageJoiner`),
 *   which made a scan look like a text PDF (İNCELEME-45 B-2).
 */
export async function extractInThisThread(input: PdfWorkerInput): Promise<PdfWorkerOutput> {
  const buf = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  const refused = inflateCheck(buf, input.limits);
  if (refused) return refused;

  const parser = new PDFParse({ data: input.bytes });
  try {
    const { total } = await parser.getInfo();
    if (total > input.limits.maxPages) {
      return { kind: 'limit', code: 'too_many_pages', detail: { pages: total, maxPages: input.limits.maxPages } };
    }
    const pageTexts: string[] = [];
    let length = 0;
    for (let first = 1; first <= total; first += PAGES_PER_SLICE) {
      const last = Math.min(first + PAGES_PER_SLICE - 1, total);
      const slice = await parser.getText({ first, last, pageJoiner: '' });
      for (const page of slice.pages) {
        pageTexts.push(page.text);
        length += page.text.length + 2;
      }
      if (length > input.limits.maxChars) {
        return { kind: 'limit', code: 'too_many_chunks', detail: { pagesRead: last, pages: total } };
      }
    }
    return { kind: 'ok', pages: total, text: pageTexts.join('\n\n') };
  } finally {
    await parser.destroy();
  }
}

if (parentPort) {
  const port = parentPort;
  extractInThisThread(workerData as PdfWorkerInput).then(
    (out) => port.postMessage(out),
    (e: unknown) => port.postMessage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
  );
}
