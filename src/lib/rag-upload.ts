/**
 * Limits of the platform-admin PDF upload into the shared K6 RAG corpus
 * (`POST /api/admin/documents/upload`, TASK-MULQL8QB679LQ).
 *
 * Kept free of server imports: the admin page's client form reads the same
 * allowlist and limits, so the browser refuses what the route would refuse
 * before a single byte is sent — the route still checks every one of them.
 */

/**
 * The `Document.kind` values an admin may upload into the shared corpus
 * (`tenantId: null`). The schema also names `cordis_summary` (written by the
 * CORDIS ingest jobs, never by hand) and `tenant_upload` (a tenant's own file,
 * never shared) — neither belongs in this form.
 */
export const RAG_UPLOAD_KINDS = ['work_programme', 'topic'] as const;
export type RagUploadKind = (typeof RAG_UPLOAD_KINDS)[number];

export function isRagUploadKind(value: unknown): value is RagUploadKind {
  return typeof value === 'string' && (RAG_UPLOAD_KINDS as readonly string[]).includes(value);
}

export const RAG_UPLOAD_LIMITS = {
  /** A Horizon Europe work programme part is a few MB; 20 MB leaves room without inviting a book. */
  maxFileBytes: 20 * 1024 * 1024,
  maxTitleLength: 200,
  /**
   * The byte cap alone does not bound the work: pages can share one content
   * stream, so 4.8 MB held 30 000 pages and 240 699 chunks (İNCELEME-45 B-1).
   * A work programme part is a few hundred pages; 1000 is twice the largest
   * with room left. The count is read before any text is extracted.
   */
  maxPages: 1000,
  /**
   * One embedding call per chunk, made one after another inside the request.
   * 2500 chunks ≈ 2 M characters ≈ a 600-page dense work programme, and at
   * ~0.2 s a call already keeps the admin waiting for about eight minutes.
   */
  maxChunks: 2500,
  /**
   * Ceiling on the estimated cost of one upload's embeddings. With 1000-char
   * chunks `maxChunks` binds first (≤ 0.11 USD by the estimate below); this
   * holds on its own if the chunk size, the model or `maxChunks` changes.
   */
  maxEmbeddingUsd: 0.2,
  /**
   * The page and chunk limits bound how many pages are read, not the work in
   * one page: a 37 KB PDF with one highly compressed content stream took pdf.js
   * 20 s (İNCELEME-52 B-1'). Extraction runs in its own thread, which is
   * terminated at this deadline. The 1000-page dense test PDF reaches its
   * chunk limit in under 2 s, so 30 s is far past a real work programme.
   */
  maxParseMs: 30_000,
  /** V8 heap of the extraction thread; past it the thread dies, not the server. */
  maxParseHeapMb: 512,
  /**
   * What all of the file's streams may inflate to, and one stream alone
   * (decompression bomb). A text page's content stream is tens to hundreds of
   * KB inflated; 20 MB of text PDF does not come near 256 MB.
   */
  maxInflatedMb: 256,
  maxStreamInflatedMb: 64,
} as const;

/**
 * How the upload estimates what its embeddings will cost, before the first
 * call. text-embedding-3-large is 0.13 USD per million input tokens. Three
 * characters per token over-counts English (~4) on purpose, so Turkish text
 * and numbers are not under-estimated.
 */
export const RAG_EMBEDDING_COST = {
  usdPerMillionTokens: 0.13,
  charsPerTokenEstimate: 3,
} as const;

export function estimateEmbeddingUsd(totalChars: number): number {
  const tokens = Math.ceil(totalChars / RAG_EMBEDDING_COST.charsPerTokenEstimate);
  return (tokens * RAG_EMBEDDING_COST.usdPerMillionTokens) / 1_000_000;
}

/**
 * The least text a PDF must yield to be worth embedding (İNCELEME-45 B-2).
 * Only letters and digits count: whitespace, page separators and the stray
 * symbols a scan's broken text layer produces do not. A real work programme
 * page carries thousands of them; a scanned page carries none, or a stamped
 * page number.
 */
export const RAG_TEXT_THRESHOLDS = {
  /** In the whole document. */
  minMeaningfulChars: 200,
  /** On average per page — a 300-page scan with a typed cover page is still a scan. */
  minMeaningfulCharsPerPage: 100,
  /** Share of the non-whitespace characters that are letters or digits. */
  minMeaningfulRatio: 0.5,
} as const;

export interface TextSignal {
  meaningfulChars: number;
  nonWhitespaceChars: number;
}

export function measureText(text: string): TextSignal {
  return {
    // Counted by deletion, not `match`: a 2 M-character text would otherwise
    // allocate an array of 2 M one-character strings.
    meaningfulChars: text.replace(/[^\p{L}\p{N}]/gu, '').length,
    nonWhitespaceChars: text.replace(/\s/gu, '').length,
  };
}

/** Whether `text`, extracted from `pages` pages, is readable text rather than a scan. */
export function hasMeaningfulText(text: string, pages: number): boolean {
  const { meaningfulChars, nonWhitespaceChars } = measureText(text);
  const t = RAG_TEXT_THRESHOLDS;
  return (
    meaningfulChars >= t.minMeaningfulChars &&
    meaningfulChars >= t.minMeaningfulCharsPerPage * Math.max(1, pages) &&
    meaningfulChars >= t.minMeaningfulRatio * nonWhitespaceChars
  );
}

/** Error codes the upload route answers with; the admin form has a message for each. */
export const RAG_UPLOAD_ERRORS = [
  'bad_form',
  'no_file',
  'too_large',
  'not_pdf',
  'bad_kind',
  'bad_title',
  'duplicate',
  'no_text',
  'too_many_pages',
  'too_many_chunks',
  'over_budget',
  'parse_too_heavy',
  'upload_failed',
] as const;
export type RagUploadError = (typeof RAG_UPLOAD_ERRORS)[number];

/** A PDF starts with `%PDF-` — the one check a renamed file or a spoofed Content-Type cannot pass. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}
