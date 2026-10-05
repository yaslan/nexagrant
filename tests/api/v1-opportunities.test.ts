import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET as getOpportunities } from '../../src/app/api/v1/opportunities/route';

/**
 * TASK-MTQYXISOPUJ53 — fabricated fallbacks.
 *
 * GET /api/v1/opportunities used to answer with two hard-coded demo rows
 * ("HORIZON-CL5-2026-D3-01" at €4.2m, "EIC-ACC-2026-STEP" at €2.5m) whenever
 * the query threw *or* whenever the tenant had none — so an empty workspace
 * and a broken database were both indistinguishable from a real pipeline, at
 * 200 OK. Worse, the demo rows carried `currentGate`, `targetBudgetEur`,
 * `consortiumSeatsCount` and `submissionDeadline`, none of which are columns on
 * `model Opportunity`, so the published contract changed shape with the health
 * of the database.
 *
 * These tests pin the two halves that let the bug back in if only one is
 * pinned: empty must stay empty, and a failed query must be a failure.
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

/** An Opportunity row exactly as the route includes it — every field a real column. */
const OPPORTUNITY_ROW = {
  id: 'cmtq1x8y7000abcxkfn5u2vcb',
  tenantId: 'tenant-demo',
  title: 'Zero-Emission Transport Systems',
  stage: 'G1',
  status: 'ACTIVE',
  gateDecisions: [],
  proposal: null,
};

const mockDb = vi.hoisted(() => ({
  // authenticateApiKey's per-key rate-limit UPDATE ... RETURNING (TASK-MUN80XIW5NPV1): first request of a window.
  $queryRaw: vi.fn().mockResolvedValue([{ count: 1, windowStartedAt: new Date() }]),
  apiKey: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  opportunity: {
    findMany: vi.fn(),
  },
}));

/**
 * `withTenant` hands the callback the same fake client `prisma` resolves to, so
 * `opportunityFindMany()` below still watches the one `vi.fn()` after the route
 * moved its query into a tenant scope (TASK-MTVR9T834EPUC). The API-key lookup
 * stays on `prisma`: it is the auth boundary, before any tenant is known.
 */
vi.mock('../../src/lib/db', () => ({
  prisma: mockDb,
  withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
    cb(mockDb as never),
}));

/**
 * The cross-tenant path hands its callback the same fake client as `withTenant`
 * above, so the API-key discovery read in src/lib/api-auth.ts keeps watching the
 * one `vi.fn()` after TASK-MTVTPVTEBCF5Z moved it onto `withSystemScope`.
 */
vi.mock('../../src/lib/system-scope', () => ({
  withSystemScope: async <T,>(_purpose: string, _context: string, cb: (tx: never) => Promise<T> | T) =>
    cb(mockDb as never),
}));

mockDb.apiKey.findUnique.mockImplementation(async ({ where }: { where: { keyHash: string } }) =>
  where.keyHash === TEST_API_KEY_HASH ? TEST_API_KEY_ROW : null
);

async function opportunityFindMany() {
  const { prisma } = await import('../../src/lib/db');
  return prisma.opportunity.findMany as ReturnType<typeof vi.fn>;
}

function request() {
  return new Request('http://localhost:3000/api/v1/opportunities', {
    headers: { 'x-api-key': TEST_API_KEY },
  });
}

beforeEach(async () => {
  (await opportunityFindMany()).mockReset().mockResolvedValue([OPPORTUNITY_ROW]);
});

describe('GET /api/v1/opportunities', () => {
  test('rejects a request without an API key', async () => {
    const res = await getOpportunities(new Request('http://localhost:3000/api/v1/opportunities'));
    expect(res.status).toBe(401);
  });

  test('publishes the real Opportunity columns', async () => {
    const res = await getOpportunities(request());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.meta.tenantId).toBe('tenant-demo');
    expect(body.meta.total).toBe(1);
    expect(body.data).toEqual([OPPORTUNITY_ROW]);
    // The demo-only keys are gone from the contract entirely.
    expect(body.data[0]).not.toHaveProperty('currentGate');
    expect(body.data[0]).not.toHaveProperty('targetBudgetEur');
    expect(body.data[0]).not.toHaveProperty('consortiumSeatsCount');
    expect(body.data[0]).not.toHaveProperty('submissionDeadline');
  });

  test('scopes the query to the calling tenant and hides archived rows', async () => {
    await getOpportunities(request());
    const args = (await opportunityFindMany()).mock.calls[0]?.[0];
    expect(args.where).toEqual({ tenantId: 'tenant-demo', deletedAt: null });
  });

  test('returns an empty list — not demo rows — for a workspace with no pipeline', async () => {
    (await opportunityFindMany()).mockResolvedValue([]);

    const res = await getOpportunities(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  test('answers a failed query with 500, never with fabricated rows', async () => {
    (await opportunityFindMany()).mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await getOpportunities(request());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('OPPORTUNITIES_QUERY_FAILED');
    expect(body.data).toBeUndefined();
    expect(body.success).toBeUndefined();
  });
});

describe('no hard-coded opportunity data left in the route', () => {
  const REPO = resolve(__dirname, '../..');

  test('the route carries none of the demo opportunities it used to serve', () => {
    const source = readFileSync(
      resolve(REPO, 'src/app/api/v1/opportunities/route.ts'),
      'utf8'
    );
    for (const demo of [
      'opp-demo-1',
      'opp-demo-2',
      'EIC-ACC-2026-STEP',
      'ACTIVE_PIPELINE',
      'CONCEPT_DRAFT',
      '4200000',
      '2500000',
    ]) {
      expect(source).not.toContain(demo);
    }
  });
});
