/**
 * FO-160 — who may read /api/cordis/*. The helper is the /api/v1 policy reached
 * two ways: an API key through authenticateApiKey (not re-implemented here), or a
 * signed-in member whose plan opens M1 in full, counted per user. Each collaborator
 * is replaced so the branch under test is the only one that runs.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticateApiKey: vi.fn(),
  requireTenantApi: vi.fn(),
  checkModuleAccess: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ authenticateApiKey: mocks.authenticateApiKey }));
vi.mock('@/lib/tenant', () => ({ requireTenantApi: mocks.requireTenantApi }));
vi.mock('@/lib/modules/access', () => ({ checkModuleAccess: mocks.checkModuleAccess }));
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.loggerError } }));

import { authenticateCordisRequest, CORDIS_SESSION_PER_USER_PER_MINUTE } from '@/lib/cordis-api-auth';

const req = (headers: Record<string, string> = {}) => new Request('http://localhost/api/cordis/projects', { headers });

// NG-250: the session door hands the member to the NexaGrant plan gate; an API key does not (line 46).
const SESSION_OK = { authenticated: true, session: { tenantId: 't1', role: 'MEMBER' } };
const signedIn = (userId: string) => ({ ok: true, scope: { userId, tenantId: 't1', role: 'MEMBER', isPlatformAdmin: false } });
const refusedNoSession = () => ({
  ok: false,
  response: NextResponse.json({ error: 'Unauthorized', code: 'TENANT_SCOPE_REQUIRED' }, { status: 401 }),
});
const fullM1 = { allowed: true, status: 'ON' };

beforeEach(() => {
  mocks.authenticateApiKey.mockReset();
  mocks.requireTenantApi.mockReset();
  mocks.checkModuleAccess.mockReset();
  mocks.loggerError.mockReset();
});

describe('API key', () => {
  test('a key is handed to authenticateApiKey, and the session is not consulted', async () => {
    mocks.authenticateApiKey.mockResolvedValue({ authenticated: true, data: { tenantId: 't1', apiKeyId: 'k', name: 'pro' } });

    const res = await authenticateCordisRequest(req({ 'x-api-key': 'fp_live_x' }));

    expect(res).toEqual({ authenticated: true });
    expect(mocks.authenticateApiKey).toHaveBeenCalledOnce();
    expect(mocks.requireTenantApi).not.toHaveBeenCalled();
  });

  test('a refused key returns authenticateApiKey\'s own response (403 limited plan, 429 over the key limit)', async () => {
    const limited = NextResponse.json({ error: 'MODULE_ACCESS_DENIED', module: 'M1' }, { status: 403 });
    mocks.authenticateApiKey.mockResolvedValue({ authenticated: false, errorResponse: limited });

    const res = await authenticateCordisRequest(req({ authorization: 'Bearer fp_live_x' }));

    expect(res.authenticated).toBe(false);
    if (!res.authenticated) expect(res.errorResponse).toBe(limited);
  });

  test('a wrong key with a valid session is still refused: an Authorization header never falls through', async () => {
    mocks.authenticateApiKey.mockResolvedValue({
      authenticated: false,
      errorResponse: NextResponse.json({ code: 'AUTH_INVALID_API_KEY' }, { status: 401 }),
    });

    const res = await authenticateCordisRequest(req({ authorization: 'Basic abc' }));

    expect(res.authenticated).toBe(false);
    if (!res.authenticated) expect(res.errorResponse.status).toBe(401);
    expect(mocks.requireTenantApi).not.toHaveBeenCalled();
  });
});

describe('signed-in member', () => {
  test('no session: 401 from requireTenantApi, and M1 is not checked', async () => {
    mocks.requireTenantApi.mockResolvedValue(refusedNoSession());

    const res = await authenticateCordisRequest(req());

    expect(res.authenticated).toBe(false);
    if (!res.authenticated) expect(res.errorResponse.status).toBe(401);
    expect(mocks.checkModuleAccess).not.toHaveBeenCalled();
  });

  test('M1 refused for the viewer (plan without M1, or M1 off): 403 with the module code', async () => {
    mocks.requireTenantApi.mockResolvedValue(signedIn('u-denied'));
    mocks.checkModuleAccess.mockResolvedValue({ allowed: false, status: 'ON', reason: 'PLAN_UPGRADE_REQUIRED' });

    const res = await authenticateCordisRequest(req());

    expect(mocks.checkModuleAccess).toHaveBeenCalledWith('M1');
    expect(res.authenticated).toBe(false);
    if (!res.authenticated) {
      expect(res.errorResponse.status).toBe(403);
      expect(await res.errorResponse.json()).toEqual({ error: 'MODULE_ACCESS_DENIED', module: 'M1' });
    }
  });

  test('M1 only in limited form (Discover, Basic, TTO Edition): 403, the same answer a limited key gets', async () => {
    mocks.requireTenantApi.mockResolvedValue(signedIn('u-limited'));
    mocks.checkModuleAccess.mockResolvedValue({ ...fullM1, limits: { partnerSearchPerMonth: 10 } });

    const res = await authenticateCordisRequest(req());

    expect(res.authenticated).toBe(false);
    if (!res.authenticated) expect(res.errorResponse.status).toBe(403);
  });

  test('M1 in full: authenticated', async () => {
    mocks.requireTenantApi.mockResolvedValue(signedIn('u-pro'));
    mocks.checkModuleAccess.mockResolvedValue(fullM1);

    expect(await authenticateCordisRequest(req())).toEqual(SESSION_OK);
  });

  test(`past ${CORDIS_SESSION_PER_USER_PER_MINUTE} requests a minute: 429 with Retry-After, and it is per user`, async () => {
    mocks.checkModuleAccess.mockResolvedValue(fullM1);
    mocks.requireTenantApi.mockResolvedValue(signedIn('u-loop'));
    for (let i = 0; i < CORDIS_SESSION_PER_USER_PER_MINUTE; i++) {
      expect(await authenticateCordisRequest(req())).toEqual(SESSION_OK);
    }

    const res = await authenticateCordisRequest(req());
    expect(res.authenticated).toBe(false);
    if (!res.authenticated) {
      expect(res.errorResponse.status).toBe(429);
      expect(Number(res.errorResponse.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
      expect(await res.errorResponse.json()).toEqual({ success: false, error: 'rate_limited' });
    }

    mocks.requireTenantApi.mockResolvedValue(signedIn('u-other'));
    expect(await authenticateCordisRequest(req())).toEqual(SESSION_OK);
  });

  test('a failing module read is a fixed 500 body; the cause goes to the log, not the response', async () => {
    mocks.requireTenantApi.mockResolvedValue(signedIn('u-err'));
    mocks.checkModuleAccess.mockRejectedValue(new Error('connection to db refused on 5433'));

    const res = await authenticateCordisRequest(req());

    expect(res.authenticated).toBe(false);
    if (!res.authenticated) {
      expect(res.errorResponse.status).toBe(500);
      const text = await res.errorResponse.text();
      expect(JSON.parse(text)).toEqual({ success: false, error: 'internal_error' });
      expect(text).not.toMatch(/5433|connection/);
    }
    expect(mocks.loggerError).toHaveBeenCalledOnce();
  });
});
