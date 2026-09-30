import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Live K1 embeddings (TASK-MUN7C48UHPOGI) — real Postgres + pgvector, real
 * Prisma, the code under test running as `fabrika_app` (NOBYPASSRLS). Fixtures
 * and read-backs go through the owner role.
 *
 * Two parts:
 *   1. Plumbing, with `fakeEmbedding` at the provider boundary: vectors and
 *      hashes land in the real columns, TenantProfile is written under RLS, the
 *      updatedAt guard holds, and k1-topic-match then writes rows. The fake says
 *      nothing about meaning, so nothing here asserts a ranking.
 *   2. Only with K1_EMBEDDINGS_REAL_OPENAI=1: the real `embedText` against
 *      OpenAI on a handful of synthetic rows (a few hundred tokens, < 0.001 USD),
 *      then asserts the ranking k1-topic-match produces from them.
 *
 * The sweep reads the whole Topic catalogue and every tenant, so this suite
 * refuses the shared `fabrika` database outside CI. Point DATABASE_URL /
 * DATABASE_URL_RLS_TEST at a throwaway database (recipe in
 * docs/agent-results/TASK-MUN7C48UHPOGI-se-fb.md).
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const ownerUrl = process.env.DATABASE_URL;
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST;
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma } from '@/lib/db';
import { runK1Embeddings, embeddingHash, profileEmbeddingText, topicEmbeddingText, TOPIC_EMBEDDING_PURPOSE, PROFILE_EMBEDDING_PURPOSE, EMBEDDING_USD_PER_MTOK, REJECTED_HASH_PREFIX, EMBEDDING_PROBE_TEXT } from '@/lib/scoring/embeddings';
import { recomputeAllTopicMatches } from '@/lib/scoring/topic-match';
import { LlmProviderError, PLATFORM_SCOPE_TENANT_ID } from '@/lib/llm';
import { fakeEmbedding } from './helpers/fake-embedding';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'k1 embeddings live test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE
  ? ((await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database()::text AS db`)[0]?.db ?? '')
  : '';
const SHARED = DB_NAME === 'fabrika' && !isCi();
if (SHARED) console.warn(`${SUITE} skipped: the sweep reads every topic and tenant; refusing the shared "fabrika" database`);
const HAS_DB = REACHABLE && !SHARED;
const REAL = HAS_DB && process.env.K1_EMBEDDINGS_REAL_OPENAI === '1';

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const T_A = `t-emb-a-${RUN}`; // hydrogen company
const T_B = `t-emb-b-${RUN}`; // medical-imaging company
const T_PILOT = `t-emb-pl-${RUN}`; // pilot ran out
const TENANTS = [T_A, T_B, T_PILOT];
const PROGRAMME = `P-EMB-${RUN}`;
const CALL = `c-emb-${RUN}`;

const TOPICS = {
  h2: {
    title: 'Innovative solid-state hydrogen storage for heavy-duty transport',
    keywords: ['hydrogen', 'storage', 'fuel cells'],
    description: 'Develop metal-hydride tanks with higher gravimetric density for trucks and ships.',
  },
  med: {
    title: 'AI-assisted medical imaging for early cancer diagnosis',
    keywords: ['medical imaging', 'deep learning', 'oncology'],
    description: 'Validate machine-learning models on MRI and CT scans in hospital settings.',
  },
  agri: {
    title: 'Drones for precision agriculture and soil monitoring',
    keywords: ['agriculture', 'drones', 'soil'],
    description: 'Deploy UAV-based multispectral sensing to reduce fertiliser use on farms.',
  },
} as const;
type TopicKey = keyof typeof TOPICS;
const topicId = (k: TopicKey) => `tp-emb-${k}-${RUN}`;
const MY_TOPICS = (Object.keys(TOPICS) as TopicKey[]).map(topicId);
/** Never matched by k1-topic-match, so never paid for. */
const CLOSED_TOPIC = `tp-emb-closed-${RUN}`;
/** İNCELEME-55 B-1: three long Greek topics in a row, then an ordinary one. */
const LONG_TOPICS = ['a', 'b', 'c', 'z'].map((k) => `tp-emb-long-${k}-${RUN}`);
const GREEK = 'Αναμενόμενα αποτελέσματα: τα έργα αναμένεται να συμβάλουν στην ανάπτυξη ασφαλών λύσεων αποθήκευσης υδρογόνου για βαριές μεταφορές. ';

const PROFILES: Record<string, { capabilities: string; keywords: string[] }> = {
  [T_A]: { capabilities: 'We design metal hydride hydrogen tanks and fuel-cell powertrains for trucks.', keywords: ['hydrogen', 'fuel cells'] },
  [T_B]: { capabilities: 'We build deep-learning software that reads MRI and CT scans for radiologists.', keywords: ['medical imaging', 'AI'] },
  [T_PILOT]: { capabilities: 'Soil sensors and farm drones.', keywords: ['agriculture'] },
};

/** The sweep is global; parallel live files own other topics, so this one touches only its own. */
const MINE = { topicIds: [...MY_TOPICS, CLOSED_TOPIC], tenantIds: TENANTS };

const fake = vi.fn(async (text: string) => fakeEmbedding(text));

async function topicState(id: string) {
  const r = await admin.$queryRaw<Array<{ has: boolean; hash: string | null; dims: number | null }>>`
    SELECT (embedding IS NOT NULL) AS has, "embeddingHash" AS hash, vector_dims(embedding) AS dims FROM "Topic" WHERE id = ${id}`;
  return r[0]!;
}
async function profileState(tenantId: string) {
  const r = await admin.$queryRaw<Array<{ has: boolean; hash: string | null }>>`
    SELECT (embedding IS NOT NULL) AS has, "embeddingHash" AS hash FROM "TenantProfile" WHERE "tenantId" = ${tenantId}`;
  return r[0]!;
}
async function resetVectors() {
  await admin.$executeRaw`UPDATE "Topic" SET embedding = NULL, "embeddingHash" = NULL WHERE id = ANY(${presentIds(MY_TOPICS)})`;
  await admin.$executeRaw`UPDATE "TenantProfile" SET embedding = NULL, "embeddingHash" = NULL WHERE "tenantId" = ANY(${presentIds(TENANTS)})`;
  await admin.topicMatch.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
}

async function wipe() {
  await admin.topicMatch.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await admin.aiUsageLog.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await admin.tenant.deleteMany({ where: { id: { in: presentIds(TENANTS) } } });
  await admin.topic.deleteMany({ where: { id: { in: presentIds([...MY_TOPICS, CLOSED_TOPIC, ...LONG_TOPICS]) } } });
  await admin.call.deleteMany({ where: { id: requireId(CALL, 'call') } });
  await admin.programme.deleteMany({ where: { id: requireId(PROGRAMME, 'programme') } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await admin.programme.create({ data: { id: PROGRAMME, name: 'EMB test', sourceKey: 'test' } });
  await admin.call.create({ data: { id: CALL, programmeId: PROGRAMME, callIdentifier: `EMB-${RUN}`, title: 'EMB call' } });
  for (const [k, t] of Object.entries(TOPICS) as Array<[TopicKey, (typeof TOPICS)[TopicKey]]>) {
    await admin.topic.create({
      data: { id: topicId(k), callId: CALL, identifier: `EMB-${RUN}-${k}`, title: t.title, keywords: [...t.keywords], description: t.description, status: 'OPEN', deadlines: [], eligibility: {} },
    });
  }
  await admin.topic.create({
    data: { id: CLOSED_TOPIC, callId: CALL, identifier: `EMB-${RUN}-closed`, title: 'Closed hydrogen topic', keywords: ['hydrogen'], status: 'CLOSED', deadlines: [], eligibility: {} },
  });
  for (const id of TENANTS) {
    await admin.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
    await admin.tenantProfile.create({ data: { tenantId: id, ...PROFILES[id]!, naceCodes: [], trlRange: [], preferredRoles: [] } });
  }
  await admin.subscription.create({
    data: { tenantId: T_PILOT, planId: 'public-team', status: 'TRIALING', provider: 'pilot', trialEndsAt: new Date(Date.now() - 60_000) },
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('K1 embeddings (live, fabrika_app, fake provider)', () => {
  test('the sweep stores 1536-d vectors and hashes; an expired pilot is not written', async () => {
    fake.mockClear();
    const r = await runK1Embeddings({ ...MINE, embed: fake, maxUsd: 1 });
    expect(r.failed).toBe(0);
    for (const id of MY_TOPICS) expect(await topicState(id)).toMatchObject({ has: true, dims: 1536 });
    expect(await topicState(CLOSED_TOPIC)).toMatchObject({ has: false, hash: null });
    expect(r.topicsScanned).toBe(MY_TOPICS.length);
    expect(await profileState(T_A)).toMatchObject({ has: true, hash: embeddingHash(profileEmbeddingText(PROFILES[T_A]!)) });
    expect(await profileState(T_B)).toMatchObject({ has: true });
    expect(await profileState(T_PILOT)).toMatchObject({ has: false, hash: null });
    expect(r.profilesPilotExpired).toBeGreaterThanOrEqual(1);
  });

  test('a second sweep makes no provider call', async () => {
    fake.mockClear();
    const r = await runK1Embeddings({ ...MINE, embed: fake, maxUsd: 1 });
    expect(fake).not.toHaveBeenCalled();
    expect(r.topicsEmbedded + r.profilesEmbedded).toBe(0);
  });

  test('a changed topic text is re-embedded, only that one', async () => {
    await admin.topic.update({ where: { id: topicId('agri') }, data: { description: 'Now about vineyards.' } });
    fake.mockClear();
    const r = await runK1Embeddings({ ...MINE, embed: fake, maxUsd: 1 });
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls[0]![0]).toContain('vineyards');
    expect(r.topicsEmbedded).toBe(1);
  });

  test('a profile job embeds that tenant under its own RLS scope', async () => {
    await admin.tenantProfile.update({ where: { tenantId: T_B }, data: { capabilities: 'Ultrasound AI for cardiology.' } });
    fake.mockClear();
    const r = await runK1Embeddings({ ...MINE, embed: fake, tenantId: T_B });
    expect(r).toMatchObject({ topicsScanned: 0, profilesEmbedded: 1 });
    expect((await profileState(T_B)).hash).toBe(embeddingHash(profileEmbeddingText({ capabilities: 'Ultrasound AI for cardiology.', keywords: PROFILES[T_B]!.keywords })));
  });

  test('a row edited while its vector is being made keeps no vector (updatedAt guard, real SQL)', async () => {
    await admin.$executeRaw`UPDATE "Topic" SET embedding = NULL, "embeddingHash" = NULL WHERE id = ${topicId('h2')}`;
    const racing = vi.fn(async (text: string) => {
      await admin.topic.update({ where: { id: topicId('h2') }, data: { description: 'Edited mid-run.' } });
      return fakeEmbedding(text);
    });
    const r = await runK1Embeddings({ ...MINE, embed: racing, maxUsd: 1 });
    expect(r.raced).toBe(1);
    expect(await topicState(topicId('h2'))).toMatchObject({ has: false });
    // The next run embeds the edited text.
    const r2 = await runK1Embeddings({ ...MINE, embed: fake, maxUsd: 1 });
    expect(r2.topicsEmbedded).toBe(1);
  });

  test('k1-topic-match now writes rows for the embedded tenants, none for the expired pilot', async () => {
    const r = await recomputeAllTopicMatches(MINE);
    // Rows, not `created`: tests/topic-match-nightly.live.test.ts runs the real
    // k1-topic-match task, an unnarrowed sweep, in parallel, and when it lands
    // between the embedding tests and this one it has already written these
    // rows — this run then counts them as updated/unchanged (1 of 6 created in
    // 2 of 7 full runs, TASK-MUNSRKW0HJYBV Ö-D).
    expect(r.created + r.updated + r.unchanged).toBe(MY_TOPICS.length * 2);
    expect(
      await admin.topicMatch.count({ where: { tenantId: { in: [T_A, T_B] }, topicId: { in: MY_TOPICS }, opportunityId: null } }),
    ).toBe(MY_TOPICS.length * 2);
    expect(r.pilotExpired).toBe(1);
    expect(await admin.topicMatch.count({ where: { tenantId: T_PILOT } })).toBe(0);
  });
});

describe.skipIf(!REAL)('K1 embeddings (live, REAL OpenAI)', () => {
  test('real vectors rank each tenant’s own topic first', async () => {
    await resetVectors();
    const before = new Date();
    const r = await runK1Embeddings({ ...MINE, maxUsd: 0.01 });
    expect(r).toMatchObject({ failed: 0, aborted: false, budgetExhausted: false, profilesEmbedded: 2 });
    expect(r.topicsEmbedded).toBe(MY_TOPICS.length);

    const usage = await admin.aiUsageLog.findMany({
      where: { createdAt: { gte: before }, purpose: { in: [TOPIC_EMBEDDING_PURPOSE, PROFILE_EMBEDDING_PURPOSE] } },
      select: { tenantId: true, purpose: true, inputTokens: true, model: true },
    });
    expect(usage.filter((u) => u.tenantId === PLATFORM_SCOPE_TENANT_ID && u.purpose === TOPIC_EMBEDDING_PURPOSE)).toHaveLength(MY_TOPICS.length);
    expect(usage.filter((u) => u.purpose === PROFILE_EMBEDDING_PURPOSE).map((u) => u.tenantId).sort()).toEqual([T_A, T_B].sort());
    const tokens = usage.reduce((s, u) => s + u.inputTokens, 0);
    console.log(`[k1-embeddings REAL] calls=${usage.length} inputTokens=${tokens} usd=${((tokens / 1e6) * EMBEDDING_USD_PER_MTOK).toFixed(6)} estimatedUsd=${r.estimatedUsd}`);

    const m = await recomputeAllTopicMatches(MINE);
    expect(m.created).toBe(MY_TOPICS.length * 2);
    const rows = await admin.topicMatch.findMany({
      where: { tenantId: { in: [T_A, T_B] }, opportunityId: null },
      select: { tenantId: true, topicId: true, fitScore: true },
      orderBy: { fitScore: 'desc' },
    });
    for (const row of rows) console.log(`[k1-embeddings REAL] ${row.tenantId === T_A ? 'A(hydrogen)' : 'B(cardio-AI)'} × ${row.topicId.split('-')[2]} → ${row.fitScore}`);
    const best = (t: string) => rows.find((x) => x.tenantId === t)!.topicId;
    expect(best(T_A)).toBe(topicId('h2'));
    expect(best(T_B)).toBe(topicId('med'));
  });
});

describe.skipIf(!HAS_DB)('K1 embeddings (live, fabrika_app) — refused rows (İNCELEME-55 B-1)', () => {
  const LONG = { topicIds: LONG_TOPICS, tenantIds: [] as string[] };
  /** A provider that refuses what text-embedding-3-large would, bytes standing in for tokens. */
  const refuse = (text: string) => new LlmProviderError(`OpenAI embeddings error 400: ${text.length} chars`, 400);
  const byteLimited = vi.fn(async (text: string) => {
    if (Buffer.byteLength(text) > 8191) throw refuse(text);
    return fakeEmbedding(text);
  });
  const greekRefused = vi.fn(async (text: string) => {
    if (/[α-ω]/.test(text)) throw refuse(text);
    return fakeEmbedding(text);
  });

  beforeAll(async () => {
    if (!HAS_DB) return;
    for (const [i, id] of LONG_TOPICS.entries()) {
      const long = i < 3;
      await admin.topic.create({
        data: {
          id, callId: CALL, identifier: `EMB-${RUN}-long-${i}`, status: 'OPEN', deadlines: [], eligibility: {},
          title: long ? `Υδρογόνο ${i}` : 'Hydrogen refuelling stations', keywords: [],
          description: long ? GREEK.repeat(160).slice(0, 16_000) : 'Stations for trucks.',
        },
      });
    }
  });

  test('three refused rows in a row: the run goes on, marks them, and the next run skips them', async () => {
    greekRefused.mockClear();
    const r1 = await runK1Embeddings({ ...LONG, embed: greekRefused, maxUsd: 1 });
    expect(r1).toMatchObject({ rejected: 3, aborted: false, topicsEmbedded: 1 });
    for (const id of LONG_TOPICS.slice(0, 3)) {
      const row = (await admin.topic.findUniqueOrThrow({ where: { id }, select: { title: true, keywords: true, description: true } }));
      expect(await topicState(id)).toMatchObject({ has: false, hash: REJECTED_HASH_PREFIX + embeddingHash(topicEmbeddingText(row)) });
    }
    expect(await topicState(LONG_TOPICS[3]!)).toMatchObject({ has: true, dims: 1536 });
    greekRefused.mockClear();
    const r2 = await runK1Embeddings({ ...LONG, embed: greekRefused, maxUsd: 1 });
    expect(greekRefused).not.toHaveBeenCalled();
    expect(r2).toMatchObject({ previouslyRejected: 3, topicsUpToDate: 1, failed: 0 });
  });

  test('a new text lifts the mark; a too-long one is embedded from its byte-safe prefix', async () => {
    // The title, not the tail: the tail is past the cut, so changing it changes neither the text nor the hash.
    await admin.topic.update({ where: { id: LONG_TOPICS[0]! }, data: { title: 'Υδρογόνο 0, αναθεωρημένο' } });
    byteLimited.mockClear();
    const r = await runK1Embeddings({ ...LONG, embed: byteLimited, maxUsd: 1 });
    expect(r).toMatchObject({ topicsEmbedded: 1, shortened: 1, failed: 0, previouslyRejected: 2 });
    expect(byteLimited).toHaveBeenCalledTimes(2);
    expect(await topicState(LONG_TOPICS[0]!)).toMatchObject({ has: true, dims: 1536 });
  });

  test('a refused profile is marked under RLS as fabrika_app', async () => {
    await admin.tenantProfile.update({ where: { tenantId: T_A }, data: { capabilities: 'Κυψέλες καυσίμου υδρογόνου.' } });
    const r = await runK1Embeddings({ topicIds: [], tenantIds: [T_A], embed: greekRefused, maxUsd: 1 });
    expect(r).toMatchObject({ rejected: 1, profilesEmbedded: 0 });
    expect((await profileState(T_A)).hash).toBe(REJECTED_HASH_PREFIX + embeddingHash(profileEmbeddingText({ capabilities: 'Κυψέλες καυσίμου υδρογόνου.', keywords: PROFILES[T_A]!.keywords })));
    // Leave the profile as the fixtures made it.
    await admin.tenantProfile.update({ where: { tenantId: T_A }, data: { capabilities: PROFILES[T_A]!.capabilities } });
  });

  test('a refused request (every input, the probe too) marks no row, profile or topic, and stops the run (İNCELEME-85 Y-1)', async () => {
    await admin.tenantProfile.update({ where: { tenantId: T_A }, data: { capabilities: 'Hydrogen storage for heavy-duty trucks.' } });
    await admin.topic.update({ where: { id: LONG_TOPICS[3]! }, data: { description: 'Stations for trucks and buses.' } });
    const before = { profile: await profileState(T_A), topics: await Promise.all(LONG_TOPICS.map(topicState)) };
    const everyRequestRefused = vi.fn(async (_text: string): Promise<number[]> => {
      throw new LlmProviderError('OpenAI embeddings error 400: {"error":{"message":"This model does not support specifying dimensions."}}', 400);
    });
    const r = await runK1Embeddings({ topicIds: LONG_TOPICS, tenantIds: [T_A], embed: everyRequestRefused, maxUsd: 1 });
    expect(r).toMatchObject({ rejected: 0, requestRefused: true, aborted: true, profilesEmbedded: 0, topicsEmbedded: 0 });
    // The profile goes first; its refusal is checked with the probe, which is refused too: two calls, then stop.
    expect(everyRequestRefused.mock.calls.map((c) => c[0])).toEqual([profileEmbeddingText({ capabilities: 'Hydrogen storage for heavy-duty trucks.', keywords: PROFILES[T_A]!.keywords }), EMBEDDING_PROBE_TEXT]);
    expect({ profile: await profileState(T_A), topics: await Promise.all(LONG_TOPICS.map(topicState)) }).toEqual(before);
    // Once the provider takes the request again, both are embedded: nothing was locked.
    const back = await runK1Embeddings({ topicIds: LONG_TOPICS, tenantIds: [T_A], embed: vi.fn(async (t: string) => fakeEmbedding(t)), maxUsd: 1 });
    expect(back).toMatchObject({ profilesEmbedded: 1, topicsEmbedded: 1, requestRefused: false });
    await admin.tenantProfile.update({ where: { tenantId: T_A }, data: { capabilities: PROFILES[T_A]!.capabilities } });
  });
});
