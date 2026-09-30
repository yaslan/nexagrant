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
      // A refused row only has its hash marked: no vector parameter.
      const marksOnly = !q.includes('embedding =');
      const [vec, hash, id, updatedAt] = (marksOnly ? [undefined, ...v] : v) as [string | undefined, string, string, Date];
      db.beforeWrite?.(id);
      if (q.includes('UPDATE "Topic"')) {
        const t = db.topics.find((r) => r.id === id && r.updatedAt.getTime() === updatedAt.getTime());
        if (!t) return 0;
        if (!marksOnly) t.embedding = vec!;
        t.embeddingHash = hash;
        return 1;
      }
      if (q.includes('UPDATE "TenantProfile"')) {
        db.profileScopes.push(scope);
        if (scope !== id) return 0;
        const p = db.profiles.find((r) => r.tenantId === id && r.updatedAt.getTime() === updatedAt.getTime());
        if (!p) return 0;
        if (!marksOnly) p.embedding = vec!;
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
  estimateEmbeddingTokens,
  utf8Prefix,
  needsEmbedding,
  MAX_EMBED_CHARS,
  MAX_EMBED_TOKENS_ESTIMATE,
  FALLBACK_EMBED_BYTES,
  REJECTED_HASH_PREFIX,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  TOPIC_EMBEDDING_PURPOSE,
  PROFILE_EMBEDDING_PURPOSE,
  EMBEDDING_PROBE_TEXT,
  PROBE_EMBEDDING_PURPOSE,
} = await import('./embeddings');
const { AiUsageLogWriteError } = await import('@/lib/llm');
const tokenFixture = (await import('../../../tests/fixtures/cl100k-token-samples.json')).default as {
  samples: Array<{ id: string; text: string; tokens: number; cutChars?: number; cutTokens?: number }>;
};

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
function stubProvider(respond?: (input: string, n: number) => { ok: boolean; status?: number; body?: string }) {
  let n = 0;
  fetchMock = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    const r = respond?.(body.input, ++n) ?? { ok: true };
    if (!r.ok) return { ok: false, status: r.status ?? 500, text: async () => r.body ?? 'upstream error' };
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
  it('embeds every profile, then every open/forthcoming topic, once each, through embedText', async () => {
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ topicsEmbedded: 3, profilesEmbedded: 2, failed: 0, budgetExhausted: false, aborted: false });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(db.topics.find((t) => t.id === 'z')!.embedding).toBeNull(); // CLOSED is never paid for
    for (const b of sent) expect(b).toMatchObject({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS });
    // Every call recorded: topics under the platform scope, profiles under their own tenant.
    expect(db.usage.map((u) => [u.tenantId, u.purpose, u.module])).toEqual([
      ['t1', PROFILE_EMBEDDING_PURPOSE, 'K1'],
      ['t2', PROFILE_EMBEDDING_PURPOSE, 'K1'],
      ['__platform__', TOPIC_EMBEDDING_PURPOSE, 'K1'],
      ['__platform__', TOPIC_EMBEDDING_PURPOSE, 'K1'],
      ['__platform__', TOPIC_EMBEDDING_PURPOSE, 'K1'],
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
    expect(sent.map((s) => s.input)).toEqual([expect.stringContaining('robotics'), expect.stringContaining('A new scope.')]);
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

  it('also cuts at MAX_EMBED_TOKENS_ESTIMATE: 16 000 characters of Greek are not sent whole (İNCELEME-55 B-1)', async () => {
    const el = tokenFixture.samples.find((x) => x.id === 'el-16k')!;
    expect(el.tokens).toBeGreaterThan(8191); // the 400 the reviewer got
    db.topics = [topic('a', { title: 'Υδρογόνο', keywords: [], description: el.text })];
    db.profiles = [];
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ topicsEmbedded: 1, failed: 0 });
    expect(sent[0]!.input.length).toBeLessThan(el.text.length);
    expect(estimateEmbeddingTokens(sent[0]!.input)).toBeLessThanOrEqual(MAX_EMBED_TOKENS_ESTIMATE);
  });

  it('never cuts inside a surrogate pair', () => {
    const t = topicEmbeddingText({ title: '🚀'.repeat(5000), keywords: [], description: null });
    expect(estimateEmbeddingTokens(t)).toBeLessThanOrEqual(MAX_EMBED_TOKENS_ESTIMATE);
    expect(t).toBe('🚀'.repeat(t.length / 2));
    expect(utf8Prefix('aé🚀', 4)).toBe('aé');
    expect(Buffer.byteLength(utf8Prefix('ж'.repeat(9000), FALLBACK_EMBED_BYTES))).toBe(FALLBACK_EMBED_BYTES);
  });
});

describe('estimateEmbeddingTokens — floor against the real tokenizer (İNCELEME-55 B-2/B-3)', () => {
  // Real cl100k_base counts, pinned in the fixture: the estimate may over-count
  // (a looser cap, a shorter text) but must never under-count natural text,
  // or the cap is crossed and the token limit is hit.
  it.each(tokenFixture.samples.map((x) => [x.id, x] as const))('%s: estimate >= real tokens', (_id, x) => {
    expect(estimateEmbeddingTokens(x.text)).toBeGreaterThanOrEqual(x.tokens);
  });

  it('Turkish long text is no longer under-counted (was 5334 est for 5667 real in İNCELEME-55)', () => {
    const tr = tokenFixture.samples.find((x) => x.id === 'tr-16k')!;
    expect(estimateEmbeddingTokens(tr.text)).toBeGreaterThanOrEqual(tr.tokens);
    expect(Math.ceil(tr.text.length / 3)).toBeLessThan(tr.tokens); // the old 3 chars/token rule
  });

  it('upper-case Greek and Cyrillic are not under-counted (İNCELEME-85 Y-2: all-caps Greek was 0.62x real)', () => {
    for (const id of ['el-caps', 'el2-caps', 'ru-caps', 'bg-caps', 'uk-caps', 'sr-caps', 'mn-caps', 'kk-caps', 'el-caps-16k', 'ru-caps-16k']) {
      const x = tokenFixture.samples.find((s) => s.id === id)!;
      expect(estimateEmbeddingTokens(x.text), id).toBeGreaterThanOrEqual(x.tokens);
    }
    // Lower case keeps its weight: the same text in lower case is estimated well under its capitals.
    const el = tokenFixture.samples.find((s) => s.id === 'el')!;
    expect(estimateEmbeddingTokens(el.text)).toBeLessThan(0.7 * estimateEmbeddingTokens(el.text.toUpperCase()));
  });

  it('what is kept of 16 000 all-caps characters stays under the model limit in real tokens', () => {
    for (const id of ['el-caps-16k', 'ru-caps-16k']) {
      const x = tokenFixture.samples.find((s) => s.id === id)!;
      expect(x.tokens, id).toBeGreaterThan(8191); // whole, the model refuses it
      // The fixture pins what topicEmbeddingText keeps and its real count; a looser cut or weight moves the length.
      expect(topicEmbeddingText({ title: x.text, keywords: [], description: null }).length, id).toBe(x.cutChars);
      expect(x.cutTokens!, id).toBeLessThanOrEqual(8191);
    }
  });

  it('stays within 2x of real for the catalogue languages, so the cap is not needlessly tight', () => {
    for (const id of ['en', 'tr', 'tr2', 'de', 'fr', 'pl', 'el', 'ru', 'bg', 'uk', 'zh', 'tr-16k', 'el-16k', 'ru-16k']) {
      const x = tokenFixture.samples.find((s) => s.id === id)!;
      expect(estimateEmbeddingTokens(x.text), id).toBeLessThanOrEqual(2 * x.tokens);
    }
  });

  it('the USD estimate is the token estimate at the published price', () => {
    const tr = tokenFixture.samples.find((x) => x.id === 'tr')!;
    expect(estimateEmbeddingUsd(tr.text)).toBeCloseTo((estimateEmbeddingTokens(tr.text) * 0.13) / 1e6, 12);
    expect(estimateEmbeddingUsd(tr.text)).toBeGreaterThanOrEqual((tr.tokens * 0.13) / 1e6);
  });
});

describe('runK1Embeddings — spend cap', () => {
  it('stops before the call that would cross the cap; the next run continues', async () => {
    db.tenants = [];
    db.profiles = [];
    const one = estimateEmbeddingUsd(topicEmbeddingText(db.topics[0]!));
    const r = await runK1Embeddings({ maxUsd: one * 2.5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ topicsEmbedded: 2, budgetExhausted: true });
    expect(r.estimatedUsd).toBeLessThanOrEqual(r.maxUsd);
    const r2 = await runK1Embeddings({ maxUsd: 1 });
    expect(r2).toMatchObject({ topicsEmbedded: 1, topicsUpToDate: 2, budgetExhausted: false });
  });

  it('profiles go first: a cap the topic backfill would eat still leaves every profile embedded (İNCELEME-55 B-4)', async () => {
    const profilesUsd = db.profiles.reduce((sum, p) => sum + estimateEmbeddingUsd(`${p.capabilities}\n\n${p.keywords.join(', ')}`), 0);
    const r = await runK1Embeddings({ maxUsd: profilesUsd * 1.01 });
    expect(r).toMatchObject({ profilesEmbedded: 2, topicsEmbedded: 0, budgetExhausted: true });
    expect(db.usage.map((u) => u.tenantId)).toEqual(['t1', 't2']);
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

  it('one rejected topic is counted, marked and the run goes on', async () => {
    stubProvider((input) => (input.startsWith('Topic b') ? { ok: false, status: 400 } : { ok: true }));
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ failed: 1, rejected: 1, topicsEmbedded: 2, profilesEmbedded: 2, aborted: false });
    expect(r.errors[0]).toContain('400');
    expect(r.errors.join()).not.toContain('sk-test-key');
    const b = db.topics.find((t) => t.id === 'b')!;
    expect(b.embedding).toBeNull();
    expect(b.embeddingHash).toBe(REJECTED_HASH_PREFIX + embeddingHash(topicEmbeddingText(b)));
  });

  /** Refuses what the real model would: more than 8191 tokens, with bytes as the stand-in count. */
  const tokenLimit = (input: string) => (Buffer.byteLength(input) > 8191 ? { ok: false, status: 400 } : { ok: true });

  it('a 400 on a long text is retried once on a byte-safe prefix, and that vector is kept', async () => {
    const el = tokenFixture.samples.find((x) => x.id === 'el-16k')!;
    db.topics = [topic('a', { title: 'Υδρογόνο', keywords: [], description: el.text })];
    db.profiles = [];
    stubProvider(tokenLimit);
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ topicsEmbedded: 1, shortened: 1, failed: 0, rejected: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Buffer.byteLength(sent[1]!.input)).toBeLessThanOrEqual(FALLBACK_EMBED_BYTES);
    expect(sent[0]!.input.startsWith(sent[1]!.input)).toBe(true);
    // Stored under the full text's hash: the next run does not send it again.
    fetchMock.mockClear();
    expect(await runK1Embeddings()).toMatchObject({ topicsUpToDate: 1, topicsEmbedded: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('three refused long rows in a row no longer stop the run every night (İNCELEME-55 B-1 STALL)', async () => {
    const el = tokenFixture.samples.find((x) => x.id === 'el-16k')!;
    db.topics = [
      topic('a', { description: el.text }),
      topic('b', { description: el.text + ' β' }),
      topic('c', { description: el.text + ' γ' }),
      topic('d'),
      topic('e'),
    ];
    // Refuses anything Greek, however short: the retry cannot save these rows.
    stubProvider((input) => (/[α-ω]/.test(input) ? { ok: false, status: 400 } : { ok: true }));
    const r1 = await runK1Embeddings();
    expect(r1).toMatchObject({ rejected: 3, failed: 3, aborted: false, topicsEmbedded: 2, profilesEmbedded: 2 });
    expect(db.topics.filter((t) => t.embedding !== null).map((t) => t.id)).toEqual(['d', 'e']);
    // Night two: the refused rows are skipped without a call.
    fetchMock.mockClear();
    const r2 = await runK1Embeddings();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r2).toMatchObject({ previouslyRejected: 3, failed: 0, aborted: false, topicsUpToDate: 2 });
    // A new text is a new hash: it is tried again.
    db.topics.find((t) => t.id === 'a')!.description = 'Hydrogen tanks, now in English.';
    const r3 = await runK1Embeddings();
    expect(r3).toMatchObject({ topicsEmbedded: 1, previouslyRejected: 2 });
  });

  it('a refused profile is marked under its own tenant and skipped next time', async () => {
    db.topics = [];
    stubProvider((input) => (input.includes('t2') ? { ok: false, status: 400 } : { ok: true }));
    expect(await runK1Embeddings()).toMatchObject({ profilesEmbedded: 1, rejected: 1 });
    expect(db.profiles.find((p) => p.tenantId === 't2')!.embeddingHash).toMatch(new RegExp(`^${REJECTED_HASH_PREFIX}`));
    expect(db.profileScopes.every((s) => s === 't1' || s === 't2')).toBe(true);
    // The probe is the platform's check, not the tenant's spend.
    expect(db.usage.filter((u) => u.purpose === PROBE_EMBEDDING_PURPOSE).map((u) => u.tenantId)).toEqual(['__platform__']);
    fetchMock.mockClear();
    expect(await runK1Embeddings()).toMatchObject({ previouslyRejected: 1, profilesUpToDate: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** Every request refused, as a wrong model, `dimensions` or gateway would: nothing about the rows. */
  const requestRefused = () => ({ ok: false, status: 400, body: '{"error":{"message":"This model does not support specifying dimensions.","type":"invalid_request_error"}}' });

  it('a refused request is not a refused row: nothing is marked and the run stops (İNCELEME-85 Y-1)', async () => {
    db.topics = Array.from({ length: 12 }, (_, i) => topic(`t${String(i).padStart(2, '0')}`));
    stubProvider(requestRefused);
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ rejected: 0, aborted: true, requestRefused: true, profilesEmbedded: 0, topicsEmbedded: 0 });
    // The first profile, then the probe: two calls, then the run stops.
    expect(sent.map((x) => x.input)).toEqual([sent[0]!.input, EMBEDDING_PROBE_TEXT]);
    expect(sent[0]!.input).toContain('R&D of t1');
    expect(db.profiles.every((p) => p.embeddingHash === null)).toBe(true);
    expect(db.topics.every((t) => t.embeddingHash === null)).toBe(true);
    expect(r.errors).toHaveLength(2);
  });

  it('night after night of refused requests locks no row; once fixed, every row is embedded (S5)', async () => {
    db.topics = Array.from({ length: 12 }, (_, i) => topic(`t${String(i).padStart(2, '0')}`));
    stubProvider(requestRefused);
    for (let night = 0; night < 4; night++) {
      expect(await runK1Embeddings()).toMatchObject({ rejected: 0, requestRefused: true });
      expect([...db.profiles, ...db.topics].filter((x) => x.embeddingHash?.startsWith(REJECTED_HASH_PREFIX))).toHaveLength(0);
    }
    stubProvider();
    const fixed = await runK1Embeddings();
    expect(fixed).toMatchObject({ profilesEmbedded: 2, topicsEmbedded: 12, previouslyRejected: 0, requestRefused: false, aborted: false });
  });

  it('a refused row is marked only after the probe is embedded, and the probe is booked to the platform', async () => {
    db.topics = [topic('a')];
    db.profiles = [];
    stubProvider((input) => (input === EMBEDDING_PROBE_TEXT ? { ok: true } : { ok: false, status: 400 }));
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ rejected: 1, requestRefused: false, aborted: false });
    expect(sent.map((x) => x.input)).toEqual([topicEmbeddingText(db.topics[0]!), EMBEDDING_PROBE_TEXT]);
    expect(db.topics[0]!.embeddingHash).toBe(REJECTED_HASH_PREFIX + embeddingHash(topicEmbeddingText(db.topics[0]!)));
    expect(db.usage).toEqual([expect.objectContaining({ tenantId: '__platform__', module: 'K1', purpose: PROBE_EMBEDDING_PURPOSE })]);
  });

  it('a probe that hits an outage judges nothing: the row is not marked, the failure counts towards the streak', async () => {
    db.topics = [topic('a'), topic('b')];
    db.profiles = [];
    stubProvider((input) => (input === EMBEDDING_PROBE_TEXT ? { ok: false, status: 429 } : input.startsWith('Topic a') ? { ok: false, status: 400 } : { ok: false, status: 503 }));
    const r = await runK1Embeddings();
    // a 400 + probe 429 (1), b 503 (2): not yet three.
    expect(r).toMatchObject({ rejected: 0, requestRefused: false, aborted: false, failed: 2 });
    expect(db.topics.every((t) => t.embeddingHash === null)).toBe(true);
    // Next run, the provider is back: a is judged again (and embedded).
    stubProvider();
    expect(await runK1Embeddings()).toMatchObject({ topicsEmbedded: 2 });
  });

  it('no room left under the cap for the probe: the row is not marked and is tried next run', async () => {
    db.topics = [topic('a')];
    db.profiles = [];
    stubProvider((input) => (input === EMBEDDING_PROBE_TEXT ? { ok: true } : { ok: false, status: 400 }));
    const r = await runK1Embeddings({ maxUsd: estimateEmbeddingUsd(topicEmbeddingText(db.topics[0]!)) });
    expect(r).toMatchObject({ rejected: 0, budgetExhausted: true });
    expect(sent).toHaveLength(1);
    expect(db.topics[0]!.embeddingHash).toBeNull();
  });

  it('a refused row between system failures does not reset their streak, and is not marked while the provider is down', async () => {
    db.topics = ['a', 'b', 'c', 'd', 'e'].map((id) => topic(id));
    db.profiles = [];
    stubProvider((input) => (input.startsWith('Topic b') ? { ok: false, status: 400 } : { ok: false, status: 503 }));
    const r = await runK1Embeddings();
    // a 503, b 400 + probe 503, c 503: three system failures, the run stops before d.
    expect(r).toMatchObject({ aborted: true, rejected: 0, failed: 3 });
    expect(sent.map((x) => x.input.split('\n')[0])).toEqual(['Topic a', 'Topic b', EMBEDDING_PROBE_TEXT, 'Topic c']);
    expect(db.topics.every((t) => t.embeddingHash === null)).toBe(true);
  });

  it('429s are an outage, never a refusal: three stop the run, no probe, no mark (İNCELEME-85 N1)', async () => {
    stubProvider(() => ({ ok: false, status: 429 }));
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ aborted: true, rejected: 0, failed: 3, requestRefused: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sent.some((x) => x.input === EMBEDDING_PROBE_TEXT)).toBe(false);
    expect([...db.profiles, ...db.topics].every((x) => x.embeddingHash === null)).toBe(true);
  });

  it('a 413 is a refusal of the input too: retried on the byte-safe prefix (İNCELEME-85 N2)', async () => {
    const el = tokenFixture.samples.find((x) => x.id === 'el-16k')!;
    db.topics = [topic('a', { description: el.text })];
    db.profiles = [];
    stubProvider((input) => (Buffer.byteLength(input) > 8191 ? { ok: false, status: 413 } : { ok: true }));
    expect(await runK1Embeddings()).toMatchObject({ topicsEmbedded: 1, shortened: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an embedded row breaks a run of refusals: scattered refused rows never stop the run (İNCELEME-85 N4)', async () => {
    db.topics = Array.from({ length: 9 }, (_, i) => topic(`t${i}`));
    db.profiles = [];
    // t0-t3 refused, t4 embedded, t5-t8 refused: never five in a row.
    stubProvider((input) => (input === EMBEDDING_PROBE_TEXT || input.startsWith('Topic t4') ? { ok: true } : { ok: false, status: 400 }));
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ rejected: 8, topicsEmbedded: 1, aborted: false });
  });

  it('five refused rows in a row, each confirmed by the probe, stop the run; the next run goes on past them', async () => {
    db.topics = Array.from({ length: 7 }, (_, i) => topic(`t${i}`));
    db.profiles = [];
    stubProvider((input) => (input === EMBEDDING_PROBE_TEXT || input.startsWith('Topic t6') ? { ok: true } : { ok: false, status: 400 }));
    expect(await runK1Embeddings()).toMatchObject({ rejected: 5, aborted: true, requestRefused: false });
    expect(await runK1Embeddings()).toMatchObject({ rejected: 1, previouslyRejected: 5, topicsEmbedded: 1, aborted: false });
  });

  it('a profile is not marked once its pilot has expired while the probe ran (İNCELEME-85 N6)', async () => {
    db.topics = [];
    db.profiles = [profile('t1')];
    db.tenants = [{ id: 't1', deletedAt: null }];
    stubProvider((input) => {
      if (input === EMBEDDING_PROBE_TEXT) {
        db.expired.add('t1');
        return { ok: true };
      }
      return { ok: false, status: 400 };
    });
    await expect(runK1Embeddings()).rejects.toThrow('pilot expired');
    expect(db.profiles[0]!.embeddingHash).toBeNull();
  });

  it("the provider's body reaches the run's errors as one line of at most 200 characters (İNCELEME-85 N13)", async () => {
    stubProvider(() => ({ ok: false, status: 503, body: `first line ${'x'.repeat(500)}\nsecond line with detail` }));
    const r = await runK1Embeddings();
    expect(r.errors).toHaveLength(3);
    for (const e of r.errors) {
      expect(e).not.toContain('\n');
      expect(e).not.toContain('second line');
      expect(e.length).toBeLessThanOrEqual(200);
    }
  });

  it('needsEmbedding: a row marked refused for this text is not due; for another text it is', () => {
    const h = embeddingHash('x');
    expect(needsEmbedding({ hasEmbedding: false, embeddingHash: REJECTED_HASH_PREFIX + h }, h)).toBe(false);
    expect(needsEmbedding({ hasEmbedding: true, embeddingHash: REJECTED_HASH_PREFIX + h }, h)).toBe(false);
    expect(needsEmbedding({ hasEmbedding: false, embeddingHash: REJECTED_HASH_PREFIX + h }, embeddingHash('y'))).toBe(true);
    expect(needsEmbedding({ hasEmbedding: false, embeddingHash: h }, h)).toBe(true);
  });

  it('a 400 does not reset the system-failure streak, and a 5xx on the prefix retry counts as one', async () => {
    const el = tokenFixture.samples.find((x) => x.id === 'el-16k')!;
    db.topics = [topic('a'), topic('b', { description: el.text }), topic('c'), topic('d')];
    db.profiles = [];
    // a: 503; b: 400 then its prefix 503; c: 503 -> three system failures in a row.
    stubProvider((input) => (Buffer.byteLength(input) > 8191 ? { ok: false, status: 400 } : { ok: false, status: 503 }));
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ aborted: true, rejected: 0, failed: 3 });
    expect(db.topics.every((t) => t.embeddingHash === null)).toBe(true);
  });

  it('a 429 on the prefix retry judges the row on the 429: no probe, no mark, tried again next run (İNCELEME-91 O-1)', async () => {
    const el = tokenFixture.samples.find((x) => x.id === 'el-16k')!;
    db.topics = [topic('a', { title: 'Υδρογόνο', keywords: [], description: el.text })];
    db.profiles = [];
    // The whole text is over the limit, its prefix meets a rate limit, and the probe would be embedded:
    // judged on the first 400, the probe would mark a row nothing is wrong with.
    stubProvider((input) =>
      input === EMBEDDING_PROBE_TEXT ? { ok: true } : Buffer.byteLength(input) > 8191 ? { ok: false, status: 400 } : { ok: false, status: 429 }
    );
    const r = await runK1Embeddings();
    expect(r).toMatchObject({ rejected: 0, failed: 1, shortened: 0, topicsEmbedded: 0, aborted: false });
    expect(sent.map((x) => x.input === EMBEDDING_PROBE_TEXT)).toEqual([false, false]);
    expect(r.errors[0]).toContain('429');
    expect(db.topics[0]!.embeddingHash).toBeNull();
    // Next run the limit has passed: the row is judged again and embedded from its prefix.
    stubProvider(tokenLimit);
    expect(await runK1Embeddings()).toMatchObject({ topicsEmbedded: 1, shortened: 1, rejected: 0, previouslyRejected: 0 });
  });

  it('three system failures in a row stop the run (bad key, outage)', async () => {
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
