import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * NG-34 — who reaches the record routes, and what a refusal looks like. The records themselves
 * are tested on a real database in readiness-records.live.test.ts; here they are stubs that say
 * whether they were reached.
 */
const session = vi.hoisted(() => ({
  result: { ok: true, scope: { tenantId: 't1', userId: 'u1', role: 'TENANT_OWNER', workspaceIds: [], isPlatformAdmin: false } } as unknown,
}));
const stubs = vi.hoisted(() => ({
  own: vi.fn(async () => ({ kind: 'self' })),
  seat: vi.fn(async (): Promise<unknown> => null),
  saveOwn: vi.fn(async () => ({ kind: 'self' })),
  saveSeat: vi.fn(async (): Promise<unknown> => null),
  approval: vi.fn(async () => null),
  saveApproval: vi.fn(async (): Promise<unknown> => ({ approved: true })),
  shares: vi.fn(async () => []),
  saveShare: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock('@/lib/tenant', () => ({ requireTenantApi: vi.fn(async () => session.result) }));
vi.mock('@/lib/gates/readiness-records', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gates/readiness-records')>();
  return {
    ...actual,
    getOwnReadiness: stubs.own,
    getSeatReadiness: stubs.seat,
    saveOwnReadiness: stubs.saveOwn,
    saveSeatReadiness: stubs.saveSeat,
    getInternalApproval: stubs.approval,
    saveInternalApproval: stubs.saveApproval,
    listBudgetShares: stubs.shares,
    saveBudgetShare: stubs.saveShare,
  };
});

import { GET as readinessGet, PUT as readinessPut } from '@/app/api/org-readiness/route';
import { GET as approvalGet, PUT as approvalPut } from '@/app/api/opportunities/[id]/internal-approval/route';
import { GET as sharesGet, PUT as sharesPut } from '@/app/api/opportunities/[id]/budget-shares/route';

const asUser = (role: string) => {
  session.result = { ok: true, scope: { tenantId: 't1', userId: 'u1', role, workspaceIds: [], isPlatformAdmin: false } };
};
const put = (url: string, body: unknown) =>
  new Request(`http://local${url}`, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = (url: string) => new Request(`http://local${url}`);
const params = { params: Promise.resolve({ id: 'opp1' }) };

const approvalBody = { approved: true, cofinancingCents: 100, decisionRef: null, decisionAt: null };
const shareBody = { seatId: 's1', minCents: 1, maxCents: 2, agreed: false };

beforeEach(() => {
  vi.clearAllMocks();
  asUser('TENANT_OWNER');
});

describe('who may write', () => {
  const writes: Array<[string, () => Promise<Response>, () => void]> = [
    ['own readiness', () => readinessPut(put('/api/org-readiness', { learReady: true })), () => expect(stubs.saveOwn).not.toHaveBeenCalled()],
    ['a partner\'s readiness', () => readinessPut(put('/api/org-readiness?seatId=s1', { learReady: true })), () => expect(stubs.saveSeat).not.toHaveBeenCalled()],
    ['internal approval', () => approvalPut(put('/api/opportunities/opp1/internal-approval', approvalBody), params), () => expect(stubs.saveApproval).not.toHaveBeenCalled()],
    ['a budget share', () => sharesPut(put('/api/opportunities/opp1/budget-shares', shareBody), params), () => expect(stubs.saveShare).not.toHaveBeenCalled()],
  ];

  for (const [name, call, notReached] of writes) {
    test(`a member is refused ${name} before anything runs`, async () => {
      asUser('MEMBER');
      const res = await call();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden_role' });
      notReached();
    });
  }

  test('only the owner and the admin approve; a pipeline manager does not', async () => {
    asUser('PIPELINE_MANAGER');
    const res = await approvalPut(put('/api/opportunities/opp1/internal-approval', approvalBody), params);
    expect(res.status).toBe(403);
  });

  test("a pipeline manager writes a partner's readiness and budget share, not the tenant's own", async () => {
    asUser('PIPELINE_MANAGER');
    expect((await readinessPut(put('/api/org-readiness', { learReady: true }))).status).toBe(403);
    expect((await readinessPut(put('/api/org-readiness?seatId=s1', { learReady: true }))).status).toBe(404);
    expect(stubs.saveSeat).toHaveBeenCalledOnce();
    expect((await sharesPut(put('/api/opportunities/opp1/budget-shares', shareBody), params)).status).toBe(404);
    expect(stubs.saveShare).toHaveBeenCalledWith(expect.anything(), 's1', expect.anything(), 'opp1');
  });
});

describe('who may read', () => {
  test('a guest partner reads none of it', async () => {
    asUser('GUEST_PARTNER');
    expect((await readinessGet(get('/api/org-readiness'))).status).toBe(403);
    expect((await approvalGet(get('/x'), params)).status).toBe(403);
    expect((await sharesGet(get('/x'), params)).status).toBe(403);
  });

  test('without a session the answer is 401', async () => {
    session.result = { ok: false, response: new Response(null, { status: 401 }) };
    const res = await readinessGet(get('/api/org-readiness'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  test('an ended pilot still reads; its write is refused', async () => {
    session.result = { ok: false, response: new Response(null, { status: 403 }) };
    const res = await readinessPut(put('/api/org-readiness', { learReady: true }));
    expect(await res.json()).toEqual({ error: 'pilot_expired' });
  });

  test('a seat with no record answers 404, the same as one that does not exist', async () => {
    expect((await readinessGet(get('/api/org-readiness?seatId=nope'))).status).toBe(404);
  });
});

describe('what a write accepts', () => {
  test('a body that is not JSON is 400, not 500', async () => {
    const res = await readinessPut(put('/api/org-readiness', '{nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  test('a PIC cannot be written through readiness', async () => {
    const res = await readinessPut(put('/api/org-readiness', { pic: '999999999' }));
    expect(res.status).toBe(400);
    expect(stubs.saveOwn).not.toHaveBeenCalled();
  });

  test('min above max is 400', async () => {
    const res = await sharesPut(put('/api/opportunities/opp1/budget-shares', { ...shareBody, minCents: 3 }), params);
    expect(res.status).toBe(400);
    expect(stubs.saveShare).not.toHaveBeenCalled();
  });

  test('a thrown error answers with no detail of it', async () => {
    stubs.saveApproval.mockRejectedValueOnce(new Error('table "InternalApproval" exploded'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await approvalPut(put('/api/opportunities/opp1/internal-approval', approvalBody), params);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('InternalApproval');
    spy.mockRestore();
  });
});
