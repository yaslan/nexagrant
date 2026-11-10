import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTSWVADF7RQ1B — every provider call must go through the logging choke
 * point, and no failure may be answered with something that looks like a
 * result. A failed AiUsageLog write happens *after* the chunk text has already
 * reached OpenAI; answering it with a vector would put the
 * unrecorded-processing hole straight back.
 *
 * TASK-MTUH5L8MJ6S8E — the two fabrications this module used to contain are
 * locked out here, behaviourally rather than by grep:
 *
 *   - `getEmbedding` invented a `mockEmbedding` — a vector of the first 1536
 *     character codes of the text — whenever no `OPENAI_API_KEY` was set, and
 *     `ingestDocument` wrote it into the real `Chunk` table.
 *   - `retrieveChunks` answered a failed or empty search with three hard-coded
 *     "CORDIS projects" (ZERO-EMISSION-EV / €4,500,000, HYDROGEN-CATALYST /
 *     €3,200,000, RECYCLED-COMPOSITE / €5,800,000) at fixed scores of
 *     0.94 / 0.88 / 0.81. `formatRagContext` labels whatever it is handed
 *     `[Source N | Score: 94.0%]`, so those went into the LLM prompt behind
 *     `generateSectionDraft` as retrieved evidence, and out again as a concept
 *     note grounded in projects that do not exist (CLAUDE.md rule 7).
 */

/** The exact rows the demo fallback used to serve. None may ever come back. */
const FABRICATED = [
  'ZERO-EMISSION-EV',
  'HYDROGEN-CATALYST',
  'RECYCLED-COMPOSITE',
  '€4,500,000',
  '€3,200,000',
  '€5,800,000',
  'doc-cordis-1',
  'doc-cordis-2',
  'doc-cordis-3',
];

const mockPrisma = vi.hoisted(() => ({
  document: { create: vi.fn() },
  $executeRawUnsafe: vi.fn(),
  $queryRawUnsafe: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  withTenant: async (_tenantId: string, fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
}));

const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('./llm')>('./llm');
  return { ...actual, embedText: embedTextMock };
});

import { getEmbedding, ingestDocument, retrieveChunks, buildRagContext } from './rag';
import { AiUsageLogWriteError } from './llm';

const attribution = { tenantId: 'tenant_1', module: 'K6', purpose: 'rag_search_embedding' };

/**
 * One recorded argument of a mock call. Reading `mock.calls[0][1]` inline is an
 * unchecked index read; what makes it safe is the "the call happened" assertion
 * above it, so the missing-call case is checked here and reported by name. The
 * argument itself is returned as-is — when the production code passes the wrong
 * value (`undefined` included) the caller's `toEqual` must show that as a diff,
 * not be pre-empted by a throw from this helper.
 */
type RecordedCalls = { mock: { calls: unknown[][] } };
function callArg<T>(fn: RecordedCalls, callIndex: number, argIndex: number): T {
  const call = fn.mock.calls[callIndex];
  if (!call) {
    throw new Error(`expected at least ${callIndex + 1} call(s), recorded ${fn.mock.calls.length}`);
  }
  return call[argIndex] as T;
}

describe('getEmbedding — the fallback may not hide an unlogged call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('goes through the logging choke point with the caller attribution', async () => {
    embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));

    await getEmbedding('some query', attribution);

    expect(embedTextMock).toHaveBeenCalledTimes(1);
    expect(callArg<unknown>(embedTextMock, 0, 1)).toEqual(attribution);
  });

  it('refuses to invent a vector when no key is configured', async () => {
    // TASK-MTUH5L8MJ6S8E — this used to resolve with a 1536-long vector built
    // from the character codes of the text, which `ingestDocument` then wrote
    // into the real Chunk table as an embedding.
    embedTextMock.mockRejectedValue(new Error('OPENAI_API_KEY not set'));

    await expect(getEmbedding('some query', attribution)).rejects.toThrow(/OPENAI_API_KEY not set/);
  });

  it('refuses to invent a vector when the provider fails mid-call', async () => {
    embedTextMock.mockRejectedValue(new Error('OpenAI embeddings error 429: rate limited'));

    await expect(getEmbedding('some query', attribution)).rejects.toThrow(/429/);
  });

  it('asks for the number of dimensions the Chunk column is declared as', async () => {
    embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));

    await getEmbedding('some query', attribution);

    expect(callArg<unknown>(embedTextMock, 0, 2)).toEqual({ dimensions: 1536 });
  });

  it('does not write a chunk when the embedding call fails', async () => {
    // The half a careless fix breaks: throwing is only worth anything if the
    // INSERT never runs.
    mockPrisma.document.create.mockResolvedValue({ id: 'doc_1' });
    embedTextMock.mockRejectedValue(new Error('OPENAI_API_KEY not set'));

    await expect(ingestDocument('title', 'body text', 'tenant_upload', 'tenant_1')).rejects.toThrow();
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('rethrows a failed usage-log write rather than falling back', async () => {
    embedTextMock.mockRejectedValue(new AiUsageLogWriteError('log write failed'));

    await expect(getEmbedding('some query', attribution)).rejects.toBeInstanceOf(
      AiUsageLogWriteError
    );
  });

  it('ingestDocument does not swallow a failed usage-log write', async () => {
    mockPrisma.document.create.mockResolvedValue({ id: 'doc_1' });
    embedTextMock.mockRejectedValue(new AiUsageLogWriteError('log write failed'));

    await expect(ingestDocument('title', 'body text', 'tenant_upload', 'tenant_1')).rejects.toBeInstanceOf(
      AiUsageLogWriteError
    );
  });

  it('retrieveChunks does not fall back to demo chunks on a failed usage-log write', async () => {
    embedTextMock.mockRejectedValue(new AiUsageLogWriteError('log write failed'));

    await expect(retrieveChunks('query', 3, 'tenant_1')).rejects.toBeInstanceOf(
      AiUsageLogWriteError
    );
  });

  it('attributes an ingest to the tenant and the ingest purpose', async () => {
    mockPrisma.document.create.mockResolvedValue({ id: 'doc_1' });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));

    await ingestDocument('title', 'body text', 'tenant_upload', 'tenant_1', { userId: 'user_1' });

    expect(callArg<unknown>(embedTextMock, 0, 1)).toEqual({
      tenantId: 'tenant_1',
      userId: 'user_1',
      module: 'K6',
      purpose: 'rag_ingest_embedding',
    });
  });

  it('passes a tenant-less ingest through as platform scope, not as a fake tenant', async () => {
    mockPrisma.document.create.mockResolvedValue({ id: 'doc_1' });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));

    await ingestDocument('CORDIS row', 'body text', 'CORDIS_PROJECT');

    expect(callArg<{ tenantId: string | null }>(embedTextMock, 0, 1).tenantId).toBeNull();
  });
});

/**
 * TASK-MTUH5L8MJ6S8E — the retrieval half. These run the real `retrieveChunks`
 * and `buildRagContext` against a stubbed `Chunk` query, so they measure what
 * the function returns rather than what the file contains.
 */
describe('retrieveChunks — a failed or empty search may not become evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));
  });

  it('propagates a failed Chunk query instead of answering with demo projects', async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValue(
      new Error('Raw query failed. Code: `42P01`. Message: `relation "Chunk" does not exist`')
    );

    await expect(retrieveChunks('battery', 3, 'tenant_1')).rejects.toThrow(/42P01/);
  });

  it('reports an empty corpus as empty, not as three CORDIS projects', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await expect(retrieveChunks('battery', 3, 'tenant_1')).resolves.toEqual([]);
  });

  it('returns the rows the database matched, with their measured scores', async () => {
    // The half a careless fix breaks: refusing to invent must not stop real
    // matches from coming back.
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { text: 'a real ingested chunk', documentId: 'doc_real', score: 0.71 },
    ]);

    await expect(retrieveChunks('battery', 3, 'tenant_1')).resolves.toEqual([
      { text: 'a real ingested chunk', documentId: 'doc_real', score: 0.71 },
    ]);
  });

  it('never emits any of the invented rows, whatever the database does', async () => {
    for (const outcome of [
      () => mockPrisma.$queryRawUnsafe.mockResolvedValue([]),
      () => mockPrisma.$queryRawUnsafe.mockResolvedValue(null),
      () => mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('connection refused')),
    ]) {
      vi.clearAllMocks();
      embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));
      outcome();

      const chunks = await retrieveChunks('battery', 5, 'tenant_1').catch(() => []);
      const serialised = JSON.stringify(chunks);
      for (const invented of FABRICATED) {
        expect(serialised).not.toContain(invented);
      }
    }
  });
});

describe('buildRagContext — no match means no context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));
  });

  it('is empty when the corpus matched nothing', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    // No fabricated context, and no `[Source N | Score: …%]` header claiming
    // evidence that does not exist.
    expect(await buildRagContext('How do we manage battery heat?', 'tenant_1', 5)).toBe('');
  });

  it('does not reach the model at all when retrieval fails', async () => {
    // The concept-note path (`generateSectionDraft`) awaits this before it
    // builds its messages, so a throw here is what stops a draft from being
    // written on top of nothing.
    mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('connection refused'));

    await expect(buildRagContext('How do we manage battery heat?', 'tenant_1', 5)).rejects.toThrow(
      /connection refused/
    );
  });

  it('labels real retrieved chunks with the score the database measured', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { text: 'a real ingested chunk', documentId: 'doc_real', score: 0.71 },
    ]);

    const context = await buildRagContext('battery', 'tenant_1', 5);

    expect(context).toContain('[Source 1 | Score: 71.0%]');
    expect(context).toContain('a real ingested chunk');
  });
});
