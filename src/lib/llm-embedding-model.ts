/**
 * What tells an embedding call's `AiUsageLog` row from a text generation's (NG-250 review B2).
 *
 * Both `embedText` and `generateCompletion` (src/lib/llm.ts) write one `AiUsageLog` row per
 * provider call, in the same columns. The NexaGrant `ai_writing_monthly` allowance counts text
 * generation only (K-584612 = A): a RAG ingest writes one embedding row per chunk and a RAG
 * search one per query, and none of them is a "writing". The table has no kind column and the
 * write path is not to change (CLAUDE.md rule 5), so the model name is the marker: every
 * embedding model the adapter calls is an OpenAI `text-embedding-*` model, and `embedText`
 * refuses any other name before the provider is reached, so the marker cannot drift.
 *
 * Pure, no server import: src/lib/billing/nexagrant/usage.ts reads it without importing the
 * adapter (which imports usage.ts).
 */
export const EMBEDDING_MODEL_PREFIX = 'text-embedding-';

/** Default embedding model. 1536 dimensions is what `Chunk.embedding` is declared as. */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';

export function isEmbeddingModel(model: string): boolean {
  return model.startsWith(EMBEDDING_MODEL_PREFIX);
}
