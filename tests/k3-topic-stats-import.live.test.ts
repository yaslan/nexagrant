import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, type TenantTx } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';
import { buildXlsx, type FixtureCell } from './helpers/xlsx-fixture';
import {
  applyTopicStatImport,
  planTopicStatImport,
  rescoreG0ForPrefixes,
  RAW_FETCH_SOURCE,
} from '@/lib/k3-topic-stats/importer';
import { loadG0Snapshot } from '@/lib/scoring/g0-compute';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MULQKV3BJT6VM — K3 import against the real database.
 *
 *  - preview writes nothing; apply writes exactly what preview promised;
 *  - applying the same file twice is a no-op (idempotent), and a second quarter's file UPDATES the
 *    rows instead of adding a second set that G0 would pick from at random;
 *  - codes with no topic are listed, not written;
 *  - the G0 snapshot reads the imported rate, and the rescore finds the opportunity on the topic.
 *
 * `.live`: skips locally when Postgres is unreachable, fails in CI.
 */

const ADMIN_URL = envValue('DATABASE_URL');
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;
const dbReachable =
  admin !== undefined && (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

const SUITE = 'k3-topic-stats import live test';
if (dbReachable) await assertAppOwnerRole(prisma, SUITE);
else skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const db = () => admin as PrismaClient;
const RUN = `K3T${Date.now().toString(36).toUpperCase()}`;
const CALL = `HORIZON-${RUN}-2026-01`;
const FAMILY = `${CALL}-D1`; // topic family prefix
const TOPIC_1 = `${FAMILY}-01`;
const TOPIC_2 = `${FAMILY}-02`;
const OTHER_FAMILY = `HORIZON-${RUN}-2026-02-D9`; // topics exist only in this family, imported as a prefix
const UNKNOWN = `HORIZON-${RUN}-2099-99-ZZ-01`;

const HEADER: FixtureCell[] = ['Topic', 'Country', 'Eligible proposals', 'Retained proposals', 'Success rate'];

function file(rows: FixtureCell[][]): Buffer {
  return buildXlsx([{ name: 'Export', rows: [HEADER, ...rows] }]);
}

const Q3 = file([
  [TOPIC_1, 'TR', 100, 18, '18%'],
  [TOPIC_1, null, 400, 60, '15%'],
  [OTHER_FAMILY, null, 200, 20, 0.1],
  [UNKNOWN, 'TR', 10, 1, '10%'],
  [],
]);
const Q4 = file([
  [TOPIC_1, 'TR', 120, 24, '20%'],
  [TOPIC_1, null, 400, 60, '15%'],
  [OTHER_FAMILY, null, 200, 20, 0.1],
  [UNKNOWN, 'TR', 10, 1, '10%'],
]);

const statsOfRun = () =>
  db().topicStat.findMany({
    where: { topicPrefix: { in: [FAMILY, OTHER_FAMILY] } },
    orderBy: [{ topicPrefix: 'asc' }, { country: 'asc' }],
  });

describe.skipIf(!dbReachable)('K3 Horizon Dashboard import → TopicStat', () => {
  let tenantId = '';
  let opportunityId = '';

  beforeAll(async () => {
    await db().programme.upsert({ where: { id: 'HE' }, update: {}, create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'sedia' } });
    const call = await db().call.create({ data: { programmeId: 'HE', callIdentifier: CALL, title: `K3 test ${RUN}` } });
    const call2 = await db().call.create({
      data: { programmeId: 'HE', callIdentifier: `HORIZON-${RUN}-2026-02`, title: `K3 test 2 ${RUN}` },
    });
    for (const [identifier, callId] of [
      [TOPIC_1, call.id],
      [TOPIC_2, call.id],
      [`${OTHER_FAMILY}-01`, call2.id],
    ] as const) {
      await db().topic.create({ data: { callId, identifier, title: identifier, deadlines: [] } });
    }
    const tenant = await db().tenant.create({
      data: { name: `K3 ${RUN}`, slug: `${RUN.toLowerCase()}-t`, country: 'TR', orgType: 'PUBLIC' },
    });
    tenantId = tenant.id;
    const ws = await db().workspace.create({ data: { tenantId, name: 'WS', slug: `${RUN.toLowerCase()}-ws` } });
    const opp = await db().opportunity.create({
      data: { tenantId, workspaceId: ws.id, title: `K3 opp ${RUN}`, stage: 'G0', status: 'ACTIVE', topicId: TOPIC_1 },
    });
    opportunityId = opp.id;
  });

  afterAll(async () => {
    if (!dbReachable) return;
    await db().topicStat.deleteMany({ where: { topicPrefix: { in: [FAMILY, OTHER_FAMILY] } } });
    await db().rawFetch.deleteMany({ where: { source: requireId(RAW_FETCH_SOURCE, 'RAW_FETCH_SOURCE'), key: { startsWith: RUN } } });
    if (tenantId) {
      await db().topicMatch.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
      await db().opportunity.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
      await db().workspace.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
      await db().tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
    }
    await db().topic.deleteMany({ where: { identifier: { startsWith: `HORIZON-${RUN}-` } } });
    await db().call.deleteMany({ where: { callIdentifier: { startsWith: `HORIZON-${RUN}-` } } });
    await db().$disconnect();
  });

  it('preview classifies rows and writes nothing', async () => {
    const plan = await planTopicStatImport(Q3, `${RUN}-q3.xlsx`, '2026-07-01');
    expect(plan.counts).toEqual({ insert: 3, update: 0, unchanged: 0, unmatched: 1, rejected: 0, blank: 1 });
    expect(plan.unmatched).toEqual([{ rowNumber: 5, topicCode: UNKNOWN }]);
    const family = plan.planned.find((p) => p.topicCode === OTHER_FAMILY)!;
    expect(family).toMatchObject({ matchedAs: 'family', topicId: null, topicPrefix: OTHER_FAMILY, successRate: 10 });
    expect(plan.planned.find((p) => p.country === 'TR')).toMatchObject({ matchedAs: 'topic', topicPrefix: FAMILY });
    expect(await statsOfRun()).toEqual([]);
  });

  it('apply writes what the preview promised, with file + date provenance, and lists the unmatched code', async () => {
    const res = await applyTopicStatImport(Q3, `${RUN}-q3.xlsx`, '2026-07-01');
    expect(res.written).toEqual({ inserted: 3, updatedRows: 0 });
    expect(res.plan.unmatched.map((u) => u.topicCode)).toEqual([UNKNOWN]);
    expect(res.rawFetch).toBe('recorded');
    expect(res.prefixes.sort()).toEqual([FAMILY, OTHER_FAMILY].sort());

    const rows = await statsOfRun();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set([`horizon-dashboard|${RUN}-q3.xlsx|2026-07-01`]));
    expect(await db().topicStat.count({ where: { topicPrefix: { startsWith: `HORIZON-${RUN}-2099` } } })).toBe(0);
  });

  it('applying the same file again changes nothing (idempotent)', async () => {
    const before = await statsOfRun();
    const res = await applyTopicStatImport(Q3, `${RUN}-q3.xlsx`, '2026-07-01');
    expect(res.plan.counts).toMatchObject({ insert: 0, update: 0, unchanged: 3 });
    expect(res.written).toEqual({ inserted: 0, updatedRows: 0 });
    expect(res.rawFetch).toBe('unchanged');
    expect(await statsOfRun()).toEqual(before);
  });

  it('the next quarter updates the same rows instead of adding a second set', async () => {
    const res = await applyTopicStatImport(Q4, `${RUN}-q4.xlsx`, '2026-10-01');
    // All three matched rows carry a new source; one also carries a new rate.
    expect(res.plan.counts).toMatchObject({ insert: 0, update: 3, unchanged: 0, unmatched: 1 });
    const rows = await statsOfRun();
    expect(rows).toHaveLength(3);
    const tr = rows.find((r) => r.country === 'TR')!;
    expect(tr).toMatchObject({ proposals: 120, funded: 24, successRate: 20, source: `horizon-dashboard|${RUN}-q4.xlsx|2026-10-01` });

    // And again: still three rows, all unchanged.
    const again = await applyTopicStatImport(Q4, `${RUN}-q4.xlsx`, '2026-10-01');
    expect(again.written).toEqual({ inserted: 0, updatedRows: 0 });
    expect(await statsOfRun()).toHaveLength(3);
  });

  it('G0 reads the imported rate for the tenant\'s country, and the rescore finds the opportunity', async () => {
    // Test-only: the local role is BYPASSRLS and the tenant is passed explicitly (same cast as scripts/rescore-g0.ts).
    const snapshot = await loadG0Snapshot(prisma as unknown as TenantTx, tenantId, {
      opportunityId,
      topicId: TOPIC_1,
      intendedRole: null,
      seats: [],
    });
    expect(snapshot.baseRatePct).toBe(20);

    const summary = await rescoreG0ForPrefixes([FAMILY]);
    expect(summary).toMatchObject({ opportunities: 1, failed: 0, truncated: false });
    expect(summary.scored + summary.unscorable).toBe(1);
    const evidence = await db().topicMatch.findFirst({ where: { tenantId, opportunityId } });
    if (summary.scored === 1) expect(evidence).not.toBeNull();
  });
});
