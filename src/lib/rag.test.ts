import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTSWVADF7RQ1B — `getEmbedding` keeps its mock-embedding fallback for
 * key-less dev/demo environments, but the fallback must only cover the case
 * where *nothing was sent*. A failed AiUsageLog write happens after the chunk
 * text has already reached OpenAI; falling back there would put the
 * unrecorded-processing hole straight back.
 */

const mockPrisma = vi.hoisted(() => ({
  document: { create: vi.fn() },
  $executeRawUnsafe: vi.fn(),
  $queryRawUnsafe: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('./llm')>('./llm');
  return { ...actual, embedText: embedTextMock };
});

import { getEmbedding, ingestDocument, retrieveChunks } from './rag';
import { AiUsageLogWriteError } from './llm';

const attribution = { tenantId: 'tenant_1', module: 'K6', purpose: 'rag_search_embedding' };

describe('getEmbedding — the fallback may not hide an unlogged call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('goes through the logging choke point with the caller attribution', async () => {
    embedTextMock.mockResolvedValue(new Array(1536).fill(0.5));

    await getEmbedding('some query', attribution);

    expect(embedTextMock).toHaveBeenCalledTimes(1);
    expect(embedTextMock.mock.calls[0][1]).toEqual(attribution);
  });

  it('falls back to the mock vector when the provider was never reached', async () => {
    embedTextMock.mockRejectedValue(new Error('OPENAI_API_KEY not set'));

    const vec = await getEmbedding('some query', attribution);

    expect(vec).toHaveLength(1536);
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

    expect(embedTextMock.mock.calls[0][1]).toEqual({
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

    expect(embedTextMock.mock.calls[0][1].tenantId).toBeNull();
  });
});
