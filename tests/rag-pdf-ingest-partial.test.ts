/**
 * TASK-MTSYCMWFL22CA — the other shared-corpus ingest: POST
 * /api/admin/documents/upload → `processPdfAndStore`.
 *
 * It created the `Document` row first and embedded afterwards, with no rollback
 * of any kind. Measured against the live database on 2026-09-08, a PDF whose
 * embedding call failed left:
 *
 *   STORED Document rows : 1
 *   STORED Chunk rows    : 0   <- retrievable content
 *
 * A titled document in the shared corpus that nothing can retrieve. And the
 * route answered `{ success: true, docId }` without ever knowing how much of
 * the document had reached the corpus.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const pdfText = { value: 'x'.repeat(2400) };
// One page holding `pdfText.value`, in the two calls `extractPdfText` makes:
// `getInfo` for the page count, then `getText` over a page range.
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    async getInfo(): Promise<{ total: number }> {
      return { total: 1 };
    }
    async getText(): Promise<{ total: number; text: string; pages: { num: number; text: string }[] }> {
      return { total: 1, text: pdfText.value, pages: [{ num: 1, text: pdfText.value }] };
    }
    async destroy(): Promise<void> {}
  },
}));

// The limits are the real ones unless a test lowers one.
const limits = vi.hoisted(() => ({ current: {} as Record<string, number> }));
vi.mock('../src/lib/rag-upload', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/rag-upload')>('../src/lib/rag-upload');
  limits.current = { ...actual.RAG_UPLOAD_LIMITS };
  return { ...actual, RAG_UPLOAD_LIMITS: limits.current };
});

interface DocRow { id: string; title: string }

const store = {
  documents: [] as DocRow[],
  chunks: [] as { documentId: string; ordinal: number }[],
  deleteThrows: false,
};

const documentDelete = vi.fn(async ({ where }: { where: { id: string } }) => {
  if (store.deleteThrows) throw new Error('delete refused');
  store.documents = store.documents.filter((d) => d.id !== where.id);
  return { id: where.id };
});

let sequence = 0;
const prismaStub = {
  document: {
    create: async ({ data }: { data: { title: string } }): Promise<DocRow> => {
      const row = { id: `doc-${sequence++}`, title: data.title };
      store.documents.push(row);
      return row;
    },
    delete: documentDelete,
  },
  // Tagged-template raw call. `$executeRaw` is used for both the chunk INSERT
  // and the cleanup DELETE, told apart by the SQL text.
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
    const sql = strings.join('?');
    if (sql.includes('DELETE FROM "Chunk"')) {
      const documentId = values[0] as string;
      store.chunks = store.chunks.filter((c) => c.documentId !== documentId);
      return 1;
    }
    store.chunks.push({ documentId: values[0] as string, ordinal: values[2] as number });
    return 1;
  },
};

vi.mock('../src/lib/db', () => ({
  prisma: prismaStub,
  // TASK-MTU6KE36HAFJR — `processPdfAndStore` moved into src/lib/rag.ts and
  // its writes now go through `withTenant`, one short transaction each, so
  // `app.tenant_id` is set for them. The double hands the same stub straight
  // back: what these tests pin is the corpus the ingest leaves behind, not
  // the tenant plumbing.
  withTenant: async (_tenantId: string, fn: (tx: typeof prismaStub) => Promise<unknown>) => fn(prismaStub),
}));

const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/llm')>('../src/lib/llm');
  return { ...actual, embedText: embedTextMock };
});

type AlertInput = { level: string; source: string; message: string; meta: Record<string, unknown> };
const recordAlertMock = vi.hoisted(() =>
  vi.fn(async (_input: { level: string; source: string; message: string; meta: Record<string, unknown> }) => ({
    status: 'recorded' as const,
    id: 'a1',
  }))
);
vi.mock('../src/lib/observability/system-alert', () => ({ recordAlert: recordAlertMock }));

const { processPdfAndStore, PdfLimitError } = await import('../src/lib/rag');
const actualUpload = await vi.importActual<typeof import('../src/lib/rag-upload')>('../src/lib/rag-upload');

beforeEach(() => {
  store.documents = [];
  store.chunks = [];
  store.deleteThrows = false;
  sequence = 0;
  pdfText.value = 'x'.repeat(2400);
  Object.assign(limits.current, actualUpload.RAG_UPLOAD_LIMITS);
  documentDelete.mockClear();
  recordAlertMock.mockClear();
  embedTextMock.mockReset().mockResolvedValue(new Array(1536).fill(0.5));
});

describe('processPdfAndStore leaves the corpus consistent', () => {
  test('reports the chunk count Postgres confirmed, alongside the document', async () => {
    const res = await processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'A paper');

    // 2400 chars at size 1000 / overlap 200 → 3 chunks.
    expect(res.storedChunks).toBe(3);
    expect(store.chunks).toHaveLength(3);
    expect(store.documents).toHaveLength(1);
    expect(res.doc.id).toBe(store.documents[0]!.id);
  });

  test('a PDF with no extractable text stores nothing and is not a success', async () => {
    // The scanned/image-only case. It used to leave a document with no chunk
    // and answer 200.
    pdfText.value = '   \n  \n ';

    await expect(
      processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'A scan')
    ).rejects.toThrow(/No extractable text/);

    expect(store.documents).toHaveLength(0);
    expect(embedTextMock).not.toHaveBeenCalled();
  });

  test('an embedding failure part way through removes the half-written document', async () => {
    embedTextMock
      .mockResolvedValueOnce(new Array(1536).fill(0.5))
      .mockRejectedValueOnce(new Error('OpenAI embeddings error 500'));

    await expect(
      processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'A paper')
    ).rejects.toThrow(/500/);

    expect(store.documents).toHaveLength(0);
    expect(store.chunks).toHaveLength(0);
    expect(documentDelete).toHaveBeenCalledTimes(1);
  });

  test('an orphan that survives cleanup is named in a SystemAlert, not left quiet', async () => {
    store.deleteThrows = true;
    embedTextMock.mockRejectedValue(new Error('OPENAI_API_KEY not set'));

    await expect(
      processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'A paper')
    ).rejects.toThrow(/OPENAI_API_KEY/);

    expect(recordAlertMock).toHaveBeenCalledTimes(1);
    const alert: AlertInput = recordAlertMock.mock.calls[0]![0];
    expect(alert.level).toBe('error');
    expect(alert.source).toBe('rag-pdf-ingest');
    // SystemAlert has no RLS: the orphan is referenced by id, never by content.
    expect(alert.meta.documentId).toBe('doc-0');
    expect(JSON.stringify(alert.meta)).not.toContain('A paper');
  });
});

describe('processPdfAndStore refuses a PDF over the limits before any embedding call (İNCELEME-45 B-1)', () => {
  test('exactly maxChunks chunks is stored', async () => {
    // chunkText at 1000 / 200 yields ceil(length / 800) chunks.
    pdfText.value = 'x'.repeat(actualUpload.RAG_UPLOAD_LIMITS.maxChunks * 800);

    const res = await processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'At the limit');

    expect(res.storedChunks).toBe(actualUpload.RAG_UPLOAD_LIMITS.maxChunks);
  });

  test('one chunk over maxChunks stores nothing and embeds nothing', async () => {
    pdfText.value = 'x'.repeat(actualUpload.RAG_UPLOAD_LIMITS.maxChunks * 800 + 1);

    const refused = processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'One over');
    await expect(refused).rejects.toBeInstanceOf(PdfLimitError);
    await expect(refused).rejects.toMatchObject({
      code: 'too_many_chunks',
      detail: { chunks: actualUpload.RAG_UPLOAD_LIMITS.maxChunks + 1 },
    });
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(0);
  });

  test('an estimate over maxEmbeddingUsd stores nothing and embeds nothing', async () => {
    // 2400 characters → chunks of 1000 + 1000 + 800 = 2800 characters →
    // 934 estimated tokens → 0.000121 USD.
    limits.current.maxEmbeddingUsd = 0.0001;

    await expect(
      processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'Too dear')
    ).rejects.toMatchObject({ code: 'over_budget' });
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(0);

    limits.current.maxEmbeddingUsd = 0.00013;
    const res = await processPdfAndStore(Buffer.from('%PDF'), null, 'SHARED_PDF', 'Just affordable');
    expect(res.storedChunks).toBe(3);
  });

  test('at the default limits a full maxChunks upload is estimated under the budget', () => {
    const { maxChunks, maxEmbeddingUsd } = actualUpload.RAG_UPLOAD_LIMITS;
    expect(actualUpload.estimateEmbeddingUsd(maxChunks * 1000)).toBeLessThanOrEqual(maxEmbeddingUsd);
  });
});
