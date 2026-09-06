import { describe, test, expect, vi } from 'vitest';
import { authenticateApiKey } from '../../src/lib/api-auth';
import { GET as getPartners } from '../../src/app/api/v1/partners/route';
import { GET as getCalls } from '../../src/app/api/v1/calls/route';
import { GET as getOpportunities } from '../../src/app/api/v1/opportunities/route';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (where.keyHash === 'mock-valid-hash') {
          return {
            id: 'key-1',
            tenantId: 'tenant-demo',
            name: 'Valid Key',
            prefix: 'fp_live_val',
          };
        }
        return null;
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    organization: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    topic: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    opportunity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe('Partner Intelligence REST API (v1)', () => {
  test('authenticateApiKey rejects request without API key (401)', async () => {
    const req = new Request('http://localhost:3000/api/v1/partners');
    const auth = await authenticateApiKey(req);
    expect(auth.authenticated).toBe(false);
  });

  test('authenticateApiKey allows valid live/demo key', async () => {
    const req = new Request('http://localhost:3000/api/v1/partners', {
      headers: { 'x-api-key': 'fp_live_demo_key_987654321' },
    });
    const auth = await authenticateApiKey(req);
    expect(auth.authenticated).toBe(true);
    if (auth.authenticated) {
      expect(auth.data.tenantId).toBeDefined();
    }
  });

  test('GET /api/v1/partners returns CORDIS organizations with metadata', async () => {
    const req = new Request('http://localhost:3000/api/v1/partners?country=DE', {
      headers: { 'x-api-key': 'fp_live_demo_key_123' },
    });
    const res = await getPartners(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].pic).toBeDefined();
  });

  test('GET /api/v1/calls returns open Horizon Europe & national calls', async () => {
    const req = new Request('http://localhost:3000/api/v1/calls?status=OPEN', {
      headers: { 'Authorization': 'Bearer fp_live_demo_key_123' },
    });
    const res = await getCalls(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/opportunities returns tenant pipeline opportunities', async () => {
    const req = new Request('http://localhost:3000/api/v1/opportunities', {
      headers: { 'x-api-key': 'fp_live_demo_key_123' },
    });
    const res = await getOpportunities(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});
