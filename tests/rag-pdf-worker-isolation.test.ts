/**
 * TASK-MULQL8QB679LQ — İNCELEME-52 B-1': no PDF holds the server's event loop.
 *
 * The page limit and 20-page slices bounded how many pages were read, not the
 * work inside one page. pdf.js extracts a page in one synchronous stretch, so
 * a 37 KB PDF whose compressed content stream repeated one text operator
 * 100 000 times answered 1 of 336 pings in 20 s. Extraction now runs in a
 * worker thread with a deadline, a heap ceiling and a ceiling on inflated
 * stream bytes (src/lib/rag-pdf-extract.ts). These run the real pdf-parse.
 */
import { deflateSync } from 'node:zlib';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  ascii85Encode,
  asciiHexEncode,
  densePageLines,
  flatePdf,
  fontFilePdf,
  inPlaceTextContent,
  jbig2BlankPage,
  lzwLiteral,
  lzwRun,
  lzwRunSize,
  runLengthEncode,
  streamPdf,
  syntheticPdf,
  zlibWithStoredEndstream,
} from './helpers/synthetic-pdf';

// The limits are the real ones unless a test lowers one.
const limits = vi.hoisted(() => ({ current: {} as Record<string, number>, actual: {} as Record<string, number> }));
vi.mock('../src/lib/rag-upload', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/rag-upload')>('../src/lib/rag-upload');
  limits.actual = { ...actual.RAG_UPLOAD_LIMITS };
  limits.current = { ...actual.RAG_UPLOAD_LIMITS };
  return { ...actual, RAG_UPLOAD_LIMITS: limits.current };
});

// The real Worker, counted: how many threads are alive at once, and a switch
// that terminates the next thread before it can answer.
const threads = vi.hoisted(() => ({ alive: 0, maxAlive: 0, killNext: false }));
vi.mock('node:worker_threads', async () => {
  const actual = await vi.importActual<typeof import('node:worker_threads')>('node:worker_threads');
  class CountedWorker extends actual.Worker {
    constructor(...args: ConstructorParameters<typeof actual.Worker>) {
      super(...args);
      threads.alive++;
      threads.maxAlive = Math.max(threads.maxAlive, threads.alive);
      this.once('exit', () => threads.alive--);
      if (threads.killNext) {
        threads.killNext = false;
        void this.terminate();
      }
    }
  }
  return { ...actual, Worker: CountedWorker };
});

const { extractPdfText, PdfLimitError } = await import('../src/lib/rag-pdf-extract');
const { hasMeaningfulText } = await import('../src/lib/rag-upload');

const MAX_CHARS = 2500 * 800 + 200;

beforeEach(() => {
  Object.assign(limits.current, limits.actual);
});

/** Run `work` while a 20 ms timer counts how often the event loop got a turn. */
async function withPings<T>(work: () => Promise<T>): Promise<{ result: T | unknown; ms: number; pings: number; worstGapMs: number }> {
  let pings = 0;
  let last = performance.now();
  let worstGapMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    worstGapMs = Math.max(worstGapMs, now - last);
    last = now;
    pings++;
  }, 20);
  const started = performance.now();
  let result: T | unknown;
  try {
    result = await work();
  } catch (e) {
    result = e;
  } finally {
    clearInterval(timer);
  }
  worstGapMs = Math.max(worstGapMs, performance.now() - last);
  return { result, ms: performance.now() - started, pings, worstGapMs };
}

describe("B-1': the event loop keeps turning while pdf.js works on one heavy page", () => {
  test('İNCELEME-52 shape: 20 pages sharing one compressed stream of 100 000 text operators', async () => {
    // What this measures is the event loop while the worker works, not the
    // deadline (the next test does that): on a loaded machine the real 30 s
    // deadline refused this PDF as parse_too_heavy and the pings went
    // unmeasured (TASK-MUNSRKW0HJYBV, İNCELEME-63 Ö-C).
    limits.current.maxParseMs = 150_000;
    const pdf = flatePdf({ content: inPlaceTextContent(100_000), pages: 20, shared: true });
    expect(pdf.length).toBeLessThan(40_000);
    const { result, ms, pings, worstGapMs } = await withPings(() => extractPdfText(pdf, MAX_CHARS));
    // On the main thread this was ~0 pings for the whole run (worst gap = the run).
    expect(result).toMatchObject({ pages: 20 });
    expect(ms).toBeGreaterThan(1_000);
    expect(pings).toBeGreaterThanOrEqual(Math.floor(ms / 20) / 2);
    expect(worstGapMs).toBeLessThan(500);
  }, 180_000);

  test('past maxParseMs the thread is terminated and the PDF refused as parse_too_heavy', async () => {
    limits.current.maxParseMs = 500;
    const pdf = flatePdf({ content: inPlaceTextContent(100_000), pages: 20, shared: true });
    const { result, ms } = await withPings(() => extractPdfText(pdf, MAX_CHARS));
    expect(result).toBeInstanceOf(PdfLimitError);
    expect(result).toMatchObject({ code: 'parse_too_heavy', detail: { maxSeconds: 0.5 } });
    expect(ms).toBeLessThan(2_000);

    // The terminated thread leaves nothing behind that blocks the next upload.
    limits.current.maxParseMs = limits.actual.maxParseMs!;
    await expect(extractPdfText(syntheticPdf(['After a timeout']), MAX_CHARS)).resolves.toMatchObject({ pages: 1 });
  }, 30_000);

  test('out of heap kills the thread, not the server: parse_too_heavy', async () => {
    limits.current.maxParseHeapMb = 4;
    const e = await extractPdfText(flatePdf({ content: inPlaceTextContent(100_000), pages: 20, shared: true }), MAX_CHARS).catch(
      (err: unknown) => err
    );
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxHeapMb: 4 } });
  }, 30_000);
});

describe('decompression bomb: inflated stream bytes are capped before pdf.js starts', () => {
  test('one stream inflating past maxStreamInflatedMb', async () => {
    limits.current.maxStreamInflatedMb = 1;
    const pdf = flatePdf({ content: Buffer.alloc(2 * 1024 * 1024, 0x20) });
    expect(pdf.length).toBeLessThan(10_000);
    const e = await extractPdfText(pdf, MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxStreamInflatedMb: 1 } });
  });

  test('a stream at exactly maxStreamInflatedMb is not refused for its size', async () => {
    limits.current.maxStreamInflatedMb = 1;
    // Text operators padded with spaces to exactly 1 MB inflated.
    const text = Buffer.from('BT /F1 9 Tf 40 800 Td (Exactly at the limit) Tj ET\n', 'latin1');
    const content = Buffer.concat([text, Buffer.alloc(1024 * 1024 - text.length, 0x20)]);
    await expect(extractPdfText(flatePdf({ content }), MAX_CHARS)).resolves.toMatchObject({ pages: 1 });
  });

  test('streams under the per-stream cap that add up past maxInflatedMb', async () => {
    limits.current.maxStreamInflatedMb = 1;
    limits.current.maxInflatedMb = 3;
    const pdf = flatePdf({ content: Buffer.alloc(900 * 1024, 0x20), pages: 4 });
    const e = await extractPdfText(pdf, MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxInflatedMb: 3 } });
  });

  test('a stream compressed twice ([/FlateDecode /FlateDecode]) is measured through both layers', async () => {
    limits.current.maxStreamInflatedMb = 1;
    const pdf = flatePdf({ content: Buffer.alloc(8 * 1024 * 1024, 0x20), layers: 2 });
    expect(pdf.length).toBeLessThan(2_000);
    const e = await extractPdfText(pdf, MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy' });
  });

  test('a 128 MB-inflating stream (~130 KB file) is refused at the real limits, fast', async () => {
    const pdf = flatePdf({ content: Buffer.alloc(128 * 1024 * 1024, 0x20) });
    const { result, ms, worstGapMs } = await withPings(() => extractPdfText(pdf, MAX_CHARS));
    expect(result).toMatchObject({ code: 'parse_too_heavy' });
    expect(ms).toBeLessThan(3_000);
    expect(worstGapMs).toBeLessThan(500);
  }, 60_000);
});

/**
 * TASK-MUNRAWJ0N84T6 (İNCELEME-60 Y-1): the cap was a text scan of the file
 * that measured only streams whose first layer was zlib, up to the first
 * `endstream` bytes. What pdf.js decodes is now counted as it decodes it,
 * whatever the filter chain.
 */
describe('decompression bomb: every filter chain pdf.js decodes is counted', () => {
  const MB = 1024 * 1024;
  const spaces = (mb: number) => Buffer.alloc(mb * MB, 0x20);

  test('LZWDecode', async () => {
    limits.current.maxStreamInflatedMb = 1;
    const data = lzwRun(1);
    expect(lzwRunSize(1)).toBeGreaterThan(7 * MB);
    const e = await extractPdfText(streamPdf({ data, filter: '/LZWDecode' }), MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxStreamInflatedMb: 1 } });
  });

  test.each([
    ['[/ASCIIHexDecode /FlateDecode]', (b: Buffer) => asciiHexEncode(deflateSync(b))],
    ['[/ASCII85Decode /FlateDecode]', (b: Buffer) => ascii85Encode(deflateSync(b))],
    ['/RunLengthDecode', (b: Buffer) => runLengthEncode(b)],
    ['[/FlateDecode /FlateDecode /FlateDecode /FlateDecode]', (b: Buffer) => deflateSync(deflateSync(deflateSync(deflateSync(b))))],
  ])('%s', async (filter, encode) => {
    limits.current.maxStreamInflatedMb = 1;
    const e = await extractPdfText(streamPdf({ data: encode(spaces(4)), filter }), MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxStreamInflatedMb: 1 } });
  });

  test('an image decoder reached through a font program (/JBIG2Decode) does not run', async () => {
    // A 49-byte stream declaring a 60000 × 60000 page: 450 MB, allocated by
    // the decoder from the header before any count could see it. Text
    // extraction never needs an image decoded; the font falls back.
    const pdf = fontFilePdf({ data: jbig2BlankPage(60_000, 60_000), filter: '/JBIG2Decode' });
    expect(pdf.length).toBeLessThan(2_000);
    // Decoded, 450 MB would be past this cap and refused.
    limits.current.maxStreamInflatedMb = 1;
    const { result, ms } = await withPings(() => extractPdfText(pdf, MAX_CHARS));
    expect(result).toMatchObject({ pages: 1, text: expect.stringContaining('Font file') });
    expect(ms).toBeLessThan(5_000);
  });

  test('a bomb in a font program, where pdf.js catches the error and falls back to a standard font', async () => {
    // pdf.js swallows a font that fails to load; the refusal must not depend on
    // the error reaching extractInThisThread.
    limits.current.maxStreamInflatedMb = 1;
    const pdf = fontFilePdf({ data: lzwRun(1), filter: '/LZWDecode' });
    const e = await extractPdfText(pdf, MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxStreamInflatedMb: 1 } });
  });

  test('`endstream` bytes inside the compressed data do not end the count', async () => {
    limits.current.maxStreamInflatedMb = 1;
    const data = zlibWithStoredEndstream(spaces(4));
    expect(data.includes('endstream')).toBe(true);
    const e = await extractPdfText(streamPdf({ data, filter: '/FlateDecode' }), MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxStreamInflatedMb: 1 } });
  });

  test('LZW streams under the per-stream cap that add up past maxInflatedMb', async () => {
    limits.current.maxInflatedMb = 20;
    const pdf = streamPdf({ data: lzwRun(1), filter: '/LZWDecode', pages: 4 });
    const e = await extractPdfText(pdf, MAX_CHARS).catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'parse_too_heavy', detail: { maxInflatedMb: 20 } });
  });

  test('a 1.3 GB LZW bomb (~1 MB file) is refused at the real limits, fast, the event loop turning', async () => {
    const data = lzwRun(180);
    expect(lzwRunSize(180)).toBeGreaterThan(1.3e9);
    const pdf = streamPdf({ data, filter: '/LZWDecode' });
    expect(pdf.length).toBeLessThan(1.1 * MB);
    const { result, ms, worstGapMs } = await withPings(() => extractPdfText(pdf, MAX_CHARS));
    expect(result).toMatchObject({ code: 'parse_too_heavy', detail: { maxStreamInflatedMb: limits.actual.maxStreamInflatedMb } });
    expect(ms).toBeLessThan(5_000);
    expect(worstGapMs).toBeLessThan(500);
  }, 60_000);

  test('the same filter chains holding ordinary text are still extracted', async () => {
    const content = Buffer.from(
      ['BT', '/F1 9 Tf', '40 800 Td', '11 TL', ...densePageLines().map((l) => `(${l}) '`), 'ET'].join('\n'),
      'latin1'
    );
    const reference = await extractPdfText(flatePdf({ content, pages: 2 }), MAX_CHARS);
    expect(reference.text).toContain('Horizon Europe work programme text');
    for (const [filter, data] of [
      ['/LZWDecode', lzwLiteral(content)],
      ['[/ASCIIHexDecode /FlateDecode]', asciiHexEncode(deflateSync(content))],
      ['[/ASCII85Decode /FlateDecode]', ascii85Encode(deflateSync(content))],
      ['/RunLengthDecode', runLengthEncode(content)],
      ['/FlateDecode', zlibWithStoredEndstream(content)],
    ] as const) {
      const { pages, text } = await extractPdfText(streamPdf({ data, filter, pages: 2 }), MAX_CHARS);
      expect({ filter, pages, text }).toEqual({ filter, pages: 2, text: reference.text });
    }
  }, 30_000);
});

describe('what still works', () => {
  test('a real Flate-compressed text PDF is extracted, without page separators', async () => {
    const content = Buffer.from(
      ['BT', '/F1 9 Tf', '40 800 Td', '11 TL', ...densePageLines().map((l) => `(${l}) '`), 'ET'].join('\n'),
      'latin1'
    );
    const { pages, text } = await extractPdfText(flatePdf({ content, pages: 2 }), MAX_CHARS);
    expect(pages).toBe(2);
    expect(text).toContain('Horizon Europe work programme text');
    expect(text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
  });

  test('parallel uploads are extracted one at a time and all answer', async () => {
    const pdf = syntheticPdf(densePageLines(), 3);
    threads.maxAlive = threads.alive;
    const results = await Promise.all([1, 2, 3].map(() => extractPdfText(pdf, MAX_CHARS)));
    expect(results.map((r) => r.pages)).toEqual([3, 3, 3]);
    // Never two threads' worth of memory at once.
    expect(threads.maxAlive).toBe(1);
  });

  test('a thread that dies without answering fails the upload at once, not at the deadline', async () => {
    threads.killNext = true;
    const started = performance.now();
    const e = await extractPdfText(syntheticPdf(['Never answered']), MAX_CHARS).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(/exited/);
    expect(performance.now() - started).toBeLessThan(5_000);
  }, 40_000);

  test('too_many_chunks names the page it stopped at and the chunk limit', async () => {
    const e = await extractPdfText(syntheticPdf(densePageLines(), 3), 100).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(PdfLimitError);
    expect(e).toMatchObject({ code: 'too_many_chunks', detail: { pagesRead: 3, pages: 3, maxChunks: limits.actual.maxChunks } });
  });

  test('a file pdf.js cannot read is an ordinary error, not a limit', async () => {
    const e = await extractPdfText(Buffer.from('%PDF-1.4 not really'), MAX_CHARS).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(PdfLimitError);
  });
});

describe('İNCELEME-52 Ö-1 K5: digits count as readable text', () => {
  test('a page that is mostly figures (a budget table) is not a scan', () => {
    expect(hasMeaningfulText('2027 1.250.000 EUR 48 36 '.repeat(20), 1)).toBe(true);
    expect(hasMeaningfulText('1234567890 '.repeat(20), 1)).toBe(true);
  });
});
