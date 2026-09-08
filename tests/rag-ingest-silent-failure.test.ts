/**
 * TASK-MTSYCMWFL22CA — a shared-corpus ingest that stores nothing must not
 * report success.
 *
 * `ingestDocument` used to catch every database failure, write an "ingestion
 * bypassed" line to the console and return an id anyway. Its two callers
 * (`syncCordisBigData`, `syncCordisDelta`) read "no exception" as "stored", so
 * a run that committed zero rows reported `success: true, synced: 1` with no
 * `SystemAlert` behind it. Measured against the live database on 2026-09-08
 * with the Chunk INSERT deliberately broken:
 *
 *   reported synced=1 skipped=0 success=true | actually stored documents=0
 *   chunks=0 | alerts=0
 *
 * These tests are that measurement, kept.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createCordisPrismaStub, type CordisPrismaStub } from './helpers/cordis-prisma-stub';

const db: CordisPrismaStub = createCordisPrismaStub();

/** How many rows the next `$executeRawUnsafe` reports, or the error it throws. */
const chunkInsert = {
  behaviour: 'ok' as 'ok' | 'throw' | 'zero-rows',
  calls: 0,
};

db.prisma.$executeRawUnsafe = async (): Promise<number> => {
  chunkInsert.calls++;
  if (chunkInsert.behaviour === 'throw') {
    throw new Error('Raw query failed. Code: `42P01`. Message: `relation "Chunk" does not exist`');
  }
  return chunkInsert.behaviour === 'zero-rows' ? 0 : 1;
};

vi.mock('../src/lib/db', () => ({
  prisma: db.prisma,
  withTenant: async (_tenantId: string, fn: (tx: typeof db.prisma) => Promise<unknown>) => fn(db.prisma),
}));

const envStub = { OPENAI_API_KEY: undefined as string | undefined };
vi.mock('../src/lib/env', () => ({ env: envStub }));

const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/llm')>('../src/lib/llm');
  return { ...actual, embedText: embedTextMock };
});

type AlertInput = { level: string; source: string; message: string; meta?: Record<string, unknown> };
const recordAlertMock = vi.hoisted(() =>
  vi.fn(async (_input: { level: string; source: string; message: string; meta?: Record<string, unknown> }) => ({
    status: 'recorded' as const,
    id: 'a1',
  }))
);
vi.mock('../src/lib/observability/system-alert', () => ({ recordAlert: recordAlertMock }));

const { ingestDocument, getEmbedding } = await import('../src/lib/rag');
const { syncCordisBigData } = await import('../src/lib/cordis-sync');

const CORDIS_RECORD = {
  projectId: '101100001',
  title: 'Solid-state battery thermal management',
  acronym: 'ZERO-EMISSION-EV',
  objectiveText: 'Scalable micro-sensor array embedded solid-state batteries.',
  ecContributionEUR: 4_500_000,
  coordinatorPic: '999985210',
  coordinatorName: 'Fraunhofer-Gesellschaft',
  coordinatorCountry: 'DE',
  topicCode: 'HORIZON-CL5-2026-D3-01',
};

beforeEach(() => {
  db.reset();
  chunkInsert.behaviour = 'ok';
  chunkInsert.calls = 0;
  envStub.OPENAI_API_KEY = undefined;
  embedTextMock.mockReset().mockResolvedValue(new Array(1536).fill(0.5));
  recordAlertMock.mockClear();
});

describe('ingestDocument surfaces a failed store instead of returning an id', () => {
  test('rejects when the chunk INSERT fails — no id comes back for a rolled-back write', async () => {
    chunkInsert.behaviour = 'throw';

    await expect(ingestDocument('CORDIS row', 'body text', 'CORDIS_PROJECT')).rejects.toThrow(
      /relation "Chunk" does not exist/
    );
  });

  test('rejects when Postgres reports fewer inserted rows than there were chunks', async () => {
    // The count a caller is handed has to be rows Postgres confirmed, not the
    // number of times the loop went round.
    chunkInsert.behaviour = 'zero-rows';

    await expect(ingestDocument('CORDIS row', 'body text', 'CORDIS_PROJECT')).rejects.toThrow(
      /split into 1 chunks but Postgres reported 0 inserted/
    );
  });

  test('refuses text that yields no chunks, before a Document row exists', async () => {
    await expect(ingestDocument('Empty scan', '', 'SHARED_PDF')).rejects.toThrow(/no chunks/);

    expect(db.rows('document')).toHaveLength(0);
    expect(chunkInsert.calls).toBe(0);
  });

  test('returns the id of a document whose chunks all committed', async () => {
    const id = await ingestDocument('CORDIS row', 'body text', 'CORDIS_PROJECT');

    expect(db.rows('document')).toHaveLength(1);
    expect(db.rows('document')[0]!.id).toBe(id);
    expect(chunkInsert.calls).toBe(1);
  });
});

describe('syncCordisBigData counts stored rows, not attempts', () => {
  test('a failed ingest is a skip with an alert behind it, never a synced project', async () => {
    chunkInsert.behaviour = 'throw';

    const res = await syncCordisBigData([CORDIS_RECORD]);

    expect(res.syncedProjectsCount).toBe(0);
    expect(res.skippedCount).toBe(1);
    expect(res.success).toBe(false);
    // CLAUDE.md rule 6: do not break the run, but do raise a SystemAlert.
    expect(recordAlertMock).toHaveBeenCalledTimes(1);
    const alert: AlertInput = recordAlertMock.mock.calls[0]![0];
    expect(alert).toMatchObject({
      level: 'error',
      source: 'cordis-sync',
    });
    // Nothing was contributed to the grant total by a record that stored nothing.
    expect(res.totalEcContributionEUR).toBe(0);
  });

  test('the happy path still reports one synced project and one document', async () => {
    const res = await syncCordisBigData([CORDIS_RECORD]);

    expect(res.syncedProjectsCount).toBe(1);
    expect(res.skippedCount).toBe(0);
    expect(res.success).toBe(true);
    expect(db.rows('document')).toHaveLength(1);
  });
});

describe('getEmbedding keeps the mock vector for key-less environments only', () => {
  test('falls back to the mock vector when no key is configured — nothing was sent', async () => {
    embedTextMock.mockRejectedValue(new Error('OPENAI_API_KEY not set'));

    await expect(getEmbedding('text', { tenantId: null, module: 'K6', purpose: 'p' })).resolves.toHaveLength(1536);
  });

  test('rethrows a provider failure when a key IS configured', async () => {
    // A mock vector stored here would look like a successful ingest and never
    // come back from a similarity search: stored, counted, unretrievable.
    envStub.OPENAI_API_KEY = 'sk-configured';
    embedTextMock.mockRejectedValue(new Error('OpenAI embeddings error 429: rate limit'));

    await expect(
      getEmbedding('text', { tenantId: null, module: 'K6', purpose: 'p' })
    ).rejects.toThrow(/429/);
  });
});
