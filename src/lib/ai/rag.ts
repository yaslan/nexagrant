import { prisma } from '@/lib/db';
import { PDFParse } from 'pdf-parse';
import { errorMessage } from '@/lib/errors';
import { embedText } from '@/lib/llm';
import { recordAlert } from '@/lib/observability/system-alert';

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

/** What an upload actually put into the corpus. */
export interface PdfIngestResult {
  doc: { id: string };
  /** Chunks Postgres confirmed it inserted — never the loop counter. */
  storedChunks: number;
}

/** Stable origin for the alerts this module raises. */
const RAG_UPLOAD_ALERT_SOURCE = 'rag-pdf-ingest';

/**
 * Parse a PDF and store it as a `Document` plus its embedded `Chunk` rows.
 *
 * Resolves only when the whole document is in the corpus, and reports how many
 * chunks that was. TASK-MTSYCMWFL22CA — it used to create the `Document` row
 * first and embed afterwards with no rollback of any kind, so a failure part
 * way through the loop (a provider outage, a missing key, a rejected vector)
 * left a titled document behind with zero chunks: present in the shared corpus,
 * counted as a document, retrievable by nothing. Measured at 1 `Document` row
 * and 0 `Chunk` rows after an `OPENAI_API_KEY not set` throw.
 *
 * A `$transaction` is deliberately *not* used to get that atomicity: the loop
 * makes one provider call per chunk, and holding a database transaction open
 * across minutes of HTTP would trip Prisma's interactive-transaction timeout on
 * any large PDF. The document is discarded on the error path instead, and if
 * even that fails the orphan is named in a `SystemAlert` rather than left for
 * someone to find (CLAUDE.md rule 6).
 *
 * Known gap, out of scope here: these writes go through the global client, so a
 * tenant-scoped call (`tenantId` non-null) has no `app.tenant_id` set and is
 * refused by RLS. Only the shared corpus (`tenantId: null`) is reachable today,
 * which is all the one caller uses. Tracked as TASK-MTSZ0AL4QP2CT.
 */
export async function processPdfAndStore(
  fileBuffer: Buffer,
  tenantId: string | null,
  kind: string,
  title: string,
  sourceUrl?: string,
  actor?: RagActor
): Promise<PdfIngestResult> {
  // pdf-parse v2 exports the PDFParse class and no callable default, so the
  // v1-style `pdfParse(buffer)` this used to `require()` could only ever throw.
  const parser = new PDFParse({ data: fileBuffer });
  const { text } = await parser.getText();

  // Basic text chunking. Blank chunks are dropped *here* rather than skipped
  // inside the loop, so `ordinal` stays contiguous and `chunks.length` is the
  // number of rows this ingest is supposed to produce.
  const chunks = chunkText(text, 1000, 200).filter((c) => c.trim().length > 0);
  if (chunks.length === 0) {
    // Nothing was written yet, so there is nothing to undo — and nothing to
    // report as a successful upload either. A scanned or image-only PDF lands
    // here; answering 200 for it is how "stored nothing" passes for success.
    throw new Error(`No extractable text in "${title}" — nothing was stored`);
  }

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
  let stored = 0;
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunkStr = chunks[i];

      const embedding = await embedText(chunkStr, {
        tenantId,
        userId: actor?.userId,
        module: RAG_MODULE,
        purpose: 'rag_ingest_embedding',
      });

      // Format embedding array to pgvector string format: '[0.1, 0.2, ...]'
      const embeddingStr = `[${embedding.join(',')}]`;

      // Save to chunk with pgvector
      stored += await prisma.$executeRaw`
        INSERT INTO "Chunk" ("id", "documentId", "tenantId", "ordinal", "text", "embedding")
        VALUES (gen_random_uuid(), ${doc.id}, ${tenantId}, ${i}, ${chunkStr}, ${embeddingStr}::vector)
      `;
    }

    if (stored !== chunks.length) {
      throw new Error(
        `"${title}" split into ${chunks.length} chunks but Postgres reported ${stored} inserted`
      );
    }
  } catch (e) {
    await discardPartialDocument(doc.id, title);
    throw e;
  }

  return { doc, storedChunks: stored };
}

/**
 * Remove a document whose ingest did not finish, so the corpus never keeps a
 * row nothing can be retrieved from. Best effort by necessity — it runs on an
 * error path, and its own failure must not replace the original error — but
 * never silent: an orphan that survives is named in a `SystemAlert` by id, and
 * only by id, since `SystemAlert` has no tenant isolation.
 */
async function discardPartialDocument(documentId: string, title: string): Promise<void> {
  try {
    await prisma.$executeRaw`DELETE FROM "Chunk" WHERE "documentId" = ${documentId}`;
    await prisma.document.delete({ where: { id: documentId } });
  } catch (cleanupError) {
    await recordAlert({
      level: 'error',
      source: RAG_UPLOAD_ALERT_SOURCE,
      message: 'PDF ingest failed and its partial document could not be removed',
      meta: { documentId, cleanupError: errorMessage(cleanupError) },
    });
    console.error(`[processPdfAndStore] orphan document ${documentId} ("${title}") left behind`);
  }
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
