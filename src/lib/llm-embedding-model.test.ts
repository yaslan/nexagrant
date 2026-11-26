/**
 * NG-250 review B2 — the model name is the only thing that tells an embedding's AiUsageLog row
 * from a generation's, so the NexaGrant AI writing quota relies on it. Pin both sides.
 */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EMBEDDING_MODEL, isEmbeddingModel } from './llm-embedding-model';
import { DEFAULT_MODELS, embedText } from './llm';
import { EMBEDDING_MODEL } from './scoring/embeddings';

describe('embedding model marker (NG-250 B2)', () => {
  it('every embedding model the code calls carries the marker', () => {
    expect(isEmbeddingModel(DEFAULT_EMBEDDING_MODEL)).toBe(true);
    expect(isEmbeddingModel(EMBEDDING_MODEL)).toBe(true);
    expect(isEmbeddingModel('text-embedding-3-small')).toBe(true);
  });

  it('no generation model carries it, so a writing is never dropped from the count', () => {
    for (const model of Object.values(DEFAULT_MODELS)) expect(isEmbeddingModel(model), model).toBe(false);
    expect(isEmbeddingModel('claude-opus-5')).toBe(false);
    expect(isEmbeddingModel('fake-e2e')).toBe(false);
  });

  it('embedText refuses a model name without the marker before the provider is called', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(
        embedText('x', { tenantId: null, module: 'K1', purpose: 'test' }, { model: 'gpt-4o' })
      ).rejects.toThrow(/not an embedding model name/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
