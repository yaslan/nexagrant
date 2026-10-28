/**
 * Limits and vocabulary of the M17 document upload (FO-186).
 *
 * Kept free of server imports so the upload form (fe-fb, F2) reads the same
 * allowlist and caps and refuses a file before a byte is sent; the route still
 * checks every one of them.
 */
import { RAG_UPLOAD_LIMITS } from '@/lib/rag-upload';

/** Which slot of the analysis a file fills. */
export const INTERREG_DOC_KINDS = ['call', 'project'] as const;
export type InterregDocKind = (typeof INTERREG_DOC_KINDS)[number];

/** Accepted file extensions → stored format. The bytes are checked too, never the name alone. */
export const INTERREG_EXTENSIONS = {
  pdf: 'PDF',
  docx: 'DOCX',
  md: 'MD',
  markdown: 'MD',
  txt: 'TXT',
} as const;
export type InterregDocFormat = (typeof INTERREG_EXTENSIONS)[keyof typeof INTERREG_EXTENSIONS];

export const INTERREG_UPLOAD_LIMITS = {
  /** Same cap as the shared-corpus PDF upload; a call guide or project file is a few MB. */
  maxFileBytes: RAG_UPLOAD_LIMITS.maxFileBytes,
  /** PDF page cap is the extractor's own (`RAG_UPLOAD_LIMITS.maxPages`). */
  maxPages: RAG_UPLOAD_LIMITS.maxPages,
  /**
   * Extracted characters per document. An 80-page application is ~250 000
   * characters; 400 000 leaves room without letting one upload fill the F2
   * context window (~100 000 tokens at 4 characters a token).
   */
  maxChars: 400_000,
  maxFileNameLength: 255,
  /** Multipart framing and the `kind` field on top of the file: the body is cut past maxFileBytes + this. */
  maxFormOverheadBytes: 64 * 1024,
  /**
   * DOCX: a zip; `word/document.xml` may inflate to this much, whatever it claims.
   * Word's markup is ~10–30 bytes per character of text, so 20 MB covers the
   * 400 000-character cap; it was 50 MB, which let 118 KB inflate into a 49 MB
   * parse (se-fb B3).
   */
  maxDocxXmlBytes: 20 * 1024 * 1024,
  maxDocxEntries: 2_000,
  /**
   * DOCX: tables inside tables, and paragraphs inside paragraphs (a text box in a
   * run), deeper than this are refused as `malformed`. Real documents stay at 2–3;
   * without a cap ~2.6 M nested tables in 118 KB held 564 MB (se-fb B3).
   */
  maxDocxNesting: 10,
  /**
   * DOCX: wall-clock for one read, which runs in its own thread (FO-195 Ö1). The
   * 400 000-character cap parses in well under a second; a flat hostile file under
   * the XML cap held the event loop 0.3–5 s (se-fb), now it only holds the thread,
   * which is ended here and refused as `parse_too_heavy`.
   */
  maxDocxParseMs: 5_000,
  /** DOCX: V8 heap of the reading thread; past it the thread dies, not the server. */
  maxDocxHeapMb: 256,
  /** Days the extracted text is kept after the last upload (FO-185 decision 3). */
  textRetentionDays: 30,
} as const;

/**
 * The arguments of the limit-bearing messages (`too_large` {maxMb}, `too_long`
 * {maxChars}, crw2 Ö4): the numbers come from the limits above, never from the
 * message text. Pass to every `t(`errors.${code}`, …)`; unused arguments are ignored.
 */
export const INTERREG_ERROR_ARGS = {
  maxMb: INTERREG_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024),
  maxChars: INTERREG_UPLOAD_LIMITS.maxChars,
} as const;

/**
 * Error codes the M17 API answers with, as `{ error: code }`. The UI translates
 * each one under `InterregReview.errors.<code>` (messages/{tr,en}.json).
 */
export const INTERREG_API_ERRORS = [
  'unauthorized',
  'module_unavailable',
  'forbidden_role',
  'pilot_expired',
  'not_found',
  'bad_form',
  'no_file',
  'bad_kind',
  'bad_file_name',
  'too_large',
  'unsupported_type',
  'type_mismatch',
  'bad_encoding',
  'malformed',
  'no_text',
  'too_long',
  'too_many_pages',
  'parse_too_heavy',
  'analysis_busy',
  'bad_rubric',
  'rubric_unavailable',
  'upload_failed',
] as const;
export type InterregApiError = (typeof INTERREG_API_ERRORS)[number];

/** The format a file name's extension claims, or `null` for anything not accepted. */
export function formatFromFileName(name: string): InterregDocFormat | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(INTERREG_EXTENSIONS, ext)
    ? INTERREG_EXTENSIONS[ext as keyof typeof INTERREG_EXTENSIONS]
    : null;
}
