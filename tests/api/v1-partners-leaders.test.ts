import { describe, expect, test, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * TASK-MVBBPXU1ZW0F5 (FO-5) — GET /api/v1/partners/leaders: the 401 / 400
 * contract and the response shape. Auth is replaced with a stand-in that
 * accepts one key; the database is replaced with a $queryRaw stub, so the
 * SQL is checked by tests/cordis-coordinator-leaders.live.test.ts instead.
 */

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/db', () => ({ prisma: { $queryRaw: queryRaw } }));

vi.mock('../../src/lib/api-auth', () => ({
  authenticateApiKey: async (req: Request) => {
    if (req.headers.get('x-api-key') === 'fp_live_valid_key') {
      return { authenticated: true, data: { tenantId: 'tenant-demo' } };
    }
    return {
      authenticated: false,
      errorResponse: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  },
}));

import { GET } from '../../src/app/api/v1/partners/leaders/route';

function request(query: string, key = 'fp_live_valid_key') {
  return new Request(`http://localhost:3000/api/v1/partners/leaders${query}`, {
    headers: key ? { 'x-api-key': key } : {},
  });
}

describe('GET /api/v1/partners/leaders', () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  test('refuses a request without an API key with 401 and runs no query', async () => {
    const res = await GET(request('?topicPrefix=HORIZON-CL5-', ''));
    expect(res.status).toBe(401);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  test('refuses a missing topicPrefix with 400 and runs no query', async () => {
    const res = await GET(request(''));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'invalid_query' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  test('refuses a malformed topicPrefix with 400 and echoes nothing of it', async () => {
    const res = await GET(request('?topicPrefix=HO%25'));
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).not.toContain('HO%');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  test('returns the published field names and keeps the euro total as a string', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        organisationId: '999984059',
        name: 'FRAUNHOFER LEGAL NAME',
        shortName: 'Fraunhofer-Gesellschaft',
        country: 'DE',
        coordinatedProjects: 2,
        totalEcContribution: '9007199254740993',
      },
    ]);
    const res = await GET(request('?topicPrefix=horizon-cl5-&limit=5&country=de'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta).toMatchObject({ topicPrefix: 'HORIZON-CL5-', total: 1, limit: 5, authenticatedTenant: 'tenant-demo' });
    expect(body.data).toEqual([
      {
        id: '999984059',
        pic: '999984059',
        name: 'Fraunhofer-Gesellschaft',
        legalName: 'FRAUNHOFER LEGAL NAME',
        country: 'DE',
        coordinatedProjects: 2,
        totalEcContributionEur: '9007199254740993',
      },
    ]);
  });

  test('answers 500 with a fixed code and no query text when the database fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('relation "CordisParticipation" does not exist'));
    const res = await GET(request('?topicPrefix=HORIZON-CL5-'));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain('PARTNER_LEADERS_QUERY_FAILED');
    expect(body).not.toContain('CordisParticipation');
  });
});
