/**
 * A deterministic vector for tests that need `embedText` to answer without an
 * `OPENAI_API_KEY`.
 *
 * TASK-MTUH5L8MJ6S8E — this is where the old `mockEmbedding` from
 * `src/lib/rag.ts` went. It is the same arithmetic, moved out of production
 * code and renamed so that nothing can use it by accident: `getEmbedding` used
 * to fall back to it whenever no key was configured, and `ingestDocument` then
 * wrote the result into the real `Chunk` table, where a similarity search
 * ranked it as though it were an embedding.
 *
 * It encodes the first 1536 character codes of the text and nothing about its
 * meaning, so a test may use it to prove that *plumbing* works — attribution,
 * row counts, tenant scope — and may never use it to assert anything about
 * relevance or ranking quality.
 */

/** Must match the `vector(1536)` column `Chunk.embedding` is declared as. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Build the fake vector. Normalised, so cosine distance against it is defined,
 * but meaningless — see the file comment.
 */
export function fakeEmbedding(text: string): number[] {
  const vec = new Array(EMBEDDING_DIMENSIONS).fill(0);
  for (let i = 0; i < text.length && i < EMBEDDING_DIMENSIONS; i++) {
    vec[i] = (text.charCodeAt(i) % 100) / 100;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
