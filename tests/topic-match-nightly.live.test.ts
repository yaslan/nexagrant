import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Live K1 TopicMatch recompute (TASK-MULQL2NYKRGJX) — real Postgres + pgvector,
 * real Prisma, the code under test running as `fabrika_app` (NOBYPASSRLS), no
 * mocks. Fixtures and read-backs go through the owner role.
 *
 * The run reads the shared `Topic` catalogue and writes `TopicMatch` rows, so
 * it refuses the shared `fabrika` database outside GitHub Actions, like
 * tests/invitation-retention.live.test.ts. Point DATABASE_URL /
 * DATABASE_URL_RLS_TEST at a throwaway database (recipe in
 * docs/agent-results/TASK-MULQL2NYKRGJX-se-fb.md).
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma } from '@/lib/db';
import {
  recomputeAllTopicMatches,
  recomputeTenantTopicMatches,
  TOPIC_MATCH_AUDIT,
  TOPIC_MATCH_SOURCE,
} from '@/lib/scoring/topic-match';
import { k1TopicMatchTask } from '@/lib/jobs/tasks/k1-topic-match';
import type { JobHelpers } from 'graphile-worker';
import { assertRlsSubjectRole, isGithubActions, requireRlsTestUrl, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'topic match nightly test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE ? await usedDatabaseName(prisma, admin, SUITE) : undefined;
const SHARED = DB_NAME === 'fabrika' && !isGithubActions();
if (SHARED) skipOrFailInCi(SUITE, 'the run writes TopicMatch for every tenant; refusing the shared "fabrika" database');
const HAS_DB = DB_NAME !== undefined && !SHARED;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const T_TR = `t-tm-tr-${RUN}`; // Turkish tenant, profile embedding e0
const T_DE = `t-tm-de-${RUN}`; // German tenant, same profile
const T_NOPROF = `t-tm-np-${RUN}`; // profile row without embedding
const T_PILOT = `t-tm-pl-${RUN}`; // pilot ran out
const T_DELETED = `t-tm-del-${RUN}`;
const TENANTS = [T_TR, T_DE, T_NOPROF, T_PILOT, T_DELETED];
const PROGRAMME = `P-TM-${RUN}`;
const CALL = `c-tm-${RUN}`;

const DIM = 1536;
function vec(entries: Record<number, number>): string {
  const v = new Array<number>(DIM).fill(0);
  for (const [i, x] of Object.entries(entries)) v[Number(i)] = x;
  return `[${v.join(',')}]`;
}

/** topic key → [status, eligibility, vector or null] */
const TOPICS = {
  same: ['OPEN', {}, vec({ 0: 1 })], // cosine 1 → 100
  diag: ['FORTHCOMING', {}, vec({ 0: 1, 1: 1 })], // cosine 0.7071 → 70.71
  opposite: ['OPEN', {}, vec({ 0: -1 })], // cosine -1 → 0
  euOnly: ['OPEN', { restricted: 'EU_EEA_CH_ONLY' }, vec({ 0: 1 })], // TR 0, DE 100
  closed: ['CLOSED', {}, vec({ 0: 1 })], // no row
  noVector: ['OPEN', {}, null], // no row
  zero: ['OPEN', {}, vec({})], // NaN similarity → no row
} as const;
type TopicKey = keyof typeof TOPICS;
const topicId = (k: TopicKey) => `tp-tm-${k}-${RUN}`;
const MY_TOPICS = (Object.keys(TOPICS) as TopicKey[]).map(topicId);
/**
 * Every run scores against these topics only: parallel live files (e.g.
 * tests/k1-embeddings.live.test.ts) add embedded open topics of their own,
 * which would otherwise change this file's created/updated counts mid-run.
 */
const MINE = { topicIds: MY_TOPICS };

async function k1Rows(tenantId: string) {
  const rows = await admin.topicMatch.findMany({
    where: { tenantId: requireId(tenantId, 'tenantId'), opportunityId: null, topicId: { in: MY_TOPICS } },
    select: { topicId: true, fitScore: true, breakdown: true, computedAt: true },
  });
  return new Map(rows.map((r) => [r.topicId, r]));
}

const helpers = {
  job: { id: '1', attempts: 1, max_attempts: 5 },
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as JobHelpers;

async function wipe() {
  await admin.topicMatch.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await admin.tenant.deleteMany({ where: { id: { in: presentIds(TENANTS) } } });
  await admin.topic.deleteMany({ where: { id: { in: presentIds(MY_TOPICS) } } });
  await admin.call.deleteMany({ where: { id: requireId(CALL, 'call') } });
  await admin.programme.deleteMany({ where: { id: requireId(PROGRAMME, 'programme') } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await admin.programme.create({ data: { id: PROGRAMME, name: 'TM test', sourceKey: 'test' } });
  await admin.call.create({ data: { id: CALL, programmeId: PROGRAMME, callIdentifier: `TM-${RUN}`, title: 'TM call' } });
  for (const [k, [status, eligibility, v]] of Object.entries(TOPICS) as Array<[TopicKey, (typeof TOPICS)[TopicKey]]>) {
    await admin.topic.create({
      data: { id: topicId(k), callId: CALL, identifier: `TM-${RUN}-${k}`, title: k, status, deadlines: [], eligibility },
    });
    if (v) await admin.$executeRaw`UPDATE "Topic" SET embedding = ${v}::vector WHERE id = ${topicId(k)}`;
  }
  const mk = (id: string, country: string, deletedAt: Date | null = null) =>
    admin.tenant.create({ data: { id, name: id, slug: id, country, deletedAt } });
  await mk(T_TR, 'TR');
  await mk(T_DE, 'DE');
  await mk(T_NOPROF, 'TR');
  await mk(T_PILOT, 'TR');
  await mk(T_DELETED, 'TR', new Date());
  for (const t of TENANTS) {
    await admin.tenantProfile.create({ data: { tenantId: t, capabilities: 'x', keywords: [], naceCodes: [], trlRange: [], preferredRoles: [] } });
    if (t !== T_NOPROF) await admin.$executeRaw`UPDATE "TenantProfile" SET embedding = ${vec({ 0: 1 })}::vector WHERE "tenantId" = ${t}`;
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

describe.skipIf(!HAS_DB)('K1 TopicMatch nightly recompute (live, fabrika_app)', () => {
  test('scores cosine × 100 on the K1 row, zeroes an ineligible country, skips closed / vectorless / zero-vector topics', async () => {
    const r = await recomputeTenantTopicMatches(T_TR, { ...MINE, pageSize: 2 });
    expect(r.status).toBe('done');
    expect(r.pages).toBeGreaterThanOrEqual(3); // 5 scorable-or-not open topics of ours in pages of 2

    const rows = await k1Rows(T_TR);
    expect(rows.get(topicId('same'))?.fitScore).toBe(100);
    expect(rows.get(topicId('diag'))?.fitScore).toBe(70.71);
    expect(rows.get(topicId('diag'))?.breakdown).toMatchObject({ cosine: 0.7071, eligible: true });
    expect(rows.get(topicId('opposite'))?.fitScore).toBe(0);
    expect(rows.get(topicId('euOnly'))?.fitScore).toBe(0);
    expect(rows.get(topicId('euOnly'))?.breakdown).toMatchObject({ source: TOPIC_MATCH_SOURCE, eligible: false, cosine: 1 });
    expect(rows.has(topicId('closed'))).toBe(false);
    expect(rows.has(topicId('noVector'))).toBe(false);
    expect(rows.has(topicId('zero'))).toBe(false);
    expect(rows.size).toBe(4);

    // The G0 reader must see it as a real K1 match, not a placeholder.
    expect((rows.get(topicId('same'))?.breakdown as Record<string, unknown>).g0ScorerPlaceholderFitScore).toBeUndefined();
  });

  test('the same topic is eligible for an EU tenant', async () => {
    await recomputeTenantTopicMatches(T_DE, MINE);
    expect((await k1Rows(T_DE)).get(topicId('euOnly'))?.fitScore).toBe(100);
  });

  test('is idempotent: a second run changes nothing and writes no second row or audit', async () => {
    const before = await k1Rows(T_TR);
    const auditsBefore = await admin.auditEvent.count({ where: { tenantId: T_TR, type: TOPIC_MATCH_AUDIT } });
    const r = await recomputeTenantTopicMatches(T_TR, { ...MINE, pageSize: 3 });
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(r.unchanged).toBeGreaterThanOrEqual(4);
    const after = await k1Rows(T_TR);
    expect(after.size).toBe(before.size);
    for (const [id, row] of before) expect(after.get(id)?.computedAt.getTime()).toBe(row.computedAt.getTime());
    expect(await admin.auditEvent.count({ where: { tenantId: T_TR, type: TOPIC_MATCH_AUDIT } })).toBe(auditsBefore);
    expect(await admin.topicMatch.count({ where: { tenantId: T_TR, topicId: topicId('same') } })).toBe(1);
  });

  // TASK-MUOEY2GBFHY7U: `prisma db push` runs first and built this key NULLS DISTINCT, so two
  // overlapping runs (this file's unnarrowed job and k1-embeddings' sweep) each inserted the
  // same K1 pair. The database, not the findMany in writePage, is what keeps it one row.
  test('the database refuses a second K1 row for the same tenant × topic (the key is NULLS NOT DISTINCT)', async () => {
    await expect(
      admin.topicMatch.create({
        data: { tenantId: T_TR, topicId: topicId('same'), opportunityId: null, fitScore: 1, breakdown: {} },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await admin.topicMatch.count({ where: { tenantId: T_TR, topicId: topicId('same') } })).toBe(1);
  });

  test('a changed embedding updates the existing row in place', async () => {
    await admin.$executeRaw`UPDATE "Topic" SET embedding = ${vec({ 1: 1 })}::vector WHERE id = ${topicId('diag')}`;
    const r = await recomputeTenantTopicMatches(T_TR, MINE);
    expect(r.updated).toBe(1);
    expect((await k1Rows(T_TR)).get(topicId('diag'))?.fitScore).toBe(0);
    await admin.$executeRaw`UPDATE "Topic" SET embedding = ${vec({ 0: 1, 1: 1 })}::vector WHERE id = ${topicId('diag')}`;
    await recomputeTenantTopicMatches(T_TR, MINE);
  });

  test('the audit row carries counts only', async () => {
    const a = await admin.auditEvent.findFirst({ where: { tenantId: T_TR, type: TOPIC_MATCH_AUDIT }, orderBy: { createdAt: 'asc' } });
    expect(a).not.toBeNull();
    const data = a!.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(['created', 'ineligible', 'scored', 'unchanged', 'updated', 'version']);
    for (const [k, v] of Object.entries(data)) if (k !== 'version') expect(typeof v).toBe('number');
  });

  test('a tenant with no profile embedding and an expired pilot get no row', async () => {
    expect((await recomputeTenantTopicMatches(T_NOPROF, MINE)).status).toBe('no_profile_embedding');
    expect((await recomputeTenantTopicMatches(T_PILOT, MINE)).status).toBe('pilot_expired');
    expect((await k1Rows(T_NOPROF)).size).toBe(0);
    expect((await k1Rows(T_PILOT)).size).toBe(0);
  });

  test('the all-tenant run skips a deleted tenant, counts each outcome and never crosses tenants', async () => {
    const r = await recomputeAllTopicMatches({ ...MINE, tenantIds: TENANTS, pageSize: 2 });
    expect(r.tenants).toBe(4); // T_DELETED is not read
    expect(r.pilotExpired).toBe(1);
    expect(r.noProfileEmbedding).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.topicsWithoutEmbedding).toBeGreaterThanOrEqual(1);
    expect((await k1Rows(T_DELETED)).size).toBe(0);
    // Each tenant's rows carry its own tenantId only.
    const trRows = await admin.topicMatch.findMany({ where: { topicId: { in: MY_TOPICS }, opportunityId: null }, select: { tenantId: true } });
    expect(new Set(trRows.map((x) => x.tenantId))).toEqual(new Set([T_TR, T_DE]));
  });

  test('an empty tenant list narrows the run to nothing, never to every tenant', async () => {
    const r = await recomputeAllTopicMatches({ tenantIds: [] });
    expect(r.tenants).toBe(0);
  });

  test('the job runs on the tick and reports a success summary', async () => {
    await expect(k1TopicMatchTask({ _cron: { ts: new Date().toISOString() } }, helpers)).resolves.toBeUndefined();
  });
});
