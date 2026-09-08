import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCordisPrismaStub, type CordisPrismaStub } from './helpers/cordis-prisma-stub';

const db: CordisPrismaStub = createCordisPrismaStub();

// `withTenant` has to be mocked too, not just `prisma`: `ingestDocument` runs
// its writes inside it. While the mock omitted it, every ingest in this file
// threw `withTenant is not a function` — and `ingestDocument` swallowed that
// and returned an id anyway, so the suite asserted `deltaCount: 1` over a
// document that was never written. TASK-MTSYCMWFL22CA.
vi.mock('../src/lib/db', () => ({
  prisma: db.prisma,
  withTenant: async (_tenantId: string, fn: (tx: typeof db.prisma) => Promise<unknown>) => fn(db.prisma),
}));

const { fetchLiveCordisDelta, getCordisLiveStreamLogs } = await import('../src/lib/cordis-delta');

const ENDPOINT = 'https://example.invalid/cordis/delta.json';

/** One well-formed feed item; overrides let a test bend exactly one thing. */
function feedItem(overrides: Record<string, unknown> = {}) {
  return {
    projectId: '101200001',
    rcn: '901234',
    acronym: 'QUANTUM-SENSING-EV',
    title: 'Quantum magnetometer sensors for battery cell degradation',
    ecContributionEUR: 6_200_000,
    updatedAt: '2026-09-01T00:00:00.000Z',
    coordinatorPic: '999111222',
    coordinatorName: 'Koc University',
    coordinatorCountry: 'TR',
    topicCode: 'HORIZON-CL4-2026-QUANTUM-02',
    objectiveText: 'Sub-nanotesla NV-center sensors for battery health monitoring.',
    ...overrides,
  };
}

/** Replaces global fetch with a feed that returns `payload`. */
function stubFeed(payload: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchLiveCordisDelta', () => {
  beforeEach(() => db.reset());
  afterEach(() => vi.unstubAllGlobals());

  test('writes the feed into the real CORDIS tables', async () => {
    stubFeed([feedItem()]);

    const res = await fetchLiveCordisDelta(7, { endpoint: ENDPOINT });

    expect(res.success).toBe(true);
    expect(res.sinceDays).toBe(7);
    expect(res.deltaCount).toBe(1);
    expect(res.totalNewGrantEUR).toBe(6_200_000);
    expect(res.ingestedProjects[0]?.acronym).toBe('QUANTUM-SENSING-EV');

    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(db.rows('cordisOrganization')).toHaveLength(1);
    expect(db.rows('cordisParticipation')).toHaveLength(1);

    // The delegate the old code wrote through does not exist on the client.
    expect(db.prisma.organization).toBeUndefined();
  });

  test('is idempotent — replaying the same delta leaves one row per table', async () => {
    stubFeed([feedItem()]);
    await fetchLiveCordisDelta(7, { endpoint: ENDPOINT });
    await fetchLiveCordisDelta(7, { endpoint: ENDPOINT });

    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(db.rows('cordisOrganization')).toHaveLength(1);
    expect(db.rows('cordisParticipation')).toHaveLength(1);
    expect(db.rows('cordisProjectTopic')).toHaveLength(1);
  });

  test('an unknown field does not break the run — it is kept and alerted (CLAUDE.md #6)', async () => {
    stubFeed([feedItem({ brandNewUpstreamField: 'unmapped' })]);

    const res = await fetchLiveCordisDelta(7, { endpoint: ENDPOINT });

    // The run completes and the project still lands.
    expect(res.deltaCount).toBe(1);
    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(
      db.rows('systemAlert').some((a) => String(a.message).includes('does not map'))
    ).toBe(true);
  });

  test('an item with no project id is skipped and alerted, not counted as ingested', async () => {
    stubFeed([feedItem(), feedItem({ projectId: undefined })]);

    const res = await fetchLiveCordisDelta(7, { endpoint: ENDPOINT });

    expect(res.deltaCount).toBe(1);
    expect(res.skippedCount).toBe(1);
    expect(res.success).toBe(false);
    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(
      db.rows('systemAlert').some((a) => String(a.message).includes('no projectId'))
    ).toBe(true);
  });

  test('an unreachable feed ingests nothing and alerts — it invents no projects', async () => {
    stubFeed(null, false, 404);

    const res = await fetchLiveCordisDelta(7, { endpoint: ENDPOINT });

    expect(res.success).toBe(false);
    expect(res.deltaCount).toBe(0);
    expect(res.ingestedProjects).toEqual([]);
    expect(res.totalNewGrantEUR).toBe(0);
    expect(db.rows('cordisProject')).toHaveLength(0);
    expect(
      db.rows('systemAlert').some((a) => String(a.message).includes('HTTP 404'))
    ).toBe(true);
  });

  test('with no endpoint configured it reports that instead of calling anything', async () => {
    const fetchMock = stubFeed([feedItem()]);

    const res = await fetchLiveCordisDelta(7);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.deltaCount).toBe(0);
    expect(
      db.rows('systemAlert').some((a) => String(a.message).includes('no delta feed endpoint'))
    ).toBe(true);
  });
});

describe('getCordisLiveStreamLogs reads the real audit trail (CLAUDE.md #7)', () => {
  beforeEach(() => db.reset());

  test('no import runs yields an empty list, not two invented entries', async () => {
    expect(await getCordisLiveStreamLogs()).toEqual([]);
  });

  test('each entry mirrors a CordisImportRun row', async () => {
    const finishedAt = new Date('2026-09-05T10:00:00.000Z');
    db.rows('cordisImportRun'); // materialise the table
    (db.prisma.cordisImportRun as { findMany: unknown }).findMany = async () => [
      {
        runId: 'run-1',
        dataset: 'HORIZON',
        status: 'SUCCESS',
        startedAt: new Date('2026-09-05T09:00:00.000Z'),
        finishedAt,
        rowCounts: { projects: 42 },
      },
    ];

    const logs = await getCordisLiveStreamLogs();

    expect(logs).toEqual([
      {
        id: 'run-1',
        event: 'CORDIS_IMPORT_HORIZON',
        projectsCount: 42,
        status: 'SUCCESS',
        timestamp: finishedAt.toISOString(),
      },
    ]);
  });
});
