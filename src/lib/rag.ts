/**
 * RAG (Retrieval-Augmented Generation) utility — the single entry point.
 *
 * Handles:
 * - Splitting text into chunks
 * - Generating embeddings (through `embedText`, so every call is logged)
 * - Storing chunks with embeddings in Document/Chunk tables
 * - Retrieving relevant chunks via pgvector cosine similarity
 *
 * TASK-MTU6KE36HAFJR — this used to be two files. `src/lib/ai/rag.ts` held a
 * second chunker, a second embed-and-INSERT loop and a second similarity search
 * over the *same* `Chunk` table, and it was the last resident of `src/lib/ai/`,
 * a directory that only still existed because the `src/lib/ai/llm.ts` cleanup
 * (b6f1642, TASK-MTSXGXBCJ007W) never touched its neighbour. The audit measured
 * three real divergences, all of them resolved here rather than carried over:
 *
 *   - the database client: this file wraps every statement in `withTenant`
 *     (which sets `app.tenant_id`), the other used the global client. Its
 *     `semanticSearch` was passed a real tenant id by
 *     `src/modules/m2/server/actions.ts`, so the day the main connection moves
 *     to the NOBYPASSRLS `fabrika_app` role that call would not have errored —
 *     it would have silently returned only the shared corpus and dropped the
 *     tenant's own documents. There is now one search function, and it is
 *     tenant-scoped.
 *   - the error path: `retrieveChunks` answered a failed retrieval with three
 *     hardcoded CORDIS projects, grants and all, which `formatRagPrompt` then
 *     labelled `[Source 1 | Score: 94.0%]` and fed to the model. That is
 *     invented evidence (CLAUDE.md rule 7) and it is gone; a failed retrieval
 *     is now an error, and an empty corpus is an empty list.
 *   - the chunk size: 1500 here, 1000 there, into one table. Both are kept,
 *     deliberately, so neither existing corpus needs re-ingesting — but they are
 *     now two arguments to one chunker instead of two constants in two files.
 */

import { renderPrompt } from '@/lib/ai/prompts';
import { withTenant } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { embedText, PLATFORM_SCOPE_TENANT_ID, type AiCallAttribution } from '@/lib/llm';
import { recordAlert } from '@/lib/observability/system-alert';
import { estimateEmbeddingUsd, hasMeaningfulText, RAG_UPLOAD_LIMITS } from '@/lib/rag-upload';

/** One row of the pgvector similarity search over `Chunk`. */
export interface ChunkMatch {
  text: string;
  documentId: string;
  score: number;
}

/** Characters per chunk for plain-text ingest (CORDIS records). */
const CHUNK_SIZE = 1500;
/** Characters per chunk for PDF ingest — finer, and what the PDF corpus was written at. */
const PDF_CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
/** Must match the `vector(1536)` column `Chunk.embedding` is declared as. */
const EMBEDDING_DIMENSIONS = 1536;

/** The shared AI layer these calls are booked against in `AiUsageLog`. */
const RAG_MODULE = 'K6';
const PURPOSE_INGEST = 'rag_ingest_embedding';
const PURPOSE_SEARCH = 'rag_search_embedding';

/** Stable origin for the alerts this module raises. */
const RAG_UPLOAD_ALERT_SOURCE = 'rag-pdf-ingest';

/** Who triggered a RAG call, when a user session is available. */
export interface RagActor {
  userId?: string;
}

/**
 * A PDF with no text layer (scanned, image-only) — nothing was written. Its own
 * class so the upload route can tell the admin "this file has no text" instead
 * of a generic failure.
 */
export class NoExtractableTextError extends Error {
  constructor(title: string) {
    super(`No extractable text in "${title}" — nothing was stored`);
    this.name = 'NoExtractableTextError';
  }
}

/**
 * A PDF over one of the upload's work limits (`RAG_UPLOAD_LIMITS`), refused
 * before the first embedding call and before any row is written. `code` is the
 * upload route's error code; `detail` carries the measured value and the limit.
 */
export class PdfLimitError extends Error {
  constructor(
    readonly code: 'too_many_pages' | 'too_many_chunks' | 'over_budget',
    readonly detail: Record<string, number>
  ) {
    super(`PDF refused (${code}): ${JSON.stringify(detail)} — nothing was stored`);
    this.name = 'PdfLimitError';
  }
}

/** Pages extracted between two turns of the event loop. */
const PDF_PAGES_PER_SLICE = 20;

/** The text of a PDF, one entry per page, without pdf-parse's page separators. */
export interface ExtractedPdf {
  pages: number;
  text: string;
}

/**
 * Extract a PDF's text within the upload limits (İNCELEME-45 B-1, B-2).
 *
 * - The page count is read first (`getInfo`, no text extraction): 30 000 pages
 *   are refused in ~0.2 s instead of being parsed for 4.5 minutes.
 * - pdf.js runs on the main thread in Node, and one `getText()` over the whole
 *   document answered no other request until it finished. Pages are extracted
 *   `PDF_PAGES_PER_SLICE` at a time with a `setImmediate` between slices, so
 *   the rest of the server gets a turn every few tens of milliseconds.
 * - Extraction stops as soon as the text is past what `maxChunks` could hold,
 *   so an oversized document is not parsed to the end only to be refused.
 * - Pages are joined here from `pages[].text`, never from pdf-parse's `text`:
 *   that one carries `-- N of M --` after every page (its default
 *   `pageJoiner`), which made a scan with no text layer look like a text PDF
 *   and got the separator embedded, one paid chunk per page. `pageJoiner: ''`
 *   only saves building that string.
 */
export async function extractPdfText(fileBuffer: Buffer): Promise<ExtractedPdf> {
  // pdf-parse v2 exports the PDFParse class and no callable default, so the
  // v1-style `pdfParse(buffer)` this used to `require()` could only ever throw.
  // Imported here rather than at module scope: this module is now also on the
  // path of the CORDIS sync jobs and the concept-note actions, none of which
  // parse a PDF.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: fileBuffer });
  try {
    const { total } = await parser.getInfo();
    if (total > RAG_UPLOAD_LIMITS.maxPages) {
      throw new PdfLimitError('too_many_pages', { pages: total, maxPages: RAG_UPLOAD_LIMITS.maxPages });
    }

    // Past this length `chunkText` yields more than `maxChunks` chunks.
    const maxChars = RAG_UPLOAD_LIMITS.maxChunks * (PDF_CHUNK_SIZE - CHUNK_OVERLAP) + CHUNK_OVERLAP;
    const pageTexts: string[] = [];
    let length = 0;
    for (let first = 1; first <= total; first += PDF_PAGES_PER_SLICE) {
      const last = Math.min(first + PDF_PAGES_PER_SLICE - 1, total);
      const slice = await parser.getText({ first, last, pageJoiner: '' });
      for (const page of slice.pages) {
        pageTexts.push(page.text);
        length += page.text.length + 2;
      }
      if (length > maxChars) {
        throw new PdfLimitError('too_many_chunks', {
          pagesRead: last,
          pages: total,
          maxChunks: RAG_UPLOAD_LIMITS.maxChunks,
        });
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return { pages: total, text: pageTexts.join('\n\n') };
  } finally {
    await parser.destroy();
  }
}

/** A shared-corpus document as the admin console lists it. */
export interface SharedDocumentSummary {
  id: string;
  kind: string;
  title: string;
  createdAt: Date;
  chunks: number;
}

/**
 * The most recent shared (`tenantId: null`) documents of the given kinds, with
 * their stored chunk counts. Read under the platform scope, which the
 * `tenant_or_shared` policy lets see exactly the NULL-tenant rows.
 */
export async function listSharedDocuments(
  kinds: readonly string[],
  take: number = 50
): Promise<{ documents: SharedDocumentSummary[]; total: number }> {
  return withTenant(PLATFORM_SCOPE_TENANT_ID, async (tx) => {
    const where = { tenantId: null, kind: { in: [...kinds] } };
    const [rows, total] = await Promise.all([
      tx.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, kind: true, title: true, createdAt: true, _count: { select: { chunks: true } } },
      }),
      tx.document.count({ where }),
    ]);
    return {
      documents: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        createdAt: r.createdAt,
        chunks: r._count.chunks,
      })),
      total,
    };
  });
}

/**
 * A shared document of the same kind already carrying this title (case- and
 * surrounding-space-insensitive), or null. `Document` stores no content hash,
 * so the title is the only handle an admin re-uploading the same file gives us —
 * and a second upload of the same PDF embeds every chunk again, at the
 * platform's expense, and doubles its weight in every tenant's retrieval.
 */
export async function findSharedDocumentByTitle(
  kind: string,
  title: string
): Promise<SharedDocumentSummary | null> {
  return withTenant(PLATFORM_SCOPE_TENANT_ID, async (tx) => {
    const row = await tx.document.findFirst({
      where: { tenantId: null, kind, title: { equals: title.trim(), mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, title: true, createdAt: true, _count: { select: { chunks: true } } },
    });
    return row
      ? { id: row.id, kind: row.kind, title: row.title, createdAt: row.createdAt, chunks: row._count.chunks }
      : null;
  });
}

/** What an upload actually put into the corpus. */
export interface PdfIngestResult {
  doc: { id: string };
  /** Chunks Postgres confirmed it inserted — never the loop counter. */
  storedChunks: number;
}

/**
 * Split a long text into overlapping chunks.
 *
 * `size` is a parameter rather than a constant because the two ingest paths
 * genuinely disagree: CORDIS records are ingested at 1500 and the PDF corpus at
 * 1000, both already written to the same `Chunk` table. Unifying the number
 * would mean re-embedding one of the two corpora, which is a cost decision and
 * not a refactor — so the divergence stays visible in one place instead of
 * hiding as a constant in each of two files.
 */
export function chunkText(
  text: string,
  size: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP
): string[] {
  // A stride of zero or less would loop forever rather than fail. Both callers
  // pass constants today; this guards the next one.
  const stride = size - overlap;
  if (stride <= 0) {
    throw new Error(`chunkText: overlap (${overlap}) must be smaller than size (${size})`);
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += stride;
  }

  return chunks;
}

/** Plain-text ingest chunking, at the size the CORDIS corpus was written with. */
export function splitText(text: string): string[] {
  return chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
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
 * TASK-MTUH5L8MJ6S8E — there is no fallback. A key-less or failing provider
 * used to produce a `mockEmbedding` here: a vector encoding the first 1536
 * character codes of the text and nothing about its meaning. `ingestDocument`
 * wrote that into the real `Chunk` table, where the row looks ingested, is
 * counted as ingested, and never comes back from a similarity search; a search
 * embedded the same way ranked real chunks by an arithmetic that has nothing to
 * do with them. Tests that need a vector without a key now supply one at the
 * provider boundary (`tests/helpers/fake-embedding.ts`), where a fake is named
 * as a fake. Production code invents nothing.
 */
export async function getEmbedding(
  text: string,
  attribution: AiCallAttribution
): Promise<number[]> {
  return embedText(text, attribution, { dimensions: EMBEDDING_DIMENSIONS });
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
 *
 * One interactive transaction covers the whole loop, which `processPdfAndStore`
 * deliberately does not do — see the note there. The records this path ingests
 * are short (one CORDIS project each, a chunk or two), so the transaction is
 * held open for a call or two rather than for minutes.
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
    for (const [i, chunk] of chunks.entries()) {
      const embedding = await getEmbedding(chunk, {
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
        chunk,
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
 * A *single* transaction around the whole loop is deliberately not used to get
 * that atomicity, and that is the one thing this path does differently from
 * `ingestDocument`: the loop makes one provider call per chunk, and holding a
 * database transaction open across minutes of HTTP would trip Prisma's
 * interactive-transaction timeout on any large PDF. The document is discarded
 * on the error path instead, and if even that fails the orphan is named in a
 * `SystemAlert` rather than left for someone to find (CLAUDE.md rule 6).
 *
 * Each individual statement still goes through `withTenant`, so `app.tenant_id`
 * is set for it — a short transaction per write rather than one long one. That
 * closes the gap this function used to carry as a comment
 * (TASK-MTSZ0AL4QP2CT): it wrote through the global client, so a tenant-scoped
 * upload would have been invisible to RLS the day the main connection stops
 * bypassing it. Only the shared corpus (`tenantId: null`) is reachable from the
 * one caller today, which is what kept that gap harmless — not what made it
 * safe.
 */
export async function processPdfAndStore(
  fileBuffer: Buffer,
  tenantId: string | null,
  kind: string,
  title: string,
  sourceUrl?: string,
  actor?: RagActor
): Promise<PdfIngestResult> {
  const scope = tenantId ?? PLATFORM_SCOPE_TENANT_ID;

  const { text, pages } = await extractPdfText(fileBuffer);

  // Nothing was written yet, so there is nothing to undo — and nothing to
  // report as a successful upload either. A scanned or image-only PDF lands
  // here; answering 200 for it is how "stored nothing" passes for success.
  // "No text" means no *readable* text: a blank-chunk check alone let a scan
  // through on its page separators and a stamped page number (İNCELEME-45 B-2).
  if (!hasMeaningfulText(text, pages)) {
    throw new NoExtractableTextError(title);
  }

  // Basic text chunking. Blank chunks are dropped *here* rather than skipped
  // inside the loop, so `ordinal` stays contiguous and `chunks.length` is the
  // number of rows this ingest is supposed to produce.
  const chunks = chunkText(text, PDF_CHUNK_SIZE, CHUNK_OVERLAP).filter((c) => c.trim().length > 0);
  if (chunks.length === 0) {
    throw new NoExtractableTextError(title);
  }
  // `extractPdfText` stops early on length; this is the exact count.
  if (chunks.length > RAG_UPLOAD_LIMITS.maxChunks) {
    throw new PdfLimitError('too_many_chunks', { chunks: chunks.length, maxChunks: RAG_UPLOAD_LIMITS.maxChunks });
  }
  const estimatedUsd = estimateEmbeddingUsd(chunks.reduce((sum, c) => sum + c.length, 0));
  if (estimatedUsd > RAG_UPLOAD_LIMITS.maxEmbeddingUsd) {
    throw new PdfLimitError('over_budget', { estimatedUsd, maxUsd: RAG_UPLOAD_LIMITS.maxEmbeddingUsd });
  }

  // Save document
  const doc = await withTenant(scope, (tx) =>
    tx.document.create({
      data: {
        tenantId,
        kind,
        title,
        sourceUrl,
      },
    })
  );

  // Get embeddings and save chunks
  // Simple batching to respect rate limits
  let stored = 0;
  try {
    for (const [i, chunkStr] of chunks.entries()) {
      const embedding = await getEmbedding(chunkStr, {
        tenantId,
        userId: actor?.userId,
        module: RAG_MODULE,
        purpose: PURPOSE_INGEST,
      });

      // Format embedding array to pgvector string format: '[0.1, 0.2, ...]'
      const embeddingStr = `[${embedding.join(',')}]`;

      // Save to chunk with pgvector
      stored += await withTenant(
        scope,
        (tx) => tx.$executeRaw`
        INSERT INTO "Chunk" ("id", "documentId", "tenantId", "ordinal", "text", "embedding")
        VALUES (gen_random_uuid(), ${doc.id}, ${tenantId}, ${i}, ${chunkStr}, ${embeddingStr}::vector)
      `
      );
    }

    if (stored !== chunks.length) {
      throw new Error(
        `"${title}" split into ${chunks.length} chunks but Postgres reported ${stored} inserted`
      );
    }
  } catch (e) {
    await discardPartialDocument(doc.id, title, scope);
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
async function discardPartialDocument(
  documentId: string,
  title: string,
  scope: string
): Promise<void> {
  try {
    await withTenant(scope, async (tx) => {
      await tx.$executeRaw`DELETE FROM "Chunk" WHERE "documentId" = ${documentId}`;
      await tx.document.delete({ where: { id: documentId } });
    });
  } catch (cleanupError) {
    await recordAlert({
      level: 'error',
      source: RAG_UPLOAD_ALERT_SOURCE,
      message: 'PDF ingest failed and its partial document could not be removed',
      meta: { documentId, cleanupError: errorMessage(cleanupError) },
      // Every field of the old identity was per-occurrence — a fresh document
      // id and a cleanup error string — so this alert opened a row per orphan.
      // The defect is that the cleanup path cannot delete; `alertRepeatCount`
      // is then how many orphans are outstanding. No id is lost: the
      // `console.error` on the next line names each one individually.
      dedupeKey: 'rag-pdf-ingest:orphan-not-removed',
    });
    console.error(`[processPdfAndStore] orphan document ${documentId} ("${title}") left behind`);
  }
}

/**
 * Retrieve the top-K most relevant chunks for a query.
 * Uses pgvector cosine distance (<=> operator).
 *
 * This is the only similarity search in the codebase. `semanticSearch` in
 * `src/lib/ai/rag.ts` was the same query with the score column named
 * `similarity` and no tenant context on the connection; its one caller
 * (`src/modules/m2/server/actions.ts`) now comes here.
 *
 * A failed retrieval throws. It used to return three hardcoded CORDIS projects
 * — named coordinators, €4,500,000 grants — which `formatRagPrompt` then
 * presented to the model as `[Source 1 | Score: 94.0%]`, so a database outage
 * turned into a concept note citing projects that do not exist. CLAUDE.md rule
 * 7 has no demo-mode exception (TASK-MTU6KE36HAFJR). An empty corpus returns an
 * empty list, which `formatRagPrompt` already handles by sending the question
 * through unaugmented.
 */
export async function retrieveChunks(
  query: string,
  topK: number = 5,
  tenantId?: string,
  actor?: RagActor
): Promise<ChunkMatch[]> {
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

  if (!results || results.length === 0) return [];

  return results.map(r => ({
    text: r.text,
    score: Number(r.score),
    documentId: r.documentId,
  }));
}

export function formatRagPrompt(
  userQuery: string,
  chunks: { text: string; score: number }[],
  locale?: string
): string {
  if (chunks.length === 0) {
    return userQuery;
  }

  const context = chunks.map((c, i) => `[Source ${i + 1} | Score: ${(c.score * 100).toFixed(1)}%]\n${c.text}`).join('\n\n');

  return renderPrompt('rag/retrieved-context', { context, question: userQuery }, locale);
}

/**
 * Build a RAG-augmented prompt by prepending relevant context chunks.
 */
export async function buildRagPrompt(
  userQuery: string,
  tenantId?: string,
  topK: number = 5,
  actor?: RagActor,
  locale?: string
): Promise<string> {
  const chunks = await retrieveChunks(userQuery, topK, tenantId, actor);
  return formatRagPrompt(userQuery, chunks, locale);
}
