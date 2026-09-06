import { describe, test, expect, vi } from 'vitest';
import { syncCordisBigData, aggregateCordisMetrics } from '../src/lib/cordis-sync';
import { retrieveChunks, buildRagPrompt, splitText } from '../src/lib/rag';

vi.mock('../src/lib/db', () => ({
  prisma: {
    organization: {
      upsert: vi.fn().mockResolvedValue({ id: 'org-1' }),
    },
    document: {
      create: vi.fn().mockResolvedValue({ id: 'doc-rag-1' }),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRawUnsafe: vi.fn().mockResolvedValue([
      { text: 'Mock CORDIS project chunk text', documentId: 'doc-rag-1', score: 0.92 },
    ]),
  },
}));

describe('Faz E (v2.0) CORDIS Big Data Sync & Advanced RAG Pipeline', () => {
  test('syncCordisBigData ingests CORDIS project records and creates RAG embeddings', async () => {
    const res = await syncCordisBigData();
    expect(res.success).toBe(true);
    expect(res.syncedProjectsCount).toBeGreaterThan(0);
    expect(res.totalEcContributionEUR).toBeGreaterThan(0);
  });

  test('aggregateCordisMetrics computes OLAP project metrics', async () => {
    const metrics = await aggregateCordisMetrics();
    expect(metrics.totalProjectsCount).toBeGreaterThan(100000);
    expect(metrics.topCountriesBreakdown.length).toBeGreaterThan(0);
  });

  test('splitText divides long document text into overlapping chunks', () => {
    const text = 'A'.repeat(4000);
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].length).toBe(1500);
  });

  test('retrieveChunks returns top-K vector search matches with similarity scores', async () => {
    const chunks = await retrieveChunks('Zero-emission battery', 3);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].score).toBeGreaterThan(0.5);
  });

  test('buildRagPrompt formats retrieved chunks into LLM prompt', async () => {
    const prompt = await buildRagPrompt('Zero-emission battery', undefined, 2);
    expect(prompt).toContain('RETRIEVED CONTEXT');
    expect(prompt).toContain('Question: Zero-emission battery');
  });
});
