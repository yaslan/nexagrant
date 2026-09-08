import { prisma } from '@/lib/db';
import { PDFParse } from 'pdf-parse';
import { embedText } from '@/lib/llm';

/**
 * These two functions used to hold their own OpenAI SDK client, built with
 * `process.env.OPENAI_API_KEY || 'sk-mock-key-for-testing'`, and call the
 * embeddings endpoint directly — so the full text of an uploaded PDF went to
 * OpenAI in 1000-character chunks with no `AiUsageLog` row behind it: no
 * tenant, no promptHash, no record of the processing at all
 * (TASK-MTSWVADF7RQ1B). They now go through `embedText`, the same choke point
 * `generateWithAI` uses, which logs every call. Two consequences worth naming:
 *
 * - the embedding is now requested at 1536 dimensions, which is what the
 *   `Chunk.embedding` column is declared as. The old call asked for
 *   text-embedding-3-large's default 3072, so a successful response could never
 *   have been inserted here.
 * - a missing key now fails as a configuration error instead of being sent to
 *   the provider as a fake key and coming back 401.
 */

/** The shared AI layer these calls are booked against in `AiUsageLog`. */
const RAG_MODULE = 'K6';

/** Who triggered the call, when a user session is available. */
export interface RagActor {
  userId?: string;
}

export async function processPdfAndStore(
  fileBuffer: Buffer,
  tenantId: string | null,
  kind: string,
  title: string,
  sourceUrl?: string,
  actor?: RagActor
) {
  // pdf-parse v2 exports the PDFParse class and no callable default, so the
  // v1-style `pdfParse(buffer)` this used to `require()` could only ever throw.
  const parser = new PDFParse({ data: fileBuffer });
  const { text } = await parser.getText();
  
  // Basic text chunking
  const chunks = chunkText(text, 1000, 200);
  
  // Save document
  const doc = await prisma.document.create({
    data: {
      tenantId,
      kind,
      title,
      sourceUrl
    }
  });

  // Get embeddings and save chunks
  // Simple batching to respect rate limits
  for (let i = 0; i < chunks.length; i++) {
    const chunkStr = chunks[i];
    
    // Skip empty chunks
    if (chunkStr.trim().length === 0) continue;
    
    const embedding = await embedText(chunkStr, {
      tenantId,
      userId: actor?.userId,
      module: RAG_MODULE,
      purpose: 'rag_ingest_embedding',
    });

    // Format embedding array to pgvector string format: '[0.1, 0.2, ...]'
    const embeddingStr = `[${embedding.join(',')}]`;
    
    // Save to chunk with pgvector
    await prisma.$executeRaw`
      INSERT INTO "Chunk" ("id", "documentId", "tenantId", "ordinal", "text", "embedding")
      VALUES (gen_random_uuid(), ${doc.id}, ${tenantId}, ${i}, ${chunkStr}, ${embeddingStr}::vector)
    `;
  }
  
  return doc;
}

export async function semanticSearch(
  query: string,
  tenantId?: string | null,
  topK = 5,
  actor?: RagActor
) {
  const embedding = await embedText(query, {
    tenantId: tenantId ?? null,
    userId: actor?.userId,
    module: RAG_MODULE,
    purpose: 'rag_search_embedding',
  });

  const embeddingStr = `[${embedding.join(',')}]`;
  
  // Use cosine distance (<=>)
  let results;
  if (tenantId) {
    results = await prisma.$queryRaw`
      SELECT c.id, c.text, c."documentId", 1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
      FROM "Chunk" c
      WHERE c."tenantId" = ${tenantId} OR c."tenantId" IS NULL
      ORDER BY c.embedding <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `;
  } else {
    results = await prisma.$queryRaw`
      SELECT c.id, c.text, c."documentId", 1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
      FROM "Chunk" c
      WHERE c."tenantId" IS NULL
      ORDER BY c.embedding <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `;
  }
  
  return results;
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}
