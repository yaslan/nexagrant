import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { internalError } from '@/lib/api-error';
import { readCappedBytes } from '@/lib/read-capped';
import { UserWindowLimiter } from '@/lib/user-rate-limit';
import { isPresentId } from '@/lib/required-id';
import { INTERREG_DOC_KINDS, INTERREG_UPLOAD_LIMITS } from '@/modules/m17/limits';
import { getAnalysis, saveDocument } from '@/modules/m17/server/analyses';
import { extractInterregDocument, InterregExtractError } from '@/modules/m17/server/extract';
import { gateInterreg, refuse } from '@/modules/m17/server/gate';
import { acceptsUpload } from '@/modules/m17/server/status';

/**
 * Upload the call guide (`kind=call`) or the project file (`kind=project`) of an
 * M17 analysis (FO-186). multipart/form-data: `kind`, `file` (.pdf, .docx, .md,
 * .markdown or .txt, ≤ INTERREG_UPLOAD_LIMITS.maxFileBytes).
 *
 * The file is read into memory, turned into text and dropped: the bytes are
 * never written to disk, object storage or the database — only the extracted
 * text is, in the caller's tenant, for 30 days from this upload (the slot's
 * `expiresAt`; the nightly m17-text-retention job purges it, per slot). A second
 * upload of the same kind replaces the first and clears any earlier F2 result.
 *
 *   200 `{ analysis: InterregAnalysisView }` — status CALL_READY / READY / UPLOADING
 *   400 bad_form | no_file | bad_kind | bad_file_name
 *   404 not_found · 409 analysis_busy (an F2 run is reading the texts)
 *   413 too_large | too_long | too_many_pages | parse_too_heavy
 *   415 unsupported_type | type_mismatch
 *   422 bad_encoding | malformed | no_text (fewer than 200 letters/digits, or a scan)
 *   429 rate_limited (more than INTERREG_UPLOAD_LIMITS.uploadsPerMinute a minute; `Retry-After`)
 */
const FormSchema = z.object({
  kind: z.enum(INTERREG_DOC_KINDS),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(INTERREG_UPLOAD_LIMITS.maxFileNameLength)
    // A display name, never a path: no separators, no control characters.
    .refine((name) => !/[\\/\u0000-\u001f\u007f]/u.test(name)),
});

/** Per user and process; see INTERREG_UPLOAD_LIMITS.uploadsPerMinute. */
const uploadLimiter = new UserWindowLimiter(INTERREG_UPLOAD_LIMITS.uploadsPerMinute);

const STATUS_OF: Record<string, 400 | 413 | 415 | 422> = {
  too_large: 413,
  too_long: 413,
  too_many_pages: 413,
  parse_too_heavy: 413,
  unsupported_type: 415,
  type_mismatch: 415,
  bad_encoding: 422,
  malformed: 422,
  no_text: 422,
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Gates first: a refused request must not read or parse a byte of the body.
  const gate = await gateInterreg('write');
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isPresentId(id)) return refuse('not_found', 404);
  // Before anything is read or parsed: a refused request costs neither.
  const retryAfter = uploadLimiter.take(gate.scope.userId);
  if (retryAfter !== null) {
    const res = refuse('rate_limited', 429, { retryAfter });
    res.headers.set('Retry-After', String(retryAfter));
    return res;
  }
  // Before the body is parsed, so an unknown or busy analysis costs no extraction.
  // saveDocument checks both again under the write, which is the one that counts.
  const current = await getAnalysis(gate.scope, id);
  if (!current) return refuse('not_found', 404);
  if (!acceptsUpload(current.status)) return refuse('analysis_busy', 409);

  // The declared length is only a shortcut for an honest client. A chunked body
  // has none and a lying one can say anything, so the body itself is counted as
  // it arrives and cut at the first byte past the cap (se-fb B2), before
  // formData() would buffer all of it.
  const tooLarge = () => refuse('too_large', 413, { maxBytes: INTERREG_UPLOAD_LIMITS.maxFileBytes });
  const bodyCap = INTERREG_UPLOAD_LIMITS.maxFileBytes + INTERREG_UPLOAD_LIMITS.maxFormOverheadBytes;
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > bodyCap) return tooLarge();
  const body = await readCappedBytes(req.body, bodyCap);
  if (body === null) return tooLarge();

  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { 'content-type': req.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    return refuse('bad_form', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return refuse('no_file', 400);
  if (file.size > INTERREG_UPLOAD_LIMITS.maxFileBytes) return tooLarge();
  const kind = form.get('kind');
  if (typeof kind !== 'string' || !(INTERREG_DOC_KINDS as readonly string[]).includes(kind)) {
    return refuse('bad_kind', 400);
  }
  const parsed = FormSchema.safeParse({ kind, fileName: file.name });
  if (!parsed.success) return refuse('bad_file_name', 400);

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const doc = await extractInterregDocument(parsed.data.fileName, bytes);
    const saved = await saveDocument(gate.scope, id, parsed.data.kind, parsed.data.fileName, doc);
    if (!saved.ok) return refuse(saved.error, saved.error === 'not_found' ? 404 : 409);
    return NextResponse.json({ analysis: saved.analysis });
  } catch (error) {
    if (error instanceof InterregExtractError) {
      return refuse(error.code, STATUS_OF[error.code] ?? 422);
    }
    // No file name or content in the log: it is a user's document.
    console.error('[interreg-review][POST document]', error instanceof Error ? error.name : 'unknown');
    return internalError({ error: 'upload_failed' });
  }
}
