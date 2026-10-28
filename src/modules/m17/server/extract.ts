/**
 * Uploaded file → text, for the M17 call guide and project file (FO-186).
 *
 * The extension picks the reader and the bytes must agree with it (a renamed
 * file is `type_mismatch`, never parsed as something it is not). PDF goes through
 * the shared worker-thread extractor (src/lib/rag-pdf-extract.ts) with its own
 * page/heap/time limits; DOCX through ./docx-text.ts; MD/TXT is strict UTF-8.
 * Nothing here writes the bytes anywhere: the caller drops the buffer after this.
 */
import { extractPdfText, PdfLimitError } from '@/lib/rag-pdf-extract';
import { hasMeaningfulText, hasPdfSignature } from '@/lib/rag-upload';

import { formatFromFileName, INTERREG_UPLOAD_LIMITS, type InterregApiError, type InterregDocFormat } from '../limits';
import { DocxReadError, hasZipSignature, readDocxText } from './docx-text';

export class InterregExtractError extends Error {
  constructor(readonly code: InterregApiError) {
    super(code);
    this.name = 'InterregExtractError';
  }
}

export interface ExtractedDocument {
  format: InterregDocFormat;
  text: string;
  /** PDF page count; `null` for formats without pages. */
  pages: number | null;
  chars: number;
}

export interface ExtractOptions {
  /** Override for tests; defaults to {@link INTERREG_UPLOAD_LIMITS.maxChars}. */
  maxChars?: number;
}

/**
 * Collapse runs of blank lines and trailing spaces; the readers' line structure is kept.
 * Also what Postgres `text` or a JSON encoder would choke on (se-fb D2): a DOCX can
 * carry `&#0;` and a PDF a NUL in its text layer — dropped; a lone UTF-16 surrogate
 * (`&#xD800;`) — U+FFFD. Exported for the unit tests.
 */
export function tidy(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeUtf8(bytes: Buffer): string {
  if (hasPdfSignature(bytes) || hasZipSignature(bytes)) throw new InterregExtractError('type_mismatch');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InterregExtractError('bad_encoding');
  }
  if (text.includes('\u0000')) throw new InterregExtractError('bad_encoding');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const PDF_LIMIT_CODE: Record<PdfLimitError['code'], InterregApiError> = {
  too_many_pages: 'too_many_pages',
  too_many_chunks: 'too_long',
  over_budget: 'too_long',
  parse_too_heavy: 'parse_too_heavy',
};

/**
 * Text of one uploaded document. Throws {@link InterregExtractError} with the
 * API error code for every refusal; any other throw is an internal failure.
 */
export async function extractInterregDocument(
  fileName: string,
  bytes: Buffer,
  options: ExtractOptions = {},
): Promise<ExtractedDocument> {
  const maxChars = options.maxChars ?? INTERREG_UPLOAD_LIMITS.maxChars;
  const format = formatFromFileName(fileName);
  if (!format) throw new InterregExtractError('unsupported_type');
  if (bytes.length > INTERREG_UPLOAD_LIMITS.maxFileBytes) throw new InterregExtractError('too_large');

  let raw: string;
  let pages: number | null = null;
  switch (format) {
    case 'PDF': {
      if (!hasPdfSignature(bytes)) throw new InterregExtractError('type_mismatch');
      try {
        const pdf = await extractPdfText(bytes, maxChars);
        raw = pdf.text;
        pages = pdf.pages;
      } catch (err) {
        if (err instanceof PdfLimitError) throw new InterregExtractError(PDF_LIMIT_CODE[err.code]);
        throw new InterregExtractError('malformed');
      }
      break;
    }
    case 'DOCX': {
      if (!hasZipSignature(bytes)) throw new InterregExtractError('type_mismatch');
      try {
        raw = await readDocxText(bytes, {
          maxXmlBytes: INTERREG_UPLOAD_LIMITS.maxDocxXmlBytes,
          maxEntries: INTERREG_UPLOAD_LIMITS.maxDocxEntries,
          maxChars,
          maxNesting: INTERREG_UPLOAD_LIMITS.maxDocxNesting,
        });
      } catch (err) {
        if (err instanceof DocxReadError) {
          throw new InterregExtractError(err.code === 'not_docx' ? 'type_mismatch' : err.code);
        }
        throw err;
      }
      break;
    }
    case 'MD':
    case 'TXT':
      raw = decodeUtf8(bytes);
      break;
  }

  const text = tidy(raw);
  if (text.length > maxChars) throw new InterregExtractError('too_long');
  if (!hasMeaningfulText(text, pages ?? 1)) throw new InterregExtractError('no_text');
  return { format, text, pages, chars: text.length };
}
