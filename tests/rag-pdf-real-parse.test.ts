/**
 * TASK-MULQL8QB679LQ — İNCELEME-45 B-1 and B-2, against the real pdf-parse.
 *
 * `rag-pdf-ingest-partial.test.ts` mocks `getText`, and that is how B-2 got
 * through: pdf-parse appends `-- N of M --` to every page by default, so a PDF
 * with no text layer extracted to "\n\n-- 1 of 1 --\n\n", passed the
 * blank-chunk check and had its separator embedded. Here the PDFs are real
 * (tests/helpers/synthetic-pdf.ts) and only the database and the embedding
 * provider are doubles.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { densePageLines, syntheticPdf } from './helpers/synthetic-pdf';

const store = { documents: [] as { id: string }[], chunks: [] as { documentId: string; text: string }[] };
let sequence = 0;
const prismaStub = {
  document: {
    create: async (): Promise<{ id: string }> => {
      const row = { id: `doc-${sequence++}` };
      store.documents.push(row);
      return row;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      store.documents = store.documents.filter((d) => d.id !== where.id);
      return { id: where.id };
    },
  },
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
    if (strings.join('?').includes('DELETE FROM "Chunk"')) {
      store.chunks = store.chunks.filter((c) => c.documentId !== values[0]);
      return 1;
    }
    store.chunks.push({ documentId: values[0] as string, text: values[3] as string });
    return 1;
  },
};
vi.mock('../src/lib/db', () => ({
  prisma: prismaStub,
  withTenant: async (_t: string, fn: (tx: typeof prismaStub) => Promise<unknown>) => fn(prismaStub),
}));

const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/llm')>('../src/lib/llm');
  return { ...actual, embedText: embedTextMock };
});
vi.mock('../src/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async () => ({ status: 'recorded', id: 'a1' })),
}));

const { processPdfAndStore, extractPdfText, NoExtractableTextError, PdfLimitError } = await import('../src/lib/rag');
const { RAG_UPLOAD_LIMITS, hasMeaningfulText } = await import('../src/lib/rag-upload');

beforeEach(() => {
  store.documents = [];
  store.chunks = [];
  sequence = 0;
  embedTextMock.mockReset().mockResolvedValue(new Array(1536).fill(0.5));
});

async function refusal(pdf: Buffer): Promise<unknown> {
  return processPdfAndStore(pdf, null, 'work_programme', 'probe').then(
    () => null,
    (e: unknown) => e
  );
}

describe('B-2: a PDF without readable text is refused as no_text, embedding nothing', () => {
  test('a one-page PDF with no text layer (what a scan extracts to)', async () => {
    const e = await refusal(syntheticPdf([]));
    expect(e).toBeInstanceOf(NoExtractableTextError);
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(0);
  });

  test('a 300-page scan: once 300 paid "-- N of 300 --" chunks', async () => {
    const e = await refusal(syntheticPdf([], 300));
    expect(e).toBeInstanceOf(NoExtractableTextError);
    expect(embedTextMock).not.toHaveBeenCalled();
  });

  test('a 300-page scan whose only text is a stamped page label', async () => {
    const e = await refusal(syntheticPdf(['Sayfa 12 / scan'], 300));
    expect(e).toBeInstanceOf(NoExtractableTextError);
    expect(embedTextMock).not.toHaveBeenCalled();
  });

  test('a broken text layer that yields only symbols', async () => {
    const e = await refusal(syntheticPdf(Array.from({ length: 60 }, () => '.... ---- //// ____ ;;;; ~~~~ ++++ a1')));
    expect(e).toBeInstanceOf(NoExtractableTextError);
    expect(embedTextMock).not.toHaveBeenCalled();
  });

  test('the extracted text carries no page separator', async () => {
    const { text } = await extractPdfText(syntheticPdf(['Only line'], 3));
    expect(text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
    expect(text.match(/Only line/g)).toHaveLength(3);
  });

  test('a real text PDF is stored, and no chunk is a separator', async () => {
    const res = await processPdfAndStore(syntheticPdf(densePageLines()), null, 'work_programme', 'Dense page');
    expect(res.storedChunks).toBeGreaterThan(1);
    expect(embedTextMock).toHaveBeenCalledTimes(res.storedChunks);
    for (const c of store.chunks) expect(c.text).not.toMatch(/-- \d+ of \d+ --/);
  });

  test.each([
    ['200 letters on one page', 'a'.repeat(200), 1, true],
    ['199 letters on one page', 'a'.repeat(199), 1, false],
    ['2 pages need 200 letters, not 100 each', 'a'.repeat(200), 2, true],
    ['3 pages need 300', 'a'.repeat(299), 3, false],
    ['half letters, half symbols', 'a'.repeat(300) + '.'.repeat(300), 1, true],
    ['under half letters', 'a'.repeat(300) + '.'.repeat(301), 1, false],
    [
      'the old pdf-parse page separators of a 50-page scan',
      Array.from({ length: 50 }, (_, i) => `\n\n-- ${i + 1} of 50 --\n\n`).join(''),
      50,
      false,
    ],
    ['Turkish letters count', 'ğüşıöçĞÜŞİÖÇ'.repeat(20), 1, true],
  ])('hasMeaningfulText: %s', (_name, text, pages, expected) => {
    expect(hasMeaningfulText(text, pages)).toBe(expected);
  });
});

describe('B-1: page and chunk limits hold on real PDFs before any embedding call', () => {
  test(`maxPages (${RAG_UPLOAD_LIMITS.maxPages}) pages is accepted`, async () => {
    // ~250 letters a page: over the per-page text threshold, far under maxChunks.
    const lines = Array.from({ length: 4 }, () => 'Horizon Europe topic description, destination and expected outcomes.');
    const res = await processPdfAndStore(syntheticPdf(lines, RAG_UPLOAD_LIMITS.maxPages), null, 'work_programme', 'At max');
    expect(res.storedChunks).toBeGreaterThan(0);
  }, 30_000);

  test('one page over maxPages is refused without extracting text', async () => {
    const e = await refusal(syntheticPdf(densePageLines(), RAG_UPLOAD_LIMITS.maxPages + 1));
    expect(e).toBeInstanceOf(PdfLimitError);
    expect(e).toMatchObject({ code: 'too_many_pages', detail: { pages: RAG_UPLOAD_LIMITS.maxPages + 1 } });
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(0);
  });

  test('İNCELEME-45 shape: 30 000 pages in 4.8 MB is refused in well under a second', async () => {
    const pdf = syntheticPdf(densePageLines(), 30_000);
    expect(pdf.length).toBeLessThan(RAG_UPLOAD_LIMITS.maxFileBytes);
    const started = performance.now();
    const e = await refusal(pdf);
    const ms = performance.now() - started;
    expect(e).toMatchObject({ code: 'too_many_pages', detail: { pages: 30_000 } });
    expect(ms).toBeLessThan(3_000);
    expect(embedTextMock).not.toHaveBeenCalled();
  }, 30_000);

  test('1000 dense pages stop extracting as soon as maxChunks is out of reach', async () => {
    const e = await refusal(syntheticPdf(densePageLines(), 1000));
    expect(e).toBeInstanceOf(PdfLimitError);
    expect(e).toMatchObject({ code: 'too_many_chunks' });
    // ~6 000 characters a page → past 2 M characters well before page 1000.
    expect((e as InstanceType<typeof PdfLimitError>).detail.pagesRead).toBeLessThan(500);
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(0);
  }, 30_000);

  test('the event loop keeps turning while a large PDF is extracted', async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    try {
      await extractPdfText(syntheticPdf(densePageLines(), 300));
    } finally {
      clearInterval(timer);
    }
    // 300 pages = 15 slices, each followed by a turn of the loop. One
    // `getText()` over the whole document gave 0 (İNCELEME-45: 0 of 186 pings).
    expect(ticks).toBeGreaterThanOrEqual(10);
  }, 30_000);
});
