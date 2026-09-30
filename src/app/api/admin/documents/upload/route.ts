import { NextRequest, NextResponse } from 'next/server';
import { findSharedDocumentByTitle, NoExtractableTextError, PdfLimitError, processPdfAndStore } from '@/lib/rag';
import {
  hasPdfSignature,
  isRagUploadKind,
  RAG_UPLOAD_LIMITS,
  type RagUploadError,
} from '@/lib/rag-upload';
import { errorMessage } from '@/lib/errors';
import { requirePlatformAdminApi } from '@/lib/tenant';

function refuse(error: RagUploadError, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * multipart/form-data: `file` (a PDF, ≤ RAG_UPLOAD_LIMITS.maxFileBytes), `kind`
 * (one of RAG_UPLOAD_KINDS), `title` (1..maxTitleLength after trimming), and
 * optionally `allowDuplicate=true` to store a document whose kind and title the
 * shared corpus already holds. Every refusal is `{ error: RagUploadError }`
 * and happens before the first embedding call — including the ones only the
 * parsed PDF can decide: over `maxPages`, `maxChunks` or `maxEmbeddingUsd`
 * (413) and no readable text (422).
 *
 * The PDF is parsed in a `worker_threads` Worker with a deadline, a heap
 * ceiling and a ceiling on inflated stream bytes (src/lib/rag-pdf-extract.ts,
 * İNCELEME-52 B-1'), so no PDF holds this server's event loop; a PDF over
 * one of them is `parse_too_heavy` (413). The embedding calls still run inside
 * this request rather than in a graphile-worker job (ADR-0008): a job needs the
 * PDF bytes stored somewhere the worker can read and a status the page can
 * poll, and the worker's hosting is still open (ADR-0008 §4).
 */
export async function POST(req: NextRequest) {
  try {
    // This route stores the document with `tenantId: null` — the shared corpus
    // that `retrieveChunks` mixes into *every* tenant's RAG
    // context, embedded at the platform's expense. So it is platform staff
    // only, and the gate runs before the body is read: a rejected request must
    // not parse a PDF or spend an embedding call.
    const gate = await requirePlatformAdminApi();
    if (!gate.ok) return gate.response;

    // Refuse an oversized body before buffering it, when the client declared its size.
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > RAG_UPLOAD_LIMITS.maxFileBytes + 64 * 1024) {
      return refuse('too_large', 413, { maxBytes: RAG_UPLOAD_LIMITS.maxFileBytes });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return refuse('bad_form', 400);
    }
    const file = formData.get('file');
    const kind = formData.get('kind');
    const title = String(formData.get('title') ?? '').trim();
    const allowDuplicate = formData.get('allowDuplicate') === 'true';

    if (!(file instanceof File) || file.size === 0) {
      return refuse('no_file', 400);
    }
    if (file.size > RAG_UPLOAD_LIMITS.maxFileBytes) {
      return refuse('too_large', 413, { maxBytes: RAG_UPLOAD_LIMITS.maxFileBytes });
    }
    if (!isRagUploadKind(kind)) {
      return refuse('bad_kind', 400);
    }
    if (title.length === 0 || title.length > RAG_UPLOAD_LIMITS.maxTitleLength) {
      return refuse('bad_title', 400, { maxLength: RAG_UPLOAD_LIMITS.maxTitleLength });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // The bytes decide, not the declared type or the file name: both are the client's to set.
    if (!hasPdfSignature(buffer)) {
      return refuse('not_pdf', 415);
    }

    // A re-upload of the same document embeds every chunk again and doubles its
    // weight in retrieval. The admin is told first and has to say so to proceed.
    if (!allowDuplicate) {
      const existing = await findSharedDocumentByTitle(kind, title);
      if (existing) {
        return refuse('duplicate', 409, {
          existing: { id: existing.id, chunks: existing.chunks, createdAt: existing.createdAt.toISOString() },
        });
      }
    }

    // Tenant ID is null for shared platform documents. The embedding calls are
    // logged against PLATFORM_SCOPE_TENANT_ID; see `embedText` in src/lib/llm.ts.
    // The actor is the admin the gate just identified — never absent now.
    const { doc, storedChunks } = await processPdfAndStore(buffer, null, kind, title, undefined, {
      userId: gate.userId,
    });

    // `chunks` is what Postgres confirmed it stored, not what was attempted.
    // `success: true` used to be returned no matter how much of the document
    // reached the corpus (TASK-MTSYCMWFL22CA); a document with no retrievable
    // chunk behind it now fails the request instead of being reported as an
    // upload that worked.
    return NextResponse.json({ success: true, docId: doc.id, chunks: storedChunks });
  } catch (error) {
    if (error instanceof NoExtractableTextError) {
      return refuse('no_text', 422);
    }
    // Too many pages, too many chunks, over the embedding budget or too heavy to parse: refused
    // before the first embedding call and before any row was written.
    if (error instanceof PdfLimitError) {
      return refuse(error.code, 413, error.detail);
    }
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'upload_failed' satisfies RagUploadError, message: errorMessage(error) }, { status: 500 });
  }
}
