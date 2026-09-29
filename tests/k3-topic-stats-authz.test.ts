import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * TASK-MULQKV3BJT6VM — both K3 routes are platform-admin only. `TopicStat` is shared by every
 * tenant (the G0 base-rate rule reads it) and the rescore writes into every tenant's
 * opportunities. A refusal must also do nothing: the importer and the rescore are not reached.
 */

const { authMock, planMock, applyMock, rescoreMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  planMock: vi.fn(),
  applyMock: vi.fn(),
  rescoreMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/k3-topic-stats/importer', async (orig) => ({
  ...(await orig<typeof import('@/lib/k3-topic-stats/importer')>()),
  planTopicStatImport: planMock,
  applyTopicStatImport: applyMock,
  rescoreG0ForPrefixes: rescoreMock,
}));

const importRoute = await import('@/app/api/admin/topic-stats/import/route');
const rescoreRoute = await import('@/app/api/admin/topic-stats/rescore/route');

const MEMBER = { user: { id: 'u-member' }, tenantId: 't-1', role: 'TENANT_OWNER', isPlatformAdmin: false };
const ADMIN = { user: { id: 'u-admin' }, tenantId: 't-1', role: 'TENANT_OWNER', isPlatformAdmin: true };

function importRequest(mode = 'preview') {
  const body = new FormData();
  body.set('file', new File([Buffer.from('PK\u0003\u0004')], 'dash.xlsx'));
  body.set('dataDate', '2026-09-01');
  body.set('mode', mode);
  return new Request('http://localhost:3000/api/admin/topic-stats/import', { method: 'POST', body });
}

function rescoreRequest(prefixes: unknown = ['HORIZON-CL5-2026-09-D4']) {
  return new Request('http://localhost:3000/api/admin/topic-stats/rescore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes }),
  });
}

beforeEach(() => {
  authMock.mockReset();
  planMock.mockReset();
  applyMock.mockReset();
  rescoreMock.mockReset();
});

describe('POST /api/admin/topic-stats/import', () => {
  test('401 for an anonymous caller, parses nothing', async () => {
    authMock.mockResolvedValue(null);
    const res = await importRoute.POST(importRequest() as never);
    expect(res.status).toBe(401);
    expect(planMock).not.toHaveBeenCalled();
  });

  test('403 for a signed-in tenant owner who is not platform staff, parses and writes nothing', async () => {
    authMock.mockResolvedValue(MEMBER);
    for (const mode of ['preview', 'apply']) {
      const res = await importRoute.POST(importRequest(mode) as never);
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ code: 'PLATFORM_ADMIN_REQUIRED' });
    }
    expect(planMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  test('a platform admin reaches the importer', async () => {
    authMock.mockResolvedValue(ADMIN);
    planMock.mockResolvedValue({
      parse: { sheetName: 'S', headerRowNumber: 1, mapping: {}, rejected: [], blankRows: 0, rateScale: 'n/a' },
      source: 'horizon-dashboard|dash.xlsx|2026-09-01',
      planned: [],
      unmatched: [],
      counts: { insert: 0, update: 0, unchanged: 0, unmatched: 0, rejected: 0, blank: 0 },
    });
    const res = await importRoute.POST(importRequest() as never);
    expect(res.status).toBe(200);
    expect(planMock).toHaveBeenCalledOnce();
  });

  test('apply refuses a file whose hash differs from the previewed one (409)', async () => {
    authMock.mockResolvedValue(ADMIN);
    const req = importRequest('apply');
    const res = await importRoute.POST(req as never);
    expect(res.status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  test('a malformed data date is refused before parsing', async () => {
    authMock.mockResolvedValue(ADMIN);
    const body = new FormData();
    body.set('file', new File([Buffer.from('PK')], 'dash.xlsx'));
    body.set('dataDate', '2026-13-45');
    const res = await importRoute.POST(
      new Request('http://localhost:3000/api/admin/topic-stats/import', { method: 'POST', body }) as never,
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'bad_date' });
    expect(planMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/topic-stats/rescore', () => {
  test('401 anonymous / 403 non-admin, rescores nothing', async () => {
    authMock.mockResolvedValue(null);
    expect((await rescoreRoute.POST(rescoreRequest() as never)).status).toBe(401);
    authMock.mockResolvedValue(MEMBER);
    expect((await rescoreRoute.POST(rescoreRequest() as never)).status).toBe(403);
    expect(rescoreMock).not.toHaveBeenCalled();
  });

  test('rejects prefixes that are not topic codes', async () => {
    authMock.mockResolvedValue(ADMIN);
    for (const bad of [[], ['x'], ["HORIZON'; --"], [42], 'HORIZON-CL5']) {
      expect((await rescoreRoute.POST(rescoreRequest(bad) as never)).status).toBe(400);
    }
    expect(rescoreMock).not.toHaveBeenCalled();
  });

  test('a platform admin reaches the rescore', async () => {
    authMock.mockResolvedValue(ADMIN);
    rescoreMock.mockResolvedValue({ opportunities: 1, scored: 1, unscorable: 0, failed: 0, truncated: false });
    const res = await rescoreRoute.POST(rescoreRequest() as never);
    expect(res.status).toBe(200);
    expect(rescoreMock).toHaveBeenCalledWith(['HORIZON-CL5-2026-09-D4']);
  });
});
