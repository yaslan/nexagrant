import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * K1 embeddings (TASK-MUN7C48UHPOGI) — the run against a stand-in database and
 * a stubbed `fetch`, with the REAL `embedText` in between, so every provider
 * call is counted where it leaves the process and every AiUsageLog row is the
 * one the adapter really writes. The Postgres side (pgvector cast, RLS on
 * TenantProfile, the updatedAt guard) is pinned in
 * tests/k1-embeddings.live.test.ts.
 */

interface TopicRow {
  id: string;
  title: string;
  keywords: string[];
  description: string | null;
  status: 'OPEN' | 'FORTHCOMING' | 'CLOSED';
  embedding: string | null;
  embeddingHash: string | null;
  updatedAt: Date;
}
interface ProfileRow {
  tenantId: string;
  capabilities: string;
  keywords: string[];
  embedding: string | null;
  embeddingHash: string | null;
  updatedAt: Date;
}

const db = vi.hoisted(() => ({
  topics: [] as TopicRow[],
  profiles: [] as ProfileRow[],
  tenants: [] as Array<{ id: string; deletedAt: Date | null }>,
  usage: [] as Array<Record<string, unknown>>,
  expired: new Set<string>(),
  /** Scopes a TenantProfile statement ran under; `null` = no tenant scope. */
  profileScopes: [] as Array<string | null>,
  /** Called between a read and the write that follows it, to simulate a concurrent edit. */
  beforeWrite: null as null | ((id: string) => void),
}));

function makeClient(scope: string | null) {
  const sql = (s: TemplateStringsArray) => s.join('?');
  return {
    async $queryRaw(strings: TemplateStringsArray, ...v: unknown[]) {
      const q = sql(strings);
      if (q.includes('FROM "Topic"')) {
        const [cursor, only, , limit] = v as [string, string[] | null, string[] | null, number];
        return db.topics
          .filter((t) => t.status !== 'CLOSED' && t.id > cursor && (only === null || only.includes(t.id)))
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .slice(0, limit)
          .map((t) => ({ ...t, keywords: [...t.keywords], hasEmbedding: t.embedding !== null }));
      }
      if (q.includes('FROM "TenantProfile"')) {
        db.profileScopes.push(scope);
        const [tenantId] = v as [string];
        if (scope !== tenantId) return []; // RLS: another tenant's row is invisible
        return db.profiles.filter((p) => p.tenantId === tenantId).map((p) => ({ ...p, hasEmbedding: p.embedding !== null }));
      }
      throw new Error(`unexpected query: ${q}`);
    },
    async $executeRaw(strings: TemplateStringsArray, ...v: unknown[]) {
      const q = sql(strings);
      const [vec, hash, id, updatedAt] = v as [string, string, string, Date];
      db.beforeWrite?.(id);
      if (q.includes('UPDATE "Topic"')) {
        const t = db.topics.find((r) => r.id === id && r.updatedAt.getTime() === updatedAt.getTime());
        if (!t) return 0;
        t.embedding = vec;
        t.embeddingHash = hash;
        return 1;
      }
      if (q.includes('UPDATE "TenantProfile"')) {
        db.profileScopes.push(scope);
        if (scope !== id) return 0;
        const p = db.profiles.find((r) => r.tenantId === id && r.updatedAt.getTime() === updatedAt.getTime());
        if (!p) return 0;
        p.embedding = vec;
        p.embeddingHash = hash;
        return 1;
      }
      throw new Error(`unexpected statement: ${q}`);
    },
    tenant: {
      findMany: async ({ where, take }: { where: { id: { gt: string; in?: string[] } }; take: number }) =>
        db.tenants
          .filter((t) => t.deletedAt === null && t.id > where.id.gt && (!where.id.in || where.id.in.includes(t.id)))
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .slice(0, take)
          .map((t) => ({ id: t.id })),
      findUnique: async ({ where }: { where: { id: string } }) => db.tenants.find((t) => t.id === where.id) ?? null,
    },
    aiUsageLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (data.tenantId !== scope) throw new Error('42501 AiUsageLog WITH CHECK');
        db.usage.push(data);
        return data;
      },
    },
  };
}

vi.mock('@/lib/db', () => ({
  prisma: makeClient(null),
  withTenant: async (tenantId: string, cb: (tx: unknown) => Promise<unknown>) => cb(makeClient(tenantId)),
}));
vi.mock('@/lib/billing/pilot', () => ({
  getPilotState: async (tenantId: string) => ({ kind: db.expired.has(tenantId) ? 'expired' : 'active' }),
  assertTenantWritable: async (tenantId: string) => {
    if (db.expired.has(tenantId)) throw new Error('pilot expired');
  },
}));
const mockEnv = vi.hoisted(() => ({
  OPENAI_API_KEY: 'sk-test-key' as string | undefined,
  K1_EMBEDDING_MAX_USD_PER_RUN: '0.05',
  NODE_ENV: 'test',
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const {
  runK1Embeddings,
  embeddingHash,
  topicEmbeddingText,
  estimateEmbeddingUsd,
  MAX_EMBED_CHARS,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  TOPIC_EMBEDDING_PURPOSE,
  PROFILE_EMBEDDING_PURPOSE,
} = await import('./embeddings');
const { AiUsageLogWriteError } = await import('@/lib/llm');

const T0 = new Date('2026-09-01T00:00:00Z');
function topic(id: string, over: Partial<TopicRow> = {}): TopicRow {
  return { id, title: `Topic ${id}`, keywords: ['hydrogen', 'storage'], description: `Scope of ${id}.`, status: 'OPEN', embedding: null, embeddingHash: null, updatedAt: T0, ...over };
}
function profile(tenantId: string, over: Partial<ProfileRow> = {}): ProfileRow {
  return { tenantId, capabilities: `R&D of ${tenantId}`, keywords: ['ai'], embedding: null, embeddingHash: null, updatedAt: T0, ...over };
}

let fetchMock: ReturnType<typeof vi.fn>;
/** Bodies the provider received. */
const sent: Array<{ model: string; input: string; dimensions: number }> = [];
function stubProvider(respond?: (input: string, n: number) => { ok: boolean; status?: number }) {
  let n = 0;
  fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    const r = respond?.(body.input, ++n) ?? { ok: true };
    if (!r.ok) return { ok: false, status: r.status ?? 500, text: async () => 'upstream error' };
    return {
      ok: true,
      json: async () => ({ data: [{ embedding: new Array(1536).fill(0.01) }], usage: { prompt_tokens: 10 } }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  db.topics = [topic('a'), topic('b'), topic('c', { status: 'FORTHCOMING' }), topic('z', { status: 'CLOSED' })];
  db.tenants = [{ id: 't1', deletedAt: null }, { id: 't2', deletedAt: null }];
  db.profiles = [profile('t1'), profile('t2')];
  db.usage = [];
  db.expired = new Set();
  db.profileScopes = [];
  db.beforeWrite = null;
  sent.length = 0;
  mockEnv.OPENAI_API_KEY = 'sk-test-key';
  mockEnv.K1_EMBEDDING_MAX_USD_PER_RUN = '0.05';
  stubProvider();
});
afterEach(() => vi.unstubAllGlobals());

describe('runK1Embeddings — sweep', () => {
  it('embeds every open/forthcoming topic and every profile, once each, through embedText', async () => {
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ topicsEmbedded: 3, profilesEmbedded: 2, failed: 0, budgetExhausted: false, aborted: false });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(db.topics.find((t) => t.id === 'z')!.embedding).toBeNull(); // CLOSED is never paid for
    for (const b of sent) expect(b).toMatchObject({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS });
    // Every call recorded: topics under the platform scope, profiles under their own tenant.
    expect(db.usage.map((u) => [u.tenantId, u.purpose, u.module])).toEqual([
      ['__platform__', TOPIC_EMBEDDING_PURPOSE, 'K1'],
      ['__platform__', TOPIC_EMBEDDING_PURPOSE, 'K1'],
      ['__platform__', TOPIC_EMBEDDING_PURPOSE, 'K1'],
      ['t1', PROFILE_EMBEDDING_PURPOSE, 'K1'],
      ['t2', PROFILE_EMBEDDING_PURPOSE, 'K1'],
    ]);
    expect(db.topics.find((t) => t.id === 'a')!.embeddingHash).toBe(embeddingHash(topicEmbeddingText(db.topics[0]!)));
  });

  it('is idempotent: a second run over unchanged rows makes 0 provider calls', async () => {
    await runK1Embeddings();
    fetchMock.mockClear();
    const r = await runK1Embeddings();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ topicsEmbedded: 0, topicsUpToDate: 3, profilesEmbedded: 0, profilesUpToDate: 2, estimatedUsd: 0 });
  });

  it('re-embeds exactly the rows whose text changed', async () => {
    await runK1Embeddings();
    fetchMock.mockClear();
    sent.length = 0;
    db.topics.find((t) => t.id === 'b')!.description = 'A new scope.';
    db.profiles.find((p) => p.tenantId === 't2')!.keywords = ['ai', 'robotics'];
    const r = await runK1Embeddings();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent.map((s) => s.input)).toEqual([expect.stringContaining('A new scope.'), expect.stringContaining('robotics')]);
    expect(r).toMatchObject({ topicsEmbedded: 1, topicsUpToDate: 2, profilesEmbedded: 1, profilesUpToDate: 1 });
  });

  it('a vector with no hash (made elsewhere) is re-embedded once', async () => {
    db.topics = [topic('a', { embedding: '[0]', embeddingHash: null })];
    db.profiles = [];
    expect((await runK1Embeddings()).topicsEmbedded).toBe(1);
    expect((await runK1Embeddings()).topicsEmbedded).toBe(0);
  });

  it('a stored hash with no vector is embedded', async () => {
    const t = topic('a');
    t.embeddingHash = embeddingHash(topicEmbeddingText(t));
    db.topics = [t];
    db.profiles = [];
    expect((await runK1Embeddings()).topicsEmbedded).toBe(1);
  });

  it('pages through every topic and tenant at a small page size', async () => {
    db.topics = Array.from({ length: 7 }, (_, i) => topic(`t${String(i).padStart(2, '0')}`));
    db.tenants = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, deletedAt: null }));
    db.profiles = db.tenants.map((t) => profile(t.id));
    const r = await runK1Embeddings({ pageSize: 2 });
    expect(r).toMatchObject({ topicsEmbedded: 7, profilesEmbedded: 5 });
  });

  it('topicIds / tenantIds narrow the sweep; an empty list narrows it to nothing', async () => {
    let r = await runK1Embeddings({ topicIds: ['b'], tenantIds: ['t2'] });
    expect(r).toMatchObject({ topicsEmbedded: 1, profilesEmbedded: 1 });
    expect(db.topics.filter((t) => t.embedding !== null).map((t) => t.id)).toEqual(['b']);
    fetchMock.mockClear();
    r = await runK1Embeddings({ topicIds: [], tenantIds: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ topicsScanned: 0, profilesScanned: 0 });
  });

  it('an empty topic is counted, not sent', async () => {
    db.topics = [topic('a', { title: ' ', keywords: [], description: null })];
    db.profiles = [];
    const r = await runK1Embeddings();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.topicsEmpty).toBe(1);
  });

  it('caps the text at MAX_EMBED_CHARS (the model takes 8191 tokens)', async () => {
    db.topics = [topic('a', { description: 'x'.repeat(40_000) })];
    db.profiles = [];
    await runK1Embeddings();
    expect(sent[0]!.input.length).toBe(MAX_EMBED_CHARS);
  });
});

describe('runK1Embeddings — spend cap', () => {
  it('stops before the call that would cross the cap; the next run continues', async () => {
    const one = estimateEmbeddingUsd(topicEmbeddingText(db.topics[0]!));
    const r = await runK1Embeddings({ maxUsd: one * 2.5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ topicsEmbedded: 2, budgetExhausted: true, profilesEmbedded: 0 });
    expect(r.estimatedUsd).toBeLessThanOrEqual(r.maxUsd);
    const r2 = await runK1Embeddings({ maxUsd: 1 });
    expect(r2).toMatchObject({ topicsEmbedded: 1, topicsUpToDate: 2, profilesEmbedded: 2, budgetExhausted: false });
  });

  it('a 0 cap makes no call at all', async () => {
    const r = await runK1Embeddings({ maxUsd: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.budgetExhausted).toBe(true);
  });

  it('reads the default cap from K1_EMBEDDING_MAX_USD_PER_RUN', async () => {
    mockEnv.K1_EMBEDDING_MAX_USD_PER_RUN = '0';
    const r = await runK1Embeddings();
    expect(r.maxUsd).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('runK1Embeddings — tenants', () => {
  it('reads and writes each profile under its own tenant scope only', async () => {
    await runK1Embeddings();
    expect(db.profileScopes.length).toBeGreaterThan(0);
    expect(db.profileScopes.every((s) => s === 't1' || s === 't2')).toBe(true);
    expect(db.profiles.every((p) => p.embedding !== null)).toBe(true);
  });

  it('an expired pilot is neither embedded nor paid for', async () => {
    db.expired.add('t2');
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ profilesEmbedded: 1, profilesPilotExpired: 1 });
    expect(db.profiles.find((p) => p.tenantId === 't2')!.embedding).toBeNull();
    expect(db.usage.some((u) => u.tenantId === 't2')).toBe(false);
  });

  it('a deleted tenant is not read', async () => {
    db.tenants[1]!.deletedAt = T0;
    const r = await runK1Embeddings({ tenantId: 't2' });
    expect(r.profilesScanned).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('{ tenantId } embeds that profile only and no topic', async () => {
    const r = await runK1Embeddings({ tenantId: 't1' });
    expect(r).toMatchObject({ topicsScanned: 0, profilesEmbedded: 1 });
    expect(db.profiles.find((p) => p.tenantId === 't2')!.embedding).toBeNull();
    expect(db.usage.map((u) => u.tenantId)).toEqual(['t1']);
  });

  it('refuses an empty tenant id instead of reading with an undefined where', async () => {
    await expect(runK1Embeddings({ tenantId: '' })).rejects.toThrow('tenantId is missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a row edited while its vector was being made is left for the next run', async () => {
    db.topics = [topic('a')];
    db.profiles = [];
    db.beforeWrite = (id) => {
      db.topics.find((t) => t.id === id)!.updatedAt = new Date('2026-09-02T00:00:00Z');
    };
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ topicsEmbedded: 0, raced: 1 });
    expect(db.topics[0]!.embedding).toBeNull();
  });
});

describe('runK1Embeddings — failures', () => {
  it('no API key: nothing attempted', async () => {
    mockEnv.OPENAI_API_KEY = undefined;
    const r = await runK1Embeddings();
    expect(r.skipped).toBe('no_api_key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('one rejected topic is counted and the run goes on', async () => {
    stubProvider((_input, n) => (n === 2 ? { ok: false, status: 400 } : { ok: true }));
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ failed: 1, topicsEmbedded: 2, profilesEmbedded: 2, aborted: false });
    expect(r.errors[0]).toContain('400');
    expect(r.errors.join()).not.toContain('sk-test-key');
  });

  it('three failures in a row stop the run (bad key, outage)', async () => {
    stubProvider(() => ({ ok: false, status: 401 }));
    const r = await runK1Embeddings();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ failed: 3, aborted: true, topicsEmbedded: 0 });
  });

  it('a provider call whose AiUsageLog row could not be written is never swallowed', async () => {
    const embed = vi.fn(async () => {
      throw new AiUsageLogWriteError('no row');
    });
    await expect(runK1Embeddings({ embed })).rejects.toBeInstanceOf(AiUsageLogWriteError);
  });

  it('a vector of the wrong size is refused, not stored', async () => {
    const embed = vi.fn(async () => [0.1, 0.2]);
    db.profiles = [];
    const r = await runK1Embeddings({ embed });
    expect(r.failed).toBeGreaterThan(0);
    expect(db.topics.every((t) => t.embedding === null)).toBe(true);
  });
});
