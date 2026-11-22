import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { fakeEmbedding } from './helpers/fake-embedding';
import { isGithubActions, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * FO-363 (K-575447) — the five keep.eu projects that name a real person must never
 * reach the embedding model. `syncKeepEuData` skips them, but keep.eu rows live in
 * `CordisProject` under the `KEU:` prefix, and the CORDIS database re-index
 * (`syncCordisBigData()` with no records, the admin "CORDIS sync" action) read
 * every recent row of that table. It embedded the excluded projects, lead partner
 * name included. This file writes those rows to a real database and runs the
 * re-index against it; the embedding provider is faked, so no text leaves.
 *
 * `.live`: needs a migrated, throwaway database behind DATABASE_URL and
 * KEEP_EU_LIVE=1 (same opt-in as keep-eu-sync.live.test.ts).
 */

const SUITE = 'keep-eu-cordis-reindex.live';
const LIVE = process.env.KEEP_EU_LIVE === '1';
if (!LIVE) skipOrFailInCi(SUITE, 'KEEP_EU_LIVE=1 is not set (point DATABASE_URL at a throwaway database first)');

const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/llm')>('../src/lib/llm');
  return { ...actual, embedText: embedTextMock };
});

const { createDbClient, prisma } = await import('@/lib/db');
// Owner connection that builds fixtures, the second argument of usedDatabaseName (same DB as `prisma`).
const admin = createDbClient(process.env.DATABASE_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const { persistKeepEuRecord, RAG_EXCLUDED_PROJECT_IDS } = await import('@/lib/keep-eu-sync');
const { syncCordisBigData } = await import('@/lib/cordis-sync');

const RUN = `fo363-${Date.now().toString(36)}`;
const keyOf = (id: string) => `KEU:${id}`;
const orgOf = (id: string) => `KEU:${RUN}-${id}`;

describe.skipIf(!LIVE)(SUITE, () => {
  // Set only once this run has written its own rows; afterAll deletes nothing before that.
  let seeded = false;

  beforeAll(async () => {
    // B1: the teardown deletes by fixed keep.eu ids (KEU:BGTR0300118 …), not by RUN, so refuse to
    // run on the shared database and refuse to start when those ids already exist: any row found
    // here is not ours, and the teardown below must never delete it.
    const dbName = await usedDatabaseName(prisma, admin, SUITE);
    if (dbName === undefined || (dbName === 'fabrika' && !isGithubActions())) {
      throw new Error(`${SUITE}: refusing to run on ${dbName ?? 'an unreadable database'}; point DATABASE_URL at a throwaway database`);
    }
    const preexisting = await prisma.cordisProject.findMany({
      where: { id: { in: RAG_EXCLUDED_PROJECT_IDS.map(keyOf) } },
      select: { id: true },
    });
    if (preexisting.length > 0) {
      throw new Error(`${SUITE}: ${preexisting.length} keep.eu row(s) already exist in this database; refusing to overwrite or delete them`);
    }

    embedTextMock.mockImplementation(async (text: string) => fakeEmbedding(text));
    seeded = true;
    for (const id of RAG_EXCLUDED_PROJECT_IDS) {
      const ok = await persistKeepEuRecord({
        projectId: id,
        title: `${RUN} title ${id}`,
        description: `${RUN} objective ${id}`,
        programmeId: 'FO363',
        framework: 'INTERREG',
        partners: [
          {
            partnerName: `${RUN} lead partner ${id}`,
            beneficiaryId: `${RUN}-${id}`,
            pic: null,
            country: 'TR',
            role: 'lead',
            isTurkish: true,
          },
        ],
      });
      expect(ok).toBe(true);
    }
  });

  afterAll(async () => {
    if (seeded) {
      const keys = RAG_EXCLUDED_PROJECT_IDS.map(keyOf);
      await prisma.cordisParticipation.deleteMany({ where: { projectId: { in: presentIds(keys) } } });
      await prisma.cordisProjectTopic.deleteMany({ where: { projectId: { in: presentIds(keys) } } });
      await prisma.cordisProject.deleteMany({ where: { id: { in: presentIds(keys) } } });
      await prisma.cordisOrganization.deleteMany({
        where: { organisationId: { in: presentIds(RAG_EXCLUDED_PROJECT_IDS.map(orgOf)) } },
      });
      // Documents the re-index wrote for this run's rows only (Chunk rows cascade). Titles carry RUN.
      await prisma.document.deleteMany({
        where: { tenantId: null, kind: 'CORDIS_PROJECT', title: { contains: RUN } },
      });
    }
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  test('the CORDIS re-index sends none of the excluded keep.eu projects to the embedding model', async () => {
    // The rows exist and are the newest imports, so an unfiltered re-index would pick them.
    const stored = await prisma.cordisProject.count({
      where: { id: { in: RAG_EXCLUDED_PROJECT_IDS.map(keyOf) } },
    });
    expect(stored).toBe(5);

    await syncCordisBigData();

    const texts = embedTextMock.mock.calls.map((c) => String(c[0]));
    expect(texts.filter((t) => t.includes(RUN))).toEqual([]);
    for (const id of RAG_EXCLUDED_PROJECT_IDS) {
      expect(texts.some((t) => t.includes(keyOf(id)))).toBe(false);
    }
    const leakedDocs = await prisma.document.count({
      where: { kind: 'CORDIS_PROJECT', title: { contains: RUN } },
    });
    expect(leakedDocs).toBe(0);
  });
});
