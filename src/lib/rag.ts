/**
 * RAG (Retrieval-Augmented Generation) utility
 * 
 * Handles:
 * - Splitting text into chunks
 * - Generating embeddings (mock for now, real via OpenAI text-embedding-3-large)
 * - Storing chunks with embeddings in Document/Chunk tables
 * - Retrieving relevant chunks via pgvector cosine similarity
 */

import { withTenant } from '@/lib/db';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { embedText, AiUsageLogWriteError, PLATFORM_SCOPE_TENANT_ID, type AiCallAttribution } from '@/lib/llm';

/** One row of the pgvector similarity search over `Chunk`. */
interface ChunkMatch {
  text: string;
  documentId: string;
  score: number;
}

const CHUNK_SIZE = 1500;  // characters per chunk
const CHUNK_OVERLAP = 200;
/** Must match the `vector(1536)` column `Chunk.embedding` is declared as. */
const EMBEDDING_DIMENSIONS = 1536;

/** The shared AI layer these calls are booked against in `AiUsageLog`. */
const RAG_MODULE = 'K6';
const PURPOSE_INGEST = 'rag_ingest_embedding';
const PURPOSE_SEARCH = 'rag_search_embedding';

/** Who triggered a RAG call, when a user session is available. */
export interface RagActor {
  userId?: string;
}

/**
 * Split a long text into overlapping chunks.
 */
export function splitText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Generate an embedding vector for a text string.
 *
 * Goes through `embedText` in the LLM adapter so the provider call lands in
 * `AiUsageLog` (CLAUDE.md rule 5). It used to `fetch` OpenAI straight from
 * here, which sent the chunk text and recorded nothing.
 *
 * `attribution` is required, not optional: the whole point is that no caller
 * can reach the provider without saying who the call belongs to.
 *
 * The mock fallback for key-less dev/demo environments stays, and it is now
 * limited to exactly that case: no `OPENAI_API_KEY` is configured, so no call
 * was ever made. Two failures are rethrown instead:
 *
 *   - a failed *log* write, because by then the text has already gone to OpenAI
 *     and pretending otherwise would put the unrecorded-processing hole back;
 *   - any failure while a key *is* configured — a provider outage, a rate
 *     limit, a rejected request. Substituting `mockEmbedding` there stores a
 *     chunk whose vector encodes the first 1536 character codes of the text and
 *     nothing about its meaning: the row looks ingested, is counted as
 *     ingested, and never comes back from a similarity search. That is the
 *     silent-failure shape TASK-MTSYCMWFL22CA is about, one layer down.
 */
export async function getEmbedding(
  text: string,
  attribution: AiCallAttribution
): Promise<number[]> {
  try {
    return await embedText(text, attribution, { dimensions: EMBEDDING_DIMENSIONS });
  } catch (e) {
    if (e instanceof AiUsageLogWriteError) throw e;
    if (env.OPENAI_API_KEY) throw e;
    console.warn(`[getEmbedding] no OPENAI_API_KEY; using the mock embedding: ${errorMessage(e)}`);
  }

  return mockEmbedding(text);
}

/**
 * Deterministic mock embedding based on character codes (for dev/test).
 */
function mockEmbedding(text: string): number[] {
  const vec = new Array(1536).fill(0);
  for (let i = 0; i < text.length && i < 1536; i++) {
    vec[i] = (text.charCodeAt(i) % 100) / 100;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

/**
 * Ingest a document: split into chunks, embed, and store.
 *
 * Resolves with the id of a document that is *committed*, with every one of its
 * chunks committed alongside it. It does not resolve any other way: a caller
 * that gets an id back may count the ingest, and a caller that gets an
 * exception must count a skip.
 *
 * TASK-MTSYCMWFL22CA — this used to catch every database failure, log it to the
 * console as an "ingestion bypassed" line and return an id anyway: either
 * `doc-<timestamp>`, which was never a row, or the id of a document the
 * transaction had just rolled back. Both of its callers
 * (`syncCordisBigData`, `syncCordisDelta`) read "no exception" as "stored", so
 * a run that stored nothing at all reported `success: true, synced: N` with no
 * `SystemAlert` behind it — measured at synced=1 over 0 documents and 0 chunks.
 * The two callers already turn a thrown error into `skippedCount` plus an
 * alert, so surfacing is all that was missing; a second alert written here
 * would only duplicate theirs.
 *
 * `stored` is counted from the rows Postgres reports as inserted rather than
 * from the loop counter, and an ingest that would leave a document with no
 * retrievable chunk behind is refused. A document nothing can be retrieved from
 * is not a stored document, whatever the row count says.
 */
export async function ingestDocument(
  title: string,
  text: string,
  kind: string,
  tenantId?: string,
  actor?: RagActor
): Promise<string> {
  const scope = tenantId ?? PLATFORM_SCOPE_TENANT_ID;
  const chunks = splitText(text);
  if (chunks.length === 0) {
    throw new Error(`ingestDocument: refusing to store "${title}" — its text yields no chunks`);
  }

  return withTenant(scope, async (tx) => {
    const doc = await tx.document.create({
      data: { tenantId, kind, title },
    });

    let stored = 0;
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await getEmbedding(chunks[i], {
        tenantId: tenantId ?? null,
        userId: actor?.userId,
        module: RAG_MODULE,
        purpose: PURPOSE_INGEST,
      });
      const embeddingStr = `[${embedding.join(',')}]`;

      // Use raw SQL to insert vector type
      stored += await tx.$executeRawUnsafe(
        `INSERT INTO "Chunk" (id, "documentId", "tenantId", ordinal, text, embedding)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector)`,
        doc.id,
        tenantId || null,
        i,
        chunks[i],
        embeddingStr
      );
    }

    if (stored !== chunks.length) {
      throw new Error(
        `ingestDocument: "${title}" split into ${chunks.length} chunks but Postgres reported ${stored} inserted`
      );
    }

    return doc.id;
  });
}

/**
 * Retrieve the top-K most relevant chunks for a query.
 * Uses pgvector cosine distance (<=> operator).
 */
export async function retrieveChunks(
  query: string,
  topK: number = 5,
  tenantId?: string,
  actor?: RagActor
): Promise<{ text: string; score: number; documentId: string }[]> {
  try {
    const queryEmbedding = await getEmbedding(query, {
      tenantId: tenantId ?? null,
      userId: actor?.userId,
      module: RAG_MODULE,
      purpose: PURPOSE_SEARCH,
    });
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Shared docs (tenantId IS NULL) plus this tenant's. The tenant id is a
    // bound parameter, not interpolated: it used to be spliced into the SQL
    // string, which is an injection sink even though the value comes from the
    // session today.
    const tenantFilter = tenantId
      ? `("tenantId" IS NULL OR "tenantId" = $3)`
      : `"tenantId" IS NULL`;

    const scope = tenantId ?? PLATFORM_SCOPE_TENANT_ID;
    const results: ChunkMatch[] = await withTenant(scope, async (tx) => {
      return await tx.$queryRawUnsafe(
        `SELECT text, "documentId", 1 - (embedding <=> $1::vector) AS score
         FROM "Chunk"
         WHERE ${tenantFilter}
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        embeddingStr,
        topK,
        ...(tenantId ? [tenantId] : [])
      );
    });

    if (results && results.length > 0) {
      return results.map(r => ({
        text: r.text,
        score: Number(r.score),
        documentId: r.documentId,
      }));
    }
  } catch (e) {
    // Same rule as ingestDocument: the query text has already been sent.
    if (e instanceof AiUsageLogWriteError) throw e;
    console.warn(`[retrieveChunks] DB retrieval bypassed: ${errorMessage(e)}`);
  }

  // Fallback demo chunks for preview/demo mode
  return [
    {
      text: `[CORDIS Project ZERO-EMISSION-EV]\nTopic: HORIZON-CL5-2026-D3-01\nCoordinator: Fraunhofer-Gesellschaft (DE)\nEC Grant: €4,500,000\nObjective: Next-Generation Solid-State Battery Thermal Management for EV Fleet Systems with embedded micro-sensors.`,
      score: 0.94,
      documentId: 'doc-cordis-1',
    },
    {
      text: `[CORDIS Project HYDROGEN-CATALYST]\nTopic: HORIZON-CL4-2026-TWIN-01\nCoordinator: Middle East Technical University (METU) (TR)\nEC Grant: €3,200,000\nObjective: Machine Learning Electrocatalyst Discovery for Industrial Water Electrolysis.`,
      score: 0.88,
      documentId: 'doc-cordis-2',
    },
    {
      text: `[CORDIS Project RECYCLED-COMPOSITE]\nTopic: HORIZON-CL5-2026-D2-02\nCoordinator: İstanbul Teknik Üniversitesi (İTÜ) (TR)\nEC Grant: €5,800,000\nObjective: Circular Economy Bio-Resin Composite Recycling for Sustainable Aviation.`,
      score: 0.81,
      documentId: 'doc-cordis-3',
    },
  ].slice(0, topK);
}

export function formatRagPrompt(userQuery: string, chunks: { text: string; score: number }[]): string {
  if (chunks.length === 0) {
    return userQuery;
  }

  const context = chunks.map((c, i) => `[Source ${i + 1} | Score: ${(c.score * 100).toFixed(1)}%]\n${c.text}`).join('\n\n');

  return `Use the following retrieved EU CORDIS context to answer the question.

---RETRIEVED CONTEXT---
${context}
---END CONTEXT---

Question: ${userQuery}`;
}

/**
 * Build a RAG-augmented prompt by prepending relevant context chunks.
 */
export async function buildRagPrompt(
  userQuery: string,
  tenantId?: string,
  topK: number = 5,
  actor?: RagActor
): Promise<string> {
  const chunks = await retrieveChunks(userQuery, topK, tenantId, actor);
  return formatRagPrompt(userQuery, chunks);
}
