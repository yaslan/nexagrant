import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET as getCalls } from '../../src/app/api/v1/calls/route';

/**
 * GET /api/v1/calls used to answer every request with four hard-coded demo
 * calls. Its query selected `topicId`, `programme`, `deadlineAt`, `deadlineTz`,
 * `budgetTotalEur` and `fundingType` off `prisma.topic`, and prisma/schema.prisma
 * declares none of them on `model Topic`, so the call threw on every request and
 * the try/catch fell through to the demo array with a 200 OK — a public endpoint
 * publishing invented figures (a €180m "EIC Accelerator", a TÜBİTAK 1707 row),
 * which is what CLAUDE.md rule 7 forbids.
 *
 * These mocks cannot prove the query matches the schema — a mock is whatever it
 * says it is, which is exactly how the old bug survived. What they pin down is
 * the *mapping* (real Topic/Call/Programme columns in, published field names
 * out) and, above all, that no code path invents a row any more: empty stays
 * empty and a failed query is a 500, never a fabricated 200. The source-level
 * test at the bottom guards the demo array itself from creeping back.
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

/** A Topic row exactly as the route selects it — every field a real column. */
const TOPIC_ROW = {
  id: 'cmtrerwv1000jqgxkfn5u2vcb',
  identifier: 'HORIZON-CL5-2026-D4-01',
  title: 'Innovation Ecosystems',
  status: 'OPEN',
  typeOfAction: 'IA',
  nextDeadlineAt: new Date('2026-10-15T17:00:00.000Z'),
  deadlines: [{ stage: 1, at: '2026-10-15T17:00:00Z', tz: 'Europe/Brussels' }],
  budgetPerProjectCents: BigInt(450_000_00),
  call: {
    callIdentifier: 'HORIZON-CL5-2026-D4',
    budgetCents: BigInt(50_000_000),
    programme: { name: 'Horizon Europe' },
  },
};

/**
 * The one fake client, parked in a hoisted box so the two scope helpers below
 * can hand it to their callbacks BY REFERENCE.
 *
 * Not `await import('../../src/lib/db')` inside the helper: a dynamic import of a
 * mocked module re-runs this factory, which mints a fresh set of `vi.fn()`s, and
 * `topicFindMany()` then watches a different object than the route just called.
 * Measured — it cost the `filters programme through the call relation` assertion
 * its recorded calls while every other test in the file stayed green.
 */
const dbBox = vi.hoisted(() => ({ client: undefined as unknown }));

// The module gate has its own suite (v1-module-gate.test.ts); these suites test the route.
vi.mock('../../src/lib/modules/tenant-access', () => ({
  checkModuleAccessForTenant: vi.fn(async () => ({ allowed: true, status: 'ON' })),
}));
vi.mock('../../src/lib/db', () => {
  const client = {
    // authenticateApiKey's per-key rate-limit UPDATE ... RETURNING (TASK-MUN80XIW5NPV1): first request of a window.
    $queryRaw: vi.fn().mockResolvedValue([{ count: 1, windowStartedAt: new Date() }]),
    apiKey: {
      findUnique: vi.fn().mockImplementation(async ({ where }) =>
        where.keyHash === TEST_API_KEY_HASH ? TEST_API_KEY_ROW : null
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    topic: {
      findMany: vi.fn(),
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
 * The cross-tenant path hands its callback the same fake client `prisma`
 * resolves to, exactly as the `withTenant` mocks in this suite do — so the
 * assertions below keep watching the one `vi.fn()` after the code under test
 * moved its query onto `withSystemScope` (TASK-MTVTPVTEBCF5Z). Resolved lazily
 * because `vi.mock` is hoisted above the fixture consts.
 */
vi.mock('../../src/lib/system-scope', () => ({
  withSystemScope: async <T,>(_purpose: string, _context: string, cb: (tx: never) => Promise<T> | T) =>
    cb(dbBox.client as never),
}));

async function topicFindMany() {
  const { prisma } = await import('../../src/lib/db');
  return prisma.topic.findMany as ReturnType<typeof vi.fn>;
}

function request(query = '') {
  return new Request(`http://localhost:3000/api/v1/calls${query}`, {
    headers: { 'x-api-key': TEST_API_KEY },
  });
}

beforeEach(async () => {
  (await topicFindMany()).mockReset().mockResolvedValue([TOPIC_ROW]);
});

describe('GET /api/v1/calls', () => {
  test('rejects a request without an API key', async () => {
    const res = await getCalls(new Request('http://localhost:3000/api/v1/calls'));
    expect(res.status).toBe(401);
  });

  test('maps Topic / Call / Programme columns onto the published field names', async () => {
    const res = await getCalls(request('?status=OPEN'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.meta.authenticatedTenant).toBe(TEST_API_KEY_ROW.tenantId);
    expect(body.data).toEqual([
      {
        id: 'cmtrerwv1000jqgxkfn5u2vcb',
        // `Topic.identifier`, not a `topicId` column — there is no such column.
        topicId: 'HORIZON-CL5-2026-D4-01',
        title: 'Innovation Ecosystems',
        // Reached through Topic → Call → Programme.
        programme: 'Horizon Europe',
        callId: 'HORIZON-CL5-2026-D4',
        // `Topic.nextDeadlineAt`, serialised as UTC (CLAUDE.md rule 10) …
        deadlineAt: '2026-10-15T17:00:00.000Z',
        // … with the zone read out of the `Topic.deadlines` JSON, not guessed.
        deadlineTz: 'Europe/Brussels',
        // Minor units → euro through src/lib/money.ts (rule 9).
        budgetTotalEur: 500000,
        budgetPerProjectEur: 450000,
        // No schema column carries a grant range. Null, never invented.
        expectedGrantRangeEur: null,
        fundingType: 'IA',
        status: 'OPEN',
      },
    ]);
  });

  test('reads the zone of the stage that is actually next on a two-stage topic', async () => {
    (await topicFindMany()).mockResolvedValue([
      {
        ...TOPIC_ROW,
        nextDeadlineAt: new Date('2026-12-01T23:59:00.000Z'),
        deadlines: [
          { stage: 1, at: '2026-10-15T17:00:00Z', tz: 'Europe/Brussels' },
          { stage: 2, at: '2026-12-01T23:59:00Z', tz: 'Europe/Istanbul' },
        ],
      },
    ]);

    const body = await (await getCalls(request())).json();
    expect(body.data[0].deadlineTz).toBe('Europe/Istanbul');
  });

  test('reports a missing zone as null rather than defaulting to Brussels', async () => {
    (await topicFindMany()).mockResolvedValue([{ ...TOPIC_ROW, deadlines: [] }]);
    const body = await (await getCalls(request())).json();
    expect(body.data[0].deadlineTz).toBeNull();
  });

  test('reports a non-euro (TRY) call as null euro figures — never lira as euro (NG-163)', async () => {
    (await topicFindMany()).mockResolvedValue([
      {
        ...TOPIC_ROW,
        budgetPerProjectCents: BigInt(20_000_000_00),
        call: { ...TOPIC_ROW.call, currency: 'TRY', budgetCents: BigInt(100_000_000_00) },
      },
    ]);
    const body = await (await getCalls(request())).json();
    expect(body.data[0].budgetPerProjectEur).toBeNull();
    expect(body.data[0].budgetTotalEur).toBeNull();
  });

  test('keeps the euro figure when the call currency is EUR', async () => {
    (await topicFindMany()).mockResolvedValue([
      { ...TOPIC_ROW, call: { ...TOPIC_ROW.call, currency: 'EUR' } },
    ]);
    const body = await (await getCalls(request())).json();
    expect(body.data[0].budgetPerProjectEur).toBe(450000);
  });

  test('reports absent budgets as null rather than zero', async () => {
    (await topicFindMany()).mockResolvedValue([
      {
        ...TOPIC_ROW,
        budgetPerProjectCents: null,
        call: { ...TOPIC_ROW.call, budgetCents: null },
      },
    ]);
    const body = await (await getCalls(request())).json();
    expect(body.data[0].budgetTotalEur).toBeNull();
    expect(body.data[0].budgetPerProjectEur).toBeNull();
  });

  test('returns an empty list — not demo rows — when nothing matches', async () => {
    (await topicFindMany()).mockResolvedValue([]);

    const res = await getCalls(request('?status=CLOSED'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
    expect(body.meta.statusFilter).toBe('CLOSED');
  });

  test('answers a failed query with 500, never with fabricated rows', async () => {
    (await topicFindMany()).mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await getCalls(request());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('CALLS_QUERY_FAILED');
    expect(body.data).toBeUndefined();
  });

  test('rejects an unknown status with 400 instead of silently listing nothing', async () => {
    const res = await getCalls(request('?status=PENDING'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('CALLS_INVALID_STATUS');
  });

  test('filters programme through the call relation, where the column lives', async () => {
    await getCalls(request('?programme=Horizon'));
    const findMany = await topicFindMany();
    const args = findMany.mock.calls[0]?.[0];
    expect(args.where.programme).toBeUndefined();
    expect(args.where.call).toEqual({
      programme: {
        OR: [{ id: 'HORIZON' }, { name: { contains: 'Horizon', mode: 'insensitive' } }],
      },
    });
  });
});

describe('no hard-coded call data on the public surfaces', () => {
  const REPO = resolve(__dirname, '../..');

  test('the calls route carries none of the demo topics it used to serve', () => {
    const source = readFileSync(resolve(REPO, 'src/app/api/v1/calls/route.ts'), 'utf8');
    for (const demo of [
      'HORIZON-CL5-2026-D3-01',
      'HORIZON-CL4-2026-TWIN-01',
      'EIC-ACC-2026-STEP',
      'TUBITAK-1707-2026',
    ]) {
      expect(source).not.toContain(demo);
    }
  });

  test('the Turkey page no longer reads columns that are not on model Call', () => {
    // `Call.country`, `Call.isOpen` and `Call.deadline` do not exist; the query
    // that named them threw on every render and the page showed an empty list.
    const source = readFileSync(
      resolve(REPO, 'src/app/[locale]/(public)/calls/turkey/page.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/country:\s*'TR'/);
    expect(source).not.toMatch(/isOpen:\s*true/);
    expect(source).not.toMatch(/deadline:\s*\{\s*gt:/);
    // It reads the real ones instead.
    expect(source).toContain('nextDeadlineAt');
    expect(source).toContain('prisma.topic.findMany');
  });
});
