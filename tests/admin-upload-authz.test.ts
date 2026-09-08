import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTSXG31NGW48D — "the document upload route has no authorization check".
 *
 * `POST /api/admin/documents/upload` calls `processPdfAndStore(buffer, null, …)`.
 * `tenantId: null` is the *shared* corpus: `retrieveChunks`/`semanticSearch`
 * mix those chunks into every tenant's RAG context, and the embedding calls are
 * billed to the platform. The route carried a `KNOWN GAP` comment instead of a
 * check, and the repo has no `middleware.ts`, so an anonymous POST reached the
 * handler directly — RAG context poisoning plus someone else's OpenAI bill.
 *
 * What is pinned here is not only the status code. A refusal must also spend
 * nothing: `processPdfAndStore` must not be called at all on 401/403, because
 * a gate that runs *after* the body is parsed still pays for the embedding.
 */

const { authMock, processPdfAndStoreMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  processPdfAndStoreMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/ai/rag', () => ({ processPdfAndStore: processPdfAndStoreMock }));

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
function uploadRequest(): Request {
  const body = new FormData();
  body.set('file', new File([Buffer.from('%PDF-1.4 fake')], 'probe.pdf', { type: 'application/pdf' }));
  body.set('kind', 'test');
  body.set('title', 'authz-probe');
  return new Request('http://localhost:3000/api/admin/documents/upload', {
    method: 'POST',
    body,
  });
}

beforeEach(() => {
  authMock.mockReset();
  processPdfAndStoreMock.mockReset().mockResolvedValue({ doc: { id: 'doc-1' }, storedChunks: 3 });
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
    expect(kind).toBe('test');
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
