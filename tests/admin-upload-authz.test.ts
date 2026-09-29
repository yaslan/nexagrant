import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTSXG31NGW48D — "the document upload route has no authorization check".
 *
 * `POST /api/admin/documents/upload` calls `processPdfAndStore(buffer, null, …)`.
 * `tenantId: null` is the *shared* corpus: `retrieveChunks`
 * mixes those chunks into every tenant's RAG context, and the embedding calls are
 * billed to the platform. The route carried a `KNOWN GAP` comment instead of a
 * check, and the repo has no `middleware.ts`, so an anonymous POST reached the
 * handler directly — RAG context poisoning plus someone else's OpenAI bill.
 *
 * What is pinned here is not only the status code. A refusal must also spend
 * nothing: `processPdfAndStore` must not be called at all on 401/403, because
 * a gate that runs *after* the body is parsed still pays for the embedding.
 */

const { authMock, processPdfAndStoreMock, findSharedDocumentByTitleMock, NoTextError, LimitError } = vi.hoisted(() => ({
  authMock: vi.fn(),
  processPdfAndStoreMock: vi.fn(),
  findSharedDocumentByTitleMock: vi.fn(),
  NoTextError: class NoExtractableTextError extends Error {},
  // Same shape as `PdfLimitError` in src/lib/rag.ts.
  LimitError: class PdfLimitError extends Error {
    constructor(
      readonly code: string,
      readonly detail: Record<string, number>
    ) {
      super(code);
    }
  },
}));

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/rag', () => ({
  processPdfAndStore: processPdfAndStoreMock,
  findSharedDocumentByTitle: findSharedDocumentByTitleMock,
  NoExtractableTextError: NoTextError,
  PdfLimitError: LimitError,
}));

const { POST } = await import('@/app/api/admin/documents/upload/route');
const { requirePlatformAdminApi } = await import('@/lib/tenant');

const ADMIN_SESSION = {
  user: { id: 'user-admin', email: 'admin@yasinaslan.com.tr' },
  tenantId: 'tenant-1',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: true,
};

const MEMBER_SESSION = {
  user: { id: 'user-member', email: 'member@example.com' },
  tenantId: 'tenant-1',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: false,
};

/** A multipart POST exactly as the admin upload form sends one. */
function uploadRequest(
  overrides: { file?: File | null; kind?: string; title?: string; allowDuplicate?: string } = {}
): Request {
  const body = new FormData();
  const file =
    overrides.file === undefined
      ? new File([Buffer.from('%PDF-1.4 fake')], 'probe.pdf', { type: 'application/pdf' })
      : overrides.file;
  if (file) body.set('file', file);
  body.set('kind', overrides.kind ?? 'work_programme');
  body.set('title', overrides.title ?? 'authz-probe');
  if (overrides.allowDuplicate) body.set('allowDuplicate', overrides.allowDuplicate);
  return new Request('http://localhost:3000/api/admin/documents/upload', {
    method: 'POST',
    body,
  });
}

beforeEach(() => {
  authMock.mockReset();
  processPdfAndStoreMock.mockReset().mockResolvedValue({ doc: { id: 'doc-1' }, storedChunks: 3 });
  findSharedDocumentByTitleMock.mockReset().mockResolvedValue(null);
});

describe('POST /api/admin/documents/upload', () => {
  test('refuses an anonymous upload with 401 and embeds nothing', async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(uploadRequest() as never);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(processPdfAndStoreMock).not.toHaveBeenCalled();
  });

  test('refuses a signed-in non-admin with 403 and embeds nothing', async () => {
    authMock.mockResolvedValue(MEMBER_SESSION);

    const res = await POST(uploadRequest() as never);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(processPdfAndStoreMock).not.toHaveBeenCalled();
  });

  test('lets a platform admin ingest into the shared corpus', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);

    const res = await POST(uploadRequest() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, docId: 'doc-1', chunks: 3 });
    expect(processPdfAndStoreMock).toHaveBeenCalledTimes(1);

    const [buffer, tenantId, kind, title, sourceUrl, actor] = processPdfAndStoreMock.mock.calls[0]!;
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(tenantId).toBeNull();
    expect(kind).toBe('work_programme');
    expect(title).toBe('authz-probe');
    expect(sourceUrl).toBeUndefined();
    // Attribution is no longer best-effort: the gate identified the actor.
    expect(actor).toEqual({ userId: 'user-admin' });
  });

  test('fails closed when the session lookup itself throws', async () => {
    authMock.mockRejectedValue(new Error('auth backend down'));

    const res = await POST(uploadRequest() as never);

    expect(res.status).toBe(500);
    expect(processPdfAndStoreMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/documents/upload — input validation (TASK-MULQL8QB679LQ)', () => {
  beforeEach(() => authMock.mockResolvedValue(ADMIN_SESSION));

  async function expectRefused(req: Request, status: number, error: string) {
    const res = await POST(req as never);
    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ error });
    expect(processPdfAndStoreMock).not.toHaveBeenCalled();
  }

  test('no file → 400 no_file', () => expectRefused(uploadRequest({ file: null }), 400, 'no_file'));

  test('a kind outside the allowlist → 400 bad_kind', async () => {
    await expectRefused(uploadRequest({ kind: 'tenant_upload' }), 400, 'bad_kind');
    await expectRefused(uploadRequest({ kind: '' }), 400, 'bad_kind');
  });

  test('empty or over-long title → 400 bad_title', async () => {
    await expectRefused(uploadRequest({ title: '   ' }), 400, 'bad_title');
    await expectRefused(uploadRequest({ title: 'x'.repeat(201) }), 400, 'bad_title');
  });

  test('a non-PDF body → 415 not_pdf, even when it claims application/pdf', () =>
    expectRefused(
      uploadRequest({ file: new File([Buffer.from('hello')], 'fake.pdf', { type: 'application/pdf' }) }),
      415,
      'not_pdf'
    ));

  test('a file over the size limit → 413 too_large', () =>
    expectRefused(
      uploadRequest({
        file: new File([Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(20 * 1024 * 1024)])], 'big.pdf', {
          type: 'application/pdf',
        }),
      }),
      413,
      'too_large'
    ));

  test('same kind + title already in the shared corpus → 409 duplicate, nothing embedded', async () => {
    findSharedDocumentByTitleMock.mockResolvedValue({
      id: 'doc-old',
      kind: 'work_programme',
      title: 'authz-probe',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      chunks: 7,
    });

    const res = await POST(uploadRequest() as never);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: 'duplicate', existing: { id: 'doc-old', chunks: 7 } });
    expect(findSharedDocumentByTitleMock).toHaveBeenCalledWith('work_programme', 'authz-probe');
    expect(processPdfAndStoreMock).not.toHaveBeenCalled();
  });

  test('allowDuplicate=true stores it anyway without looking the title up', async () => {
    const res = await POST(uploadRequest({ allowDuplicate: 'true' }) as never);

    expect(res.status).toBe(200);
    expect(findSharedDocumentByTitleMock).not.toHaveBeenCalled();
    expect(processPdfAndStoreMock).toHaveBeenCalledTimes(1);
  });

  test('the title is stored trimmed', async () => {
    await POST(uploadRequest({ title: '  WP 2026  ' }) as never);
    expect(processPdfAndStoreMock.mock.calls[0]![3]).toBe('WP 2026');
  });

  test('a PDF with no text layer → 422 no_text, not a generic 500', async () => {
    processPdfAndStoreMock.mockRejectedValue(new NoTextError('no text'));

    const res = await POST(uploadRequest() as never);

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: 'no_text' });
  });

  test('a PDF over the page, chunk or cost limit → 413 with the measured value and the limit', async () => {
    processPdfAndStoreMock.mockRejectedValueOnce(new LimitError('too_many_pages', { pages: 30000, maxPages: 1000 }));
    let res = await POST(uploadRequest() as never);
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ error: 'too_many_pages', pages: 30000, maxPages: 1000 });

    processPdfAndStoreMock.mockRejectedValueOnce(new LimitError('too_many_chunks', { chunks: 2501, maxChunks: 2500 }));
    res = await POST(uploadRequest() as never);
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ error: 'too_many_chunks', maxChunks: 2500 });

    processPdfAndStoreMock.mockRejectedValueOnce(new LimitError('over_budget', { estimatedUsd: 0.3, maxUsd: 0.2 }));
    res = await POST(uploadRequest() as never);
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ error: 'over_budget', maxUsd: 0.2 });
  });

  // İNCELEME-45 Ö-1: the three mutants that stayed green.
  test('the signature is all five bytes: "%PDF" without the dash → 415 not_pdf (M9)', () =>
    expectRefused(
      uploadRequest({ file: new File([Buffer.from('%PDF1.4 x')], 'x.pdf', { type: 'application/pdf' }) }),
      415,
      'not_pdf'
    ));

  test('only allowDuplicate=true overrides the duplicate check, not any value (M7)', async () => {
    findSharedDocumentByTitleMock.mockResolvedValue({
      id: 'doc-old',
      kind: 'work_programme',
      title: 'authz-probe',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      chunks: 7,
    });
    await expectRefused(uploadRequest({ allowDuplicate: 'yes' }), 409, 'duplicate');
    await expectRefused(uploadRequest({ allowDuplicate: '1' }), 409, 'duplicate');
  });

  test('an oversized declared content-length → 413 before the body is read (M10)', async () => {
    const formData = vi.fn();
    const req = {
      headers: new Headers({ 'content-length': String(21 * 1024 * 1024) }),
      formData,
    };

    const res = await POST(req as never);

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ error: 'too_large' });
    expect(formData).not.toHaveBeenCalled();
  });

  test('an ingest failure → 500 upload_failed', async () => {
    processPdfAndStoreMock.mockRejectedValue(new Error('provider down'));

    const res = await POST(uploadRequest() as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'upload_failed' });
  });
});

describe('requirePlatformAdminApi', () => {
  test('separates "sign in" (401) from "you never may" (403)', async () => {
    authMock.mockResolvedValue(null);
    const anonymous = await requirePlatformAdminApi();
    expect(anonymous.ok).toBe(false);
    expect(anonymous.ok === false && anonymous.response.status).toBe(401);

    authMock.mockResolvedValue(MEMBER_SESSION);
    const member = await requirePlatformAdminApi();
    expect(member.ok).toBe(false);
    expect(member.ok === false && member.response.status).toBe(403);
  });

  test('accepts the SUPER_ADMIN role claim, not just the boolean flag', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-super' }, role: 'SUPER_ADMIN' });

    const result = await requirePlatformAdminApi();

    expect(result).toEqual({ ok: true, userId: 'user-super' });
  });
});
