import crypto from 'crypto';
import { describe, test, expect, vi } from 'vitest';
import { authenticateApiKey } from '../../src/lib/api-auth';
import { GET as getPartners } from '../../src/app/api/v1/partners/route';
import { GET as getCalls } from '../../src/app/api/v1/calls/route';
import { GET as getOpportunities } from '../../src/app/api/v1/opportunities/route';

/**
 * These tests used to authenticate through a prefix escape hatch in
 * `authenticateApiKey` (`fp_live_demo...` was accepted without a matching row).
 * That hatch was an unauthenticated cross-tenant read for anyone who could
 * guess the prefix, so it is gone. The fixture below is what a real integration
 * key looks like instead: a plaintext key the caller sends, and an `ApiKey` row
 * stored under its SHA-256 — exactly what `pnpm db:seed` writes.
 */
const TEST_API_KEY = 'fp_live_test_9f2c41ab7d0e4c8fa1b6';
const TEST_API_KEY_HASH = crypto.createHash('sha256').update(TEST_API_KEY).digest('hex');

const TEST_API_KEY_ROW = {
  id: 'key-integration-1',
  tenantId: 'tenant-demo',
  name: 'Integration Test Key',
  prefix: TEST_API_KEY.slice(0, 12),
  keyHash: TEST_API_KEY_HASH,
};

vi.mock('../../src/lib/db', () => ({
  prisma: {
    apiKey: {
      // Keyed on the hash the production code actually computes, so the test
      // exercises the real lookup rather than a stand-in constant.
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        return where.keyHash === TEST_API_KEY_HASH ? TEST_API_KEY_ROW : null;
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

  test('authenticateApiKey rejects an unknown key that only looks demo-ish', async () => {
    // Regression guard for the removed `fp_live_demo` prefix bypass: a key with
    // no ApiKey row must be refused no matter how it is spelled.
    const req = new Request('http://localhost:3000/api/v1/partners', {
      headers: { 'x-api-key': 'fp_live_demo_key_987654321' },
    });
    const auth = await authenticateApiKey(req);
    expect(auth.authenticated).toBe(false);
    if (!auth.authenticated) {
      expect(auth.errorResponse.status).toBe(401);
    }
  });

  test('authenticateApiKey accepts a key backed by a real ApiKey row', async () => {
    const req = new Request('http://localhost:3000/api/v1/partners', {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const auth = await authenticateApiKey(req);
    expect(auth.authenticated).toBe(true);
    if (auth.authenticated) {
      expect(auth.data.tenantId).toBe(TEST_API_KEY_ROW.tenantId);
      expect(auth.data.apiKeyId).toBe(TEST_API_KEY_ROW.id);
    }
  });

  test('GET /api/v1/partners returns CORDIS organizations with metadata', async () => {
    const req = new Request('http://localhost:3000/api/v1/partners?country=DE', {
      headers: { 'x-api-key': TEST_API_KEY },
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
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    const res = await getCalls(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/opportunities returns tenant pipeline opportunities', async () => {
    const req = new Request('http://localhost:3000/api/v1/opportunities', {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const res = await getOpportunities(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // The tenant on the response is the one the key resolved to — never a
    // caller-supplied or fallback value.
    expect(body.meta.tenantId).toBe(TEST_API_KEY_ROW.tenantId);
  });
});
