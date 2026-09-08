import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * TASK-MTSWVADF7RQ1B — the RAG path used to call OpenAI's embeddings endpoint
 * directly from src/lib/rag.ts and src/lib/ai/rag.ts. The full text of every
 * uploaded document left in 1000-character chunks and *nothing* was written
 * back: no tenant, no promptHash, no AiUsageLog row at all. That breaks
 * CLAUDE.md rule 5 and GDPR art. 30's record of processing activities.
 *
 * These tests hold the choke point shut. Delete the `aiUsageLog.create` block
 * in `embedText` and every case below except the last two goes red.
 */

const mockPrisma = vi.hoisted(() => ({
  aiUsageLog: { create: vi.fn() },
  creditLedger: { aggregate: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

const mockEnv = vi.hoisted(() => ({ OPENAI_API_KEY: 'sk-test-key' as string | undefined }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import { embedText, AiUsageLogWriteError, PLATFORM_SCOPE_TENANT_ID } from './llm';

/** The document text stands in for what a tenant actually uploads. */
const SECRET_TEXT =
  'Hasta raporu: Ayşe Yılmaz, TCKN 12345678901, Horizon Europe başvurusu ek belgesi.';

function stubEmbeddingsEndpoint(promptTokens = 42) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [{ embedding: new Array(1536).fill(0.01) }],
      usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const attribution = {
  tenantId: 'tenant_1',
  userId: 'user_1',
  module: 'K6',
  purpose: 'rag_ingest_embedding',
};

describe('embedText — every provider call leaves an AiUsageLog row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.OPENAI_API_KEY = 'sk-test-key';
    mockPrisma.aiUsageLog.create.mockResolvedValue({ id: 'log_1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes exactly one usage row for one embedding call', async () => {
    stubEmbeddingsEndpoint();

    await embedText(SECRET_TEXT, attribution);

    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledTimes(1);
  });

  it('records tenant, user, module, purpose, provider, model and token count', async () => {
    stubEmbeddingsEndpoint(137);

    await embedText(SECRET_TEXT, attribution);

    const { data } = mockPrisma.aiUsageLog.create.mock.calls[0][0];
    expect(data).toMatchObject({
      tenantId: 'tenant_1',
      userId: 'user_1',
      module: 'K6',
      purpose: 'rag_ingest_embedding',
      provider: 'openai',
      model: 'text-embedding-3-large',
      inputTokens: 137,
      outputTokens: 0,
    });
  });

  it('records the prompt hash and never the text that was embedded', async () => {
    stubEmbeddingsEndpoint();

    await embedText(SECRET_TEXT, attribution);

    const { data } = mockPrisma.aiUsageLog.create.mock.calls[0][0];
    const expectedHash = crypto
      .createHash('sha256')
      .update(SECRET_TEXT)
      .digest('hex')
      .slice(0, 16);

    expect(data.promptHash).toBe(expectedHash);

    // Nothing recognisable from the document may appear anywhere in the row —
    // not the whole text, not a name, not an identifier.
    const serialisedRow = JSON.stringify(data);
    expect(serialisedRow).not.toContain(SECRET_TEXT);
    expect(serialisedRow).not.toContain('Ayşe Yılmaz');
    expect(serialisedRow).not.toContain('12345678901');
  });

  it('books a call with no tenant against the declared platform scope', async () => {
    stubEmbeddingsEndpoint();

    await embedText('CORDIS shared corpus row', {
      tenantId: null,
      module: 'K6',
      purpose: 'rag_ingest_embedding',
    });

    const { data } = mockPrisma.aiUsageLog.create.mock.calls[0][0];
    expect(data.tenantId).toBe(PLATFORM_SCOPE_TENANT_ID);
    expect(data.userId).toBeUndefined();
  });

  it('charges 0 credits, because no embedding coefficient is priced yet', async () => {
    // docs/BILLING.md §"Kredi maliyeti" prices M1/M2/M3/M6/M9/M10/M11 actions
    // and says nothing about embeddings. CLAUDE.md rule 7 forbids inventing a
    // figure; the real token count is recorded so one can be applied later.
    stubEmbeddingsEndpoint();

    await embedText(SECRET_TEXT, attribution);

    expect(mockPrisma.aiUsageLog.create.mock.calls[0][0].data.credits).toBe(0);
  });

  it('requests 1536 dimensions, matching the Chunk.embedding column', async () => {
    const fetchMock = stubEmbeddingsEndpoint();

    await embedText(SECRET_TEXT, attribution);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.dimensions).toBe(1536);
  });

  it('surfaces a failed log write instead of returning a silently unlogged vector', async () => {
    // The text has already reached OpenAI by this point. Swallowing the error
    // would recreate exactly the hole this card closes.
    stubEmbeddingsEndpoint();
    mockPrisma.aiUsageLog.create.mockRejectedValue(new Error('db down'));

    await expect(embedText(SECRET_TEXT, attribution)).rejects.toBeInstanceOf(
      AiUsageLogWriteError
    );
  });

  it('sends nothing and logs nothing when no API key is configured', async () => {
    const fetchMock = stubEmbeddingsEndpoint();
    mockEnv.OPENAI_API_KEY = undefined;

    await expect(embedText(SECRET_TEXT, attribution)).rejects.toThrow('OPENAI_API_KEY not set');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
  });

  it('logs nothing when the provider rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' })
    );

    await expect(embedText(SECRET_TEXT, attribution)).rejects.toThrow('OpenAI embeddings error 429');

    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
  });
});
