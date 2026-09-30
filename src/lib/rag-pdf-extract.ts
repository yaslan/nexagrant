/**
 * PDF text extraction for the shared-corpus upload, off the web server's thread
 * (İNCELEME-52 B-1').
 *
 * The page limit and 20-page slices of İNCELEME-45 B-1 bound how many pages are
 * read, not the work inside one page. pdf.js extracts a page in one synchronous
 * stretch, so a 37 KB PDF with a highly compressed content stream (one text
 * operator repeated 100 000 times) held the event loop for 20 s: 1 of 336
 * pings answered, every tenant's requests waiting behind one admin upload.
 *
 * Extraction therefore runs in a `worker_threads` Worker (src/lib/rag-pdf.worker.ts):
 * - a wall-clock deadline (`maxParseMs`) — past it the thread is terminated;
 * - a V8 heap ceiling (`maxParseHeapMb`) — out of memory kills the thread,
 *   not the server;
 * - a ceiling on what the file's streams inflate to (`maxInflatedMb`,
 *   `maxStreamInflatedMb`), checked before pdf.js starts: decoded streams are
 *   typed arrays outside the V8 heap, which the heap ceiling does not see.
 * Each one is refused as `parse_too_heavy` (413). One extraction runs at a time
 * so that parallel uploads cannot stack up several threads' memory.
 *
 * Why a thread and not a graphile-worker job (ADR-0008): the job would need the
 * PDF bytes stored where the worker process can read them (a table or file
 * store this card does not add), a status the page polls, and the worker's
 * hosting is still open (ADR-0008 §4). It would also not remove the need for
 * this isolation: the same PDF would freeze the worker process and every other
 * job queued behind it. The thread bounds the parse wherever it runs; moving
 * the whole ingest (parse + embedding calls) into a job stays a separate card.
 */
import { Worker } from 'node:worker_threads';
import { RAG_UPLOAD_LIMITS } from '@/lib/rag-upload';
import type { PdfWorkerInput, PdfWorkerOutput } from '@/lib/rag-pdf.worker';

/**
 * A PDF over one of the upload's work limits (`RAG_UPLOAD_LIMITS`), refused
 * before the first embedding call and before any row is written. `code` is the
 * upload route's error code; `detail` carries the measured value and the limit.
 */
export class PdfLimitError extends Error {
  constructor(
    readonly code: 'too_many_pages' | 'too_many_chunks' | 'over_budget' | 'parse_too_heavy',
    readonly detail: Record<string, number>
  ) {
    super(`PDF refused (${code}): ${JSON.stringify(detail)} — nothing was stored`);
    this.name = 'PdfLimitError';
  }
}

/** The text of a PDF, one entry per page, without pdf-parse's page separators. */
export interface ExtractedPdf {
  pages: number;
  text: string;
}

const MB = 1024 * 1024;

/** One extraction at a time; the next waits here, without holding the event loop. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Extract a PDF's text within the upload limits. `maxChars` is the text length
 * past which `maxChunks` is out of reach for the caller's chunk size.
 */
export function extractPdfText(fileBuffer: Buffer, maxChars: number): Promise<ExtractedPdf> {
  const run = queue.then(() => extractInWorker(fileBuffer, maxChars));
  queue = run.catch(() => undefined);
  return run;
}

function extractInWorker(fileBuffer: Buffer, maxChars: number): Promise<ExtractedPdf> {
  const limits = RAG_UPLOAD_LIMITS;
  // A copy the thread owns: `fileBuffer` may be a view into a shared pool.
  const bytes = new Uint8Array(fileBuffer);
  const input: PdfWorkerInput = {
    bytes,
    limits: {
      maxPages: limits.maxPages,
      maxChars,
      maxInflatedBytes: limits.maxInflatedMb * MB,
      maxStreamInflatedBytes: limits.maxStreamInflatedMb * MB,
    },
  };

  return new Promise<ExtractedPdf>((resolve, reject) => {
    const worker = new Worker(new URL('./rag-pdf.worker.ts', import.meta.url), {
      workerData: input,
      transferList: [bytes.buffer],
      resourceLimits: { maxOldGenerationSizeMb: limits.maxParseHeapMb },
    });
    let settled = false;
    // Answer only once the thread is gone, so the next extraction in the queue
    // never runs beside a thread that is still being torn down.
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      worker.terminate().then(fn, fn);
    };
    const deadline = setTimeout(
      () => settle(() => reject(new PdfLimitError('parse_too_heavy', { maxSeconds: limits.maxParseMs / 1000 }))),
      limits.maxParseMs
    );

    worker.once('message', (out: PdfWorkerOutput) =>
      settle(() => {
        if (out.kind === 'ok') resolve({ pages: out.pages, text: out.text });
        else if (out.kind === 'limit') {
          const detail = out.code === 'too_many_chunks' ? { ...out.detail, maxChunks: limits.maxChunks } : out.detail;
          reject(new PdfLimitError(out.code, detail));
        } else reject(new Error(`PDF could not be read: ${out.message}`));
      })
    );
    worker.once('error', (e: Error & { code?: string }) =>
      settle(() =>
        reject(
          e.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new PdfLimitError('parse_too_heavy', { maxHeapMb: limits.maxParseHeapMb })
            : e
        )
      )
    );
    worker.once('exit', (code) => settle(() => reject(new Error(`PDF extraction thread exited (${code}) without an answer`))));
  });
}
