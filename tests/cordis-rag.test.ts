import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createCordisPrismaStub, type CordisPrismaStub } from './helpers/cordis-prisma-stub';
import { fakeEmbedding } from './helpers/fake-embedding';

const db: CordisPrismaStub = createCordisPrismaStub();

vi.mock('../src/lib/db', () => ({
  prisma: db.prisma,
  withTenant: async (_tenantId: string, fn: (tx: typeof db.prisma) => Promise<unknown>) => fn(db.prisma),
}));

/**
 * TASK-MTUH5L8MJ6S8E — this file used to run with a real `embedText` and no
 * `OPENAI_API_KEY`, which meant every ingest and every search here was quietly
 * carried by the mock-embedding fallback inside `getEmbedding`. That fallback
 * is gone: production code no longer invents a vector for anything. The fake
 * now enters where a fake belongs, at the provider boundary, named as one.
 *
 * Nothing below asserts relevance or ranking — `fakeEmbedding` cannot support
 * such a claim. The vector search itself is stubbed
 * (`createCordisPrismaStub`), so these tests cover the plumbing around it.
 */
const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/llm')>('../src/lib/llm');
  return { ...actual, embedText: embedTextMock };
});

const { syncCordisBigData, aggregateCordisMetrics } = await import('../src/lib/cordis-sync');
const { retrieveChunks, buildRagContext, splitText } = await import('../src/lib/rag');

beforeEach(() => {
  embedTextMock.mockReset().mockImplementation(async (text: string) => fakeEmbedding(text));
});

/** A record with every field the importer maps, so drift tests are unambiguous. */
function record(overrides: Record<string, unknown> = {}) {
  return {
    projectId: '101100001',
    framework: 'HORIZON',
    rcn: '248101',
    acronym: 'ZERO-EMISSION-EV',
    title: 'Solid-state battery thermal management',
    objectiveText: 'Scalable micro-sensor array embedded solid-state batteries.',
    ecContributionEUR: 4_500_000,
    startDate: '2026-01-01',
    endDate: '2028-12-31',
    coordinatorPic: '999985210',
    coordinatorName: 'Fraunhofer-Gesellschaft',
    coordinatorCountry: 'DE',
    topicCode: 'HORIZON-CL5-2026-D3-01',
    ...overrides,
  } as Parameters<typeof syncCordisBigData>[0] extends (infer T)[] | undefined ? T : never;
}

describe('syncCordisBigData writes to the real CORDIS tables', () => {
  beforeEach(() => db.reset());

  test('persists a project, its coordinator and the participation between them', async () => {
    const res = await syncCordisBigData([record()]);

    expect(res.success).toBe(true);
    expect(res.source).toBe('input');
    expect(res.syncedProjectsCount).toBe(1);
    expect(res.skippedCount).toBe(0);
    expect(res.totalEcContributionEUR).toBe(4_500_000);

    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(db.rows('cordisOrganization')).toHaveLength(1);
    expect(db.rows('cordisParticipation')).toHaveLength(1);
    expect(db.rows('cordisProjectTopic')).toHaveLength(1);

    // The regression this file exists for: `prisma.organization` is undefined,
    // so any write routed through it silently wrote nothing.
    expect(db.prisma.organization).toBeUndefined();
  });

  test('is idempotent — the same record twice leaves one row per table', async () => {
    await syncCordisBigData([record()]);
    const afterFirst = {
      projects: db.rows('cordisProject').length,
      organizations: db.rows('cordisOrganization').length,
      participations: db.rows('cordisParticipation').length,
      topics: db.rows('cordisProjectTopic').length,
    };

    await syncCordisBigData([record({ title: 'Solid-state battery thermal management v2' })]);

    expect({
      projects: db.rows('cordisProject').length,
      organizations: db.rows('cordisOrganization').length,
      participations: db.rows('cordisParticipation').length,
      topics: db.rows('cordisProjectTopic').length,
    }).toEqual(afterFirst);
    expect(afterFirst).toEqual({ projects: 1, organizations: 1, participations: 1, topics: 1 });

    // Second pass updates in place rather than inserting a duplicate.
    expect(db.rows('cordisProject')[0]?.title).toBe('Solid-state battery thermal management v2');
  });

  test('an unknown field does not break the run — it is kept and alerted (CLAUDE.md #6)', async () => {
    const res = await syncCordisBigData([
      record({ someBrandNewCordisColumn: 'value the importer has never seen' }),
    ]);

    expect(res.success).toBe(true);
    expect(res.syncedProjectsCount).toBe(1);

    const alerts = db.rows('systemAlert');
    expect(alerts.some((a) => String(a.message).includes('does not map'))).toBe(true);

    // Drift is preserved in rawJson, the same way mapProjectRow keeps unknown
    // CSV columns — not dropped.
    expect(db.rows('cordisProject')[0]?.rawJson).toEqual({
      someBrandNewCordisColumn: 'value the importer has never seen',
    });
  });

  test('a record with no project id is skipped and alerted, never counted as synced', async () => {
    const res = await syncCordisBigData([record({ projectId: '  ' })]);

    expect(res.success).toBe(false);
    expect(res.syncedProjectsCount).toBe(0);
    expect(res.skippedCount).toBe(1);
    expect(db.rows('cordisProject')).toHaveLength(0);
    expect(db.rows('systemAlert').some((a) => String(a.message).includes('missing project id'))).toBe(true);
  });

  test('a coordinator without a PIC keeps the project but writes no organisation', async () => {
    const res = await syncCordisBigData([record({ coordinatorPic: null })]);

    expect(res.syncedProjectsCount).toBe(1);
    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(db.rows('cordisOrganization')).toHaveLength(0);
    expect(db.rows('cordisParticipation')).toHaveLength(0);
    expect(db.rows('systemAlert').some((a) => String(a.message).includes('no organisation id'))).toBe(true);
  });

  test('with no records it mirrors already-imported rows instead of inventing a dataset', async () => {
    await syncCordisBigData([record()]);
    db.clear('document');

    const res = await syncCordisBigData();

    expect(res.source).toBe('database');
    expect(res.syncedProjectsCount).toBe(1);
    // Re-indexing must not create a second copy of the project.
    expect(db.rows('cordisProject')).toHaveLength(1);
    expect(db.rows('document')).toHaveLength(1);
  });

  test('the database re-index leaves keep.eu rows (KEU:) to the keep.eu RAG step (FO-363)', async () => {
    // A keep.eu project sits in the same table under the KEU: prefix (persistKeepEuRecord).
    await syncCordisBigData([
      record(),
      record({ projectId: 'KEU:BGTR0300118', objectiveText: 'keep.eu text', coordinatorPic: null }),
    ]);
    expect(db.rows('cordisProject')).toHaveLength(2);
    db.clear('document');
    embedTextMock.mockClear();

    const res = await syncCordisBigData();

    expect(res.syncedProjectsCount).toBe(1);
    const texts = embedTextMock.mock.calls.map((c) => String(c[0]));
    expect(texts.some((t) => t.includes('KEU:'))).toBe(false);
    expect(texts.some((t) => t.includes('keep.eu text'))).toBe(false);
  });
});

describe('aggregateCordisMetrics reports measured figures (CLAUDE.md #7)', () => {
  beforeEach(() => db.reset());

  test('an empty database reports zeros rather than a hard-coded headline', async () => {
    const metrics = await aggregateCordisMetrics();

    expect(metrics.totalProjectsCount).toBe(0);
    expect(metrics.totalEcContributionEUR).toBe(0);
    expect(metrics.averageGrantPerProjectEUR).toBe(0);
    expect(metrics.topCountriesBreakdown).toEqual([]);
    expect(metrics.lastSyncTimestamp).toBe('');
  });

  test('figures follow the rows that were actually written', async () => {
    await syncCordisBigData([
      record(),
      record({ projectId: '101100002', coordinatorPic: '999888777', ecContributionEUR: 1_500_000 }),
    ]);

    const metrics = await aggregateCordisMetrics();

    expect(metrics.totalProjectsCount).toBe(2);
    expect(metrics.totalEcContributionEUR).toBe(6_000_000);
    expect(metrics.averageGrantPerProjectEUR).toBe(3_000_000);
    expect(metrics.topCountriesBreakdown[0]?.country).toBe('DE');
    expect(metrics.topCountriesBreakdown[0]?.projectCount).toBe(2);
  });
});

describe('RAG helpers', () => {
  beforeEach(() => db.reset());

  test('splitText divides long document text into overlapping chunks', () => {
    const text = 'A'.repeat(4000);
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]?.length).toBe(1500);
  });

  test('retrieveChunks returns top-K vector search matches with similarity scores', async () => {
    const chunks = await retrieveChunks('Zero-emission battery', 3);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.score).toBeGreaterThan(0.5);
  });

  test('buildRagContext labels the retrieved chunks and carries no instruction', async () => {
    const context = await buildRagContext('Zero-emission battery', undefined, 2);
    expect(context).toContain('[Source 1 | Score:');
    expect(context).not.toContain('Question:');
  });
});
