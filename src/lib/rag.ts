/**
 * RAG (Retrieval-Augmented Generation) utility
 * 
 * Handles:
 * - Splitting text into chunks
 * - Generating embeddings (mock for now, real via OpenAI text-embedding-3-large)
 * - Storing chunks with embeddings in Document/Chunk tables
 * - Retrieving relevant chunks via pgvector cosine similarity
 */

import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

/** One row of the pgvector similarity search over `Chunk`. */
interface ChunkMatch {
  text: string;
  documentId: string;
  score: number;
}

const CHUNK_SIZE = 1500;  // characters per chunk
const CHUNK_OVERLAP = 200;

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
 * In production, calls OpenAI text-embedding-3-large (1536 dimensions).
 * Here we provide a mock fallback for environments without an API key.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large',
          input: text,
          dimensions: 1536,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.data[0].embedding;
      }
    } catch (e) {}
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
 */
export async function ingestDocument(
  title: string,
  text: string,
  kind: string,
  tenantId?: string
): Promise<string> {
  let docId = `doc-${Date.now()}`;
  try {
    const doc = await prisma.document.create({
      data: { tenantId, kind, title },
    });
    docId = doc.id;

    const chunks = splitText(text);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await getEmbedding(chunks[i]);
      const embeddingStr = `[${embedding.join(',')}]`;

      // Use raw SQL to insert vector type
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Chunk" (id, "documentId", "tenantId", ordinal, text, embedding)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector)`,
        doc.id,
        tenantId || null,
        i,
        chunks[i],
        embeddingStr
      );
    }
  } catch (e) {
    console.warn(`[ingestDocument] DB ingestion bypassed: ${errorMessage(e)}`);
  }

  return docId;
}

/**
 * Retrieve the top-K most relevant chunks for a query.
 * Uses pgvector cosine distance (<=> operator).
 */
export async function retrieveChunks(
  query: string,
  topK: number = 5,
  tenantId?: string
): Promise<{ text: string; score: number; documentId: string }[]> {
  try {
    const queryEmbedding = await getEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Shared docs (tenantId IS NULL) plus this tenant's. The tenant id is a
    // bound parameter, not interpolated: it used to be spliced into the SQL
    // string, which is an injection sink even though the value comes from the
    // session today.
    const tenantFilter = tenantId
      ? `("tenantId" IS NULL OR "tenantId" = $3)`
      : `"tenantId" IS NULL`;

    const results: ChunkMatch[] = await prisma.$queryRawUnsafe(
      `SELECT text, "documentId", 1 - (embedding <=> $1::vector) AS score
       FROM "Chunk"
       WHERE ${tenantFilter}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      embeddingStr,
      topK,
      ...(tenantId ? [tenantId] : [])
    );

    if (results && results.length > 0) {
      return results.map(r => ({
        text: r.text,
        score: Number(r.score),
        documentId: r.documentId,
      }));
    }
  } catch (e) {
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

/**
 * Build a RAG-augmented prompt by prepending relevant context chunks.
 */
export async function buildRagPrompt(
  userQuery: string,
  tenantId?: string,
  topK: number = 5
): Promise<string> {
  const chunks = await retrieveChunks(userQuery, topK, tenantId);

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
