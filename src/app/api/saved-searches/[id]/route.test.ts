import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTx = {
  savedSearch: {
    updateMany: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
};

const mockWithTenant = vi.fn((_tenantId: string, cb: (tx: typeof mockTx) => unknown) => cb(mockTx));

vi.mock('@/lib/db', () => ({ withTenant: (...args: [string, (tx: typeof mockTx) => unknown]) => mockWithTenant(...args) }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// The free-pilot write gate reads the Subscription row, which this faked
// transaction does not carry; it has its own tests (src/lib/billing/pilot-gates.test.ts).
vi.mock('@/lib/billing/pilot', () => ({
  assertTenantWritable: vi.fn(async () => undefined),
  PilotExpiredError: class PilotExpiredError extends Error {},
}));

import { PATCH, DELETE } from './route';
import { auth } from '@/lib/auth';

const SCOPED_SESSION = {
  user: { id: 'user_1' },
  tenantId: 'tenant_1',
  role: 'MEMBER',
  workspaceIds: ['ws_1'],
};

function patchRequest(body: unknown) {
  return new Request('https://example.test/api/saved-searches/ss_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request('https://example.test/api/saved-searches/ss_1', { method: 'DELETE' });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/api/saved-searches/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithTenant.mockImplementation((_tenantId: string, cb: (tx: typeof mockTx) => unknown) => cb(mockTx));
  });

  describe('PATCH', () => {
    it('returns 401 without touching the database when there is no tenant scope', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const res = await PATCH(patchRequest({ notify: false }), params('ss_1'));

      expect(res.status).toBe(401);
      expect(mockWithTenant).not.toHaveBeenCalled();
    });

    it('updates only a row that matches id + tenantId + userId, never another member\'s search', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);
      mockTx.savedSearch.updateMany.mockResolvedValue({ count: 1 });
      mockTx.savedSearch.findMany.mockResolvedValue([{ id: 'ss_1', notify: false }]);

      const res = await PATCH(patchRequest({ notify: false }), params('ss_1'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockTx.savedSearch.updateMany).toHaveBeenCalledWith({
        where: { id: 'ss_1', tenantId: 'tenant_1', userId: 'user_1' },
        data: { notify: false },
      });
    });

    it('returns 404 when the row belongs to someone else or does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);
      mockTx.savedSearch.updateMany.mockResolvedValue({ count: 0 });

      const res = await PATCH(patchRequest({ notify: false }), params('someone-elses'));

      expect(res.status).toBe(404);
      expect(mockTx.savedSearch.findMany).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean notify value', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);

      const res = await PATCH(patchRequest({ notify: 'yes' }), params('ss_1'));

      expect(res.status).toBe(400);
      expect(mockTx.savedSearch.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('returns 401 without touching the database when there is no tenant scope', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const res = await DELETE(deleteRequest(), params('ss_1'));

      expect(res.status).toBe(401);
      expect(mockWithTenant).not.toHaveBeenCalled();
    });

    it('deletes only a row scoped to id + tenantId + userId', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);
      mockTx.savedSearch.deleteMany.mockResolvedValue({ count: 1 });

      const res = await DELETE(deleteRequest(), params('ss_1'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockTx.savedSearch.deleteMany).toHaveBeenCalledWith({
        where: { id: 'ss_1', tenantId: 'tenant_1', userId: 'user_1' },
      });
    });

    it('returns 404 when nothing matched, rather than a false success', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);
      mockTx.savedSearch.deleteMany.mockResolvedValue({ count: 0 });

      const res = await DELETE(deleteRequest(), params('someone-elses'));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
