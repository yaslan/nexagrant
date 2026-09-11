import crypto from 'crypto';
import { describe, test, expect, vi } from 'vitest';
import { authenticateApiKey } from '../../src/lib/api-auth';
import { GET as getPartners } from '../../src/app/api/v1/partners/route';
import { GET as getPartnerDetail } from '../../src/app/api/v1/partners/[pic]/route';
import { GET as getCalls } from '../../src/app/api/v1/calls/route';
import { GET as getOpportunities } from '../../src/app/api/v1/opportunities/route';

/**
 * These tests used to authenticate through a prefix escape hatch in
 * `authenticateApiKey` (`fp_live_demo...` was accepted without a matching row).
 * That hatch was an unauthenticated cross-tenant read for anyone who could
 * guess the prefix, so it is gone. The fixture below is what a real integration
 * key looks like instead: a plaintext key the caller sends, and an `ApiKey` row
 * stored under its SHA-256 — exactly what `pnpm db:seed` writes.
 *
 * The partner mocks below used to be `organization`, and that is how this file
 * missed the bug in TASK-MTRK8YPNJDCIT: there is no `model Organization` in
 * prisma/schema.prisma, so the *mock* was the only place that model ever
 * existed. `prisma.organization.findMany` resolved to `[]` here and threw
 * `TypeError: Cannot read properties of undefined` in production, where the
 * route's catch turned it into a hard-coded demo array — which is what made
 * `data.length > 0` below pass. A mock can never catch that class of bug;
 * src/modules/m8/server/schema-contract.test.ts checks the query against the
 * schema instead. What these mocks are for is the *mapping*: CORDIS columns in,
 * published API field names out.
 */

/** A CordisOrganization row with its derived profile, as the list route selects it. */
const CORDIS_ORG_WITH_PROFILE = {
  organisationId: '999984059',
  name: 'FRAUNHOFER GESELLSCHAFT ZUR FOERDERUNG DER ANGEWANDTEN FORSCHUNG E.V.',
  shortName: 'Fraunhofer-Gesellschaft',
  country: 'DE',
  activityType: 'REC',
  sme: false,
  city: 'München',
  profile: {
    totalProjects: 2,
    coordinatorProjects: 1,
    totalEcContribution: BigInt(4840000),
  },
};
const TEST_API_KEY = 'fp_live_test_9f2c41ab7d0e4c8fa1b6';
const TEST_API_KEY_HASH = crypto.createHash('sha256').update(TEST_API_KEY).digest('hex');

const TEST_API_KEY_ROW = {
  id: 'key-integration-1',
  tenantId: 'tenant-demo',
  name: 'Integration Test Key',
  prefix: TEST_API_KEY.slice(0, 12),
  keyHash: TEST_API_KEY_HASH,
};

/**
 * The fake client is built inside the factory (the `vi.mock` hoist puts it above
 * the fixture consts) and parked in this box so `withTenant` can hand the very
 * same object to its callback — `/api/v1/opportunities` moved its query into a
 * tenant scope in TASK-MTVR9T834EPUC, and the assertions here must keep
 * watching one client, not two.
 */
const dbBox = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('../../src/lib/db', () => {
  const client = {
    apiKey: {
      // Keyed on the hash the production code actually computes, so the test
      // exercises the real lookup rather than a stand-in constant.
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        return where.keyHash === TEST_API_KEY_HASH ? TEST_API_KEY_ROW : null;
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    cordisOrganization: {
      // Lazy on purpose: `vi.mock` is hoisted above the const declarations, so
      // reading the fixture eagerly here would hit the temporal dead zone.
      findMany: vi.fn().mockImplementation(async () => [CORDIS_ORG_WITH_PROFILE]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    cordisParticipation: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    cordisProjectTopic: { groupBy: vi.fn().mockResolvedValue([]) },
    cordisCoParticipation: { findMany: vi.fn().mockResolvedValue([]) },
    topic: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    opportunity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  dbBox.client = client;
  return {
    prisma: client,
    withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
      cb(dbBox.client as never),
  };
});

/**
 * The cross-tenant path hands its callback the same fake client as `withTenant`
 * above, so the API-key discovery read in src/lib/api-auth.ts keeps watching the
 * one `vi.fn()` after TASK-MTVTPVTEBCF5Z moved it onto `withSystemScope`.
 */
vi.mock('../../src/lib/system-scope', () => ({
  withSystemScope: async <T,>(_purpose: string, _context: string, cb: (tx: never) => Promise<T> | T) =>
    cb(dbBox.client as never),
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

  test('GET /api/v1/partners maps CORDIS columns onto the published field names', async () => {
    const req = new Request('http://localhost:3000/api/v1/partners?country=DE', {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const res = await getPartners(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta.authenticatedTenant).toBe(TEST_API_KEY_ROW.tenantId);
    expect(body.data).toHaveLength(1);

    // The whole contract of this endpoint, asserted field by field: the names
    // are the ones it has always published, the values come from CORDIS.
    expect(body.data[0]).toEqual({
      id: '999984059',
      pic: '999984059',
      name: 'Fraunhofer-Gesellschaft',
      legalName: 'FRAUNHOFER GESELLSCHAFT ZUR FOERDERUNG DER ANGEWANDTEN FORSCHUNG E.V.',
      country: 'DE',
      orgType: 'REC',
      isSme: false,
      city: 'München',
      stats: {
        projectCount: 2,
        coordinatorCount: 1,
        totalEuContributionEur: 4840000,
        // No CORDIS table carries a centrality measure. Null, never invented.
        networkCentralityScore: null,
      },
    });
  });

  test('GET /api/v1/partners returns an empty list, not demo rows, when nothing matches', async () => {
    const { prisma } = await import('../../src/lib/db');
    const findMany = prisma.cordisOrganization.findMany as ReturnType<typeof vi.fn>;
    findMany.mockResolvedValueOnce([]);

    const req = new Request('http://localhost:3000/api/v1/partners?country=ZZ', {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const res = await getPartners(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  test('GET /api/v1/partners/[pic] 404s on an unknown PIC instead of inventing one', async () => {
    // It used to answer any PIC at all with a fabricated organisation —
    // a name, a country, 142 projects and €54.2M, none of it from a row.
    const req = new Request('http://localhost:3000/api/v1/partners/000000000', {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const res = await getPartnerDetail(req, { params: Promise.resolve({ pic: '000000000' }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('PARTNER_NOT_FOUND');
    expect(body.data).toBeUndefined();
  });

  test('GET /api/v1/calls authenticates and reports an empty database as empty', async () => {
    // `topic.findMany` is mocked to `[]` above, and this used to assert
    // `data.length > 0` — it passed only because the route swallowed its own
    // broken query and served four hard-coded demo calls. The endpoint now
    // answers with what the database holds, so an empty mock means an empty
    // list. Its behaviour is covered field by field in tests/api/v1-calls.test.ts.
    const req = new Request('http://localhost:3000/api/v1/calls?status=OPEN', {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    const res = await getCalls(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  test('GET /api/v1/opportunities reports an empty pipeline as empty', async () => {
    // Same correction as the calls test above, for the same reason. This
    // asserted `data.length > 0` against an `opportunity.findMany` mock that
    // resolves to `[]`; it passed only because the route answered an empty
    // result with two hard-coded demo opportunities ("opp-demo-1" at €4.2m).
    // The demo array is gone, so an empty mock means an empty list — the
    // route's full behaviour is covered in tests/api/v1-opportunities.test.ts.
    const req = new Request('http://localhost:3000/api/v1/opportunities', {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const res = await getOpportunities(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
    // The tenant on the response is the one the key resolved to — never a
    // caller-supplied or fallback value.
    expect(body.meta.tenantId).toBe(TEST_API_KEY_ROW.tenantId);
  });
});
