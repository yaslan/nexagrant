import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `/calls`'daki "Aramayı Kaydet" düğmesi eskiden `setTimeout(500)` + toast'tı;
 * hiçbir tabloya yazmıyordu (TASK-MTRNQN0NNVBYM). Bu, o gerçek yazıcının
 * testleri — tenant-scope zorunluluğu, `withTenant` çağrısı ve `filters`
 * şeklinin `alerts-daily.ts`'in okuduğu şemayla aynı kalması.
 */

const mockTx = {
  savedSearch: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

const mockWithTenant = vi.fn((_tenantId: string, cb: (tx: typeof mockTx) => unknown) => cb(mockTx));

vi.mock('@/lib/db', () => ({ withTenant: (...args: [string, (tx: typeof mockTx) => unknown]) => mockWithTenant(...args) }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { GET, POST } from './route';
import { auth } from '@/lib/auth';

const SCOPED_SESSION = {
  user: { id: 'user_1' },
  tenantId: 'tenant_1',
  role: 'MEMBER',
  workspaceIds: ['ws_1'],
};

function postRequest(body: unknown) {
  return new Request('https://example.test/api/saved-searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/saved-searches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithTenant.mockImplementation((_tenantId: string, cb: (tx: typeof mockTx) => unknown) => cb(mockTx));
  });

  describe('GET', () => {
    it('returns 401 without ever touching the database when there is no tenant scope', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const res = await GET();

      expect(res.status).toBe(401);
      expect(mockWithTenant).not.toHaveBeenCalled();
    });

    it('lists only the caller\'s own searches, scoped by tenantId and userId', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);
      mockTx.savedSearch.findMany.mockResolvedValue([
        { id: 'ss_1', tenantId: 'tenant_1', userId: 'user_1', name: 'HORIZON-CL5', notify: true },
      ]);

      const res = await GET();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.searches).toHaveLength(1);
      expect(mockWithTenant).toHaveBeenCalledWith('tenant_1', expect.any(Function));
      expect(mockTx.savedSearch.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_1', userId: 'user_1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('POST', () => {
    it('returns 401 without ever touching the database when there is no tenant scope', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const res = await POST(postRequest({ name: 'x', filters: {} }));

      expect(res.status).toBe(401);
      expect(mockWithTenant).not.toHaveBeenCalled();
    });

    it('creates a row scoped to the caller\'s tenant and user, filters shaped like alerts-daily reads', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);
      mockTx.savedSearch.create.mockResolvedValue({
        id: 'ss_new',
        tenantId: 'tenant_1',
        userId: 'user_1',
        name: 'HORIZON-CL5',
        filters: { q: 'HORIZON-CL5', status: ['OPEN'] },
        notify: true,
        createdAt: new Date(),
      });

      const res = await POST(
        postRequest({ name: 'HORIZON-CL5', filters: { q: 'HORIZON-CL5', status: ['OPEN'] }, notify: true })
      );
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockTx.savedSearch.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant_1',
          userId: 'user_1',
          name: 'HORIZON-CL5',
          filters: { q: 'HORIZON-CL5', status: ['OPEN'] },
          notify: true,
        },
      });
    });

    it('defaults notify to true when the caller omits it', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);
      mockTx.savedSearch.create.mockResolvedValue({ id: 'ss_new' });

      await POST(postRequest({ name: 'All calls', filters: {} }));

      expect(mockTx.savedSearch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ notify: true }),
      });
    });

    it('rejects a status value alerts-daily does not recognise, rather than silently degrading to "no filter"', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);

      const res = await POST(
        postRequest({ name: 'bad', filters: { status: ['NOT_A_REAL_STATUS'] } })
      );

      expect(res.status).toBe(400);
      expect(mockTx.savedSearch.create).not.toHaveBeenCalled();
    });

    it('rejects an empty name', async () => {
      vi.mocked(auth).mockResolvedValue(SCOPED_SESSION as never);

      const res = await POST(postRequest({ name: '', filters: {} }));

      expect(res.status).toBe(400);
      expect(mockTx.savedSearch.create).not.toHaveBeenCalled();
    });
  });
});
