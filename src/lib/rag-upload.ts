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
} as const;

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
