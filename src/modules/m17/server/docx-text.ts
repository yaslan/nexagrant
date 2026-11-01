/**
 * Plain text of a .docx, in reading order — paragraphs and table cells as they
 * appear in `word/document.xml` (FO-186).
 *
 * The file is a stranger's upload, so it is read the way src/lib/k3-topic-stats/xlsx.ts
 * reads a workbook: zip signature first, an entry-count cap, `document.xml` inflated
 * under a byte counter that ignores what the archive declares, any `<!DOCTYPE` refused
 * (no entity expansion), only the predefined entities decoded, and one forward
 * `indexOf` pass over the XML so a hostile document cannot make the parse quadratic.
 *
 * Output shape: one line per paragraph; a table row is one line with its cells joined
 * by " | " (a cell's own paragraphs joined by a space); a table nested in a cell is
 * inlined into that cell. Headers, footers, footnotes, comments and deleted
 * (tracked-change) text are not read.
 *
 * Work bounds (se-fb B3): table and paragraph nesting stop at `maxNesting` (each
 * open table is a frame held until it closes, so nesting is what turned 118 KB
 * into 564 MB), the XML is capped well below the old 50 MB, and one document is
 * read at a time so parallel uploads cannot stack their parses.
 *
 * CPU bound (FO-195 Ö1): none of that limits the time of the XML walk itself, and a
 * FLAT hostile file under the cap (1.5 M empty paragraphs, 30 KB on disk) held the
 * event loop for hundreds of ms to seconds. The whole read therefore runs in a
 * `worker_threads` Worker (./docx.worker.ts), as the PDF path does
 * (src/lib/rag-pdf-extract.ts): a wall-clock deadline and a V8 heap ceiling end the
 * thread, not the server, and are refused as `parse_too_heavy`.
 */
import { Worker } from 'node:worker_threads';

import { INTERREG_UPLOAD_LIMITS } from '../limits';
import { parseDocumentXml, DocxRefusal } from './docx.worker';
import type { DocxWorkerInput, DocxWorkerOutput } from './docx.worker';

export type DocxReadErrorCode = 'not_docx' | 'malformed' | 'too_large' | 'too_long' | 'parse_too_heavy';

export class DocxReadError extends Error {
  constructor(
    readonly code: DocxReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocxReadError';
  }
}

export interface DocxLimits {
  /** Bytes `word/document.xml` may inflate to. */
  maxXmlBytes: number;
  maxEntries: number;
  /** Characters of extracted text; one more is `too_long`. */
  maxChars: number;
  /** Tables in tables, or paragraphs in paragraphs, deeper than this are `malformed`. */
  maxNesting: number;
  /** Wall-clock for the whole read; past it the thread is ended (default {@link INTERREG_UPLOAD_LIMITS.maxDocxParseMs}). */
  maxParseMs?: number;
  /** V8 heap of the reading thread (default {@link INTERREG_UPLOAD_LIMITS.maxDocxHeapMb}). */
  maxHeapMb?: number;
}

/**
 * Text of a `word/document.xml` body, on the CALLING thread. Pure; for the unit tests
 * of the walk itself — an upload never comes through here (see {@link readDocxText}).
 * Throws {@link DocxReadError} `too_long` past `maxChars`, `malformed` past `maxNesting`.
 */
export function documentXmlToText(
  xml: string,
  maxChars: number = Number.POSITIVE_INFINITY,
  maxNesting: number = INTERREG_UPLOAD_LIMITS.maxDocxNesting,
): string {
  try {
    return parseDocumentXml(xml, maxChars, maxNesting);
  } catch (err) {
    if (err instanceof DocxRefusal) throw new DocxReadError(err.code, err.message);
    throw err;
  }
}

/** Whether the bytes start with a zip local-file header (a .docx is a zip). */
export function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** One document at a time; the next waits here, without holding the event loop (as rag-pdf-extract.ts). */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Text of a .docx file, read off the web server's thread. Throws {@link DocxReadError}
 * on anything that is not a readable, bounded document; `parse_too_heavy` when the
 * deadline or the heap ceiling ended the thread.
 */
export function readDocxText(bytes: Buffer, limits: DocxLimits): Promise<string> {
  const run = queue.then(() => readInWorker(bytes, limits));
  queue = run.catch(() => undefined);
  return run;
}

function readInWorker(bytes: Buffer, limits: DocxLimits): Promise<string> {
  const maxParseMs = limits.maxParseMs ?? INTERREG_UPLOAD_LIMITS.maxDocxParseMs;
  const maxHeapMb = limits.maxHeapMb ?? INTERREG_UPLOAD_LIMITS.maxDocxHeapMb;
  // A copy the thread owns: `bytes` may be a view into a shared pool.
  const copy = new Uint8Array(bytes);
  const input: DocxWorkerInput = {
    bytes: copy,
    limits: {
      maxXmlBytes: limits.maxXmlBytes,
      maxEntries: limits.maxEntries,
      maxChars: limits.maxChars,
      maxNesting: limits.maxNesting,
    },
  };
  const tooHeavy = () =>
    new DocxReadError('parse_too_heavy', `Reading passed ${maxParseMs} ms or ${maxHeapMb} MB of heap.`);

  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./docx.worker.ts', import.meta.url), {
      workerData: input,
      transferList: [copy.buffer],
      resourceLimits: { maxOldGenerationSizeMb: maxHeapMb },
    });
    let settled = false;
    // Answer only once the thread is gone, so the next read in the queue never
    // runs beside a thread that is still being torn down.
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      worker.terminate().then(fn, fn);
    };
    const deadline = setTimeout(() => settle(() => reject(tooHeavy())), maxParseMs);

    worker.once('message', (out: DocxWorkerOutput) =>
      settle(() => {
        if (out.kind === 'ok') resolve(out.text);
        else if (out.kind === 'refused') reject(new DocxReadError(out.code, out.message));
        else reject(new Error(`DOCX could not be read: ${out.message}`));
      }),
    );
    worker.once('error', (e: Error & { code?: string }) =>
      settle(() => reject(e.code === 'ERR_WORKER_OUT_OF_MEMORY' ? tooHeavy() : e)),
    );
    worker.once('exit', (code) => settle(() => reject(new Error(`DOCX reading thread exited (${code}) without an answer`))));
  });
}
