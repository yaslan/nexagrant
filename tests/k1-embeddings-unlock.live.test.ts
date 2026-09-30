import { describe, test, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * scripts/k1-embeddings-unlock-rejected.ts against real Postgres (İNCELEME-91 O-2,
 * TASK-MUOC2KUFCQGH0). The script is run once, by hand, on the production catalogue;
 * a regression there clears every embedding hash (a ~1300-topic re-embed), puts old
 * marks over rows embedded since, or clears before the backup exists. The code under
 * test runs as `fabrika_app` (NOBYPASSRLS), as TenantProfile is written under RLS;
 * fixtures and read-backs go through the owner role.
 *
 * Parallel live files mark rows of their own (tests/k1-embeddings.live.test.ts), so
 * every call here is narrowed to this file's topics and tenants.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const ownerUrl = process.env.DATABASE_URL;
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST;
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma } from '@/lib/db';
import { REJECTED_HASH_PREFIX } from '@/lib/scoring/embeddings';
import { restoreRejected, unlockRejected, type Backup } from '../scripts/k1-embeddings-unlock-rejected';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'k1 unlock-rejected live test';

const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const PROGRAMME = `P-UNL-${RUN}`;
const CALL = `c-unl-${RUN}`;
const mark = (h: string) => `${REJECTED_HASH_PREFIX}${h}-${RUN}`;

/** Topic id → the hash each test starts from. */
const TOPIC_HASHES = {
  [`tp-unl-m1-${RUN}`]: mark('m1'),
  [`tp-unl-m2-${RUN}`]: mark('m2'),
  [`tp-unl-ok-${RUN}`]: `ok-${RUN}`, // embedded: never touched
  [`tp-unl-null-${RUN}`]: null,
  [`tp-unl-out-${RUN}`]: mark('out'), // marked, outside the scope below
} as Record<string, string | null>;
const [T_M1, T_M2, T_OK, T_NULL, T_OUT] = Object.keys(TOPIC_HASHES) as [string, string, string, string, string];
const SCOPED_TOPICS = [T_M1, T_M2, T_OK, T_NULL];

const TENANT_HASHES = {
  [`t-unl-a-${RUN}`]: mark('pa'),
  [`t-unl-d-${RUN}`]: mark('pd'),
  [`t-unl-ok-${RUN}`]: `okp-${RUN}`,
  [`t-unl-out-${RUN}`]: mark('pout'),
} as Record<string, string | null>;
const [TA, TD, TOK, TOUT] = Object.keys(TENANT_HASHES) as [string, string, string, string];
const SCOPED_TENANTS = [TA, TD, TOK];
const SCOPE = { topicIds: SCOPED_TOPICS, tenantIds: SCOPED_TENANTS };
const CAPABILITIES = (id: string) => `Secret capability text of ${id}`;

async function topicHashes(): Promise<Record<string, string | null>> {
  const rows = await admin.topic.findMany({ where: { id: { in: Object.keys(TOPIC_HASHES) } }, select: { id: true, embeddingHash: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.embeddingHash]));
}
async function profileHashes(): Promise<Record<string, string | null>> {
  const rows = await admin.tenantProfile.findMany({ where: { tenantId: { in: Object.keys(TENANT_HASHES) } }, select: { tenantId: true, embeddingHash: true } });
  return Object.fromEntries(rows.map((r) => [r.tenantId, r.embeddingHash]));
}

let backupDir = '';
let log: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  if (!HAS_DB) return;
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k1-unlock-'));
  await admin.programme.create({ data: { id: PROGRAMME, name: 'UNL test', sourceKey: 'test' } });
  await admin.call.create({ data: { id: CALL, programmeId: PROGRAMME, callIdentifier: `UNL-${RUN}`, title: 'UNL call' } });
  for (const id of Object.keys(TOPIC_HASHES)) {
    await admin.topic.create({
      data: { id, callId: CALL, identifier: `UNL-${RUN}-${id}`, title: `Topic ${id}`, keywords: [], status: 'OPEN', deadlines: [], eligibility: {} },
    });
  }
  for (const id of Object.keys(TENANT_HASHES)) {
    await admin.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
    await admin.tenantProfile.create({ data: { tenantId: id, capabilities: CAPABILITIES(id), keywords: [], naceCodes: [], trlRange: [], preferredRoles: [] } });
  }
});

beforeEach(async () => {
  if (!HAS_DB) return;
  for (const [id, h] of Object.entries(TOPIC_HASHES)) await admin.topic.update({ where: { id }, data: { embeddingHash: h } });
  for (const [tenantId, h] of Object.entries(TENANT_HASHES)) await admin.tenantProfile.update({ where: { tenantId }, data: { embeddingHash: h } });
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => log.mockRestore();
});

afterAll(async () => {
  if (!HAS_DB) return;
  await admin.tenant.deleteMany({ where: { id: { in: presentIds(Object.keys(TENANT_HASHES)) } } });
  await admin.topic.deleteMany({ where: { id: { in: presentIds(Object.keys(TOPIC_HASHES)) } } });
  await admin.call.deleteMany({ where: { id: requireId(CALL, 'call') } });
  await admin.programme.deleteMany({ where: { id: requireId(PROGRAMME, 'programme') } });
  fs.rmSync(backupDir, { recursive: true, force: true });
  await admin.$disconnect();
});

const backups = () => fs.readdirSync(backupDir);

describe.skipIf(!HAS_DB)('k1-embeddings-unlock-rejected (live, fabrika_app)', () => {
  test('a dry run lists exactly the marked rows, changes nothing and writes no backup', async () => {
    const r = await unlockRejected({ ...SCOPE, apply: false, backupDir });
    expect(r.topics).toEqual([
      { id: T_M1, embeddingHash: TOPIC_HASHES[T_M1] },
      { id: T_M2, embeddingHash: TOPIC_HASHES[T_M2] },
    ]);
    expect(r.profiles.map((p) => p.tenantId).sort()).toEqual([TA, TD].sort());
    expect(r).toMatchObject({ backupFile: null, clearedTopics: 0, clearedProfiles: 0 });
    expect(await topicHashes()).toEqual(TOPIC_HASHES);
    expect(await profileHashes()).toEqual(TENANT_HASHES);
    expect(backups()).toEqual([]);
  });

  test('--apply clears only `rejected:` rows, after a backup of exactly those; a second --apply finds nothing', async () => {
    const r = await unlockRejected({ ...SCOPE, apply: true, backupDir });
    expect(r).toMatchObject({ clearedTopics: 2, clearedProfiles: 2 });
    expect(await topicHashes()).toEqual({ ...TOPIC_HASHES, [T_M1]: null, [T_M2]: null });
    expect(await profileHashes()).toEqual({ ...TENANT_HASHES, [TA]: null, [TD]: null });

    const backup = JSON.parse(fs.readFileSync(r.backupFile!, 'utf8')) as Backup;
    expect(path.dirname(r.backupFile!)).toBe(backupDir);
    expect(backup.topics).toEqual(r.topics);
    expect(backup.topics.map((t) => t.id)).toEqual([T_M1, T_M2]);
    expect(backup.profiles).toEqual(expect.arrayContaining([{ tenantId: TA, embeddingHash: TENANT_HASHES[TA] }, { tenantId: TD, embeddingHash: TENANT_HASHES[TD] }]));
    expect(backup.profiles).toHaveLength(2);
    // Ids and counts only: no profile text in the backup or the output.
    const printed = log.mock.calls.flat().join('\n') + fs.readFileSync(r.backupFile!, 'utf8');
    for (const id of Object.keys(TENANT_HASHES)) expect(printed).not.toContain(CAPABILITIES(id));

    const again = await unlockRejected({ ...SCOPE, apply: true, backupDir });
    expect(again).toMatchObject({ topics: [], profiles: [], backupFile: null, clearedTopics: 0, clearedProfiles: 0 });
    expect(backups()).toHaveLength(1);
    fs.rmSync(r.backupFile!);
  });

  test('--restore puts back only rows still cleared: a row re-embedded or re-marked since keeps its new hash', async () => {
    const r = await unlockRejected({ ...SCOPE, apply: true, backupDir });
    // Between the unlock and the restore, the nightly run embedded m1 and marked TA again.
    await admin.topic.update({ where: { id: T_M1 }, data: { embeddingHash: `new-${RUN}` } });
    await admin.tenantProfile.update({ where: { tenantId: TA }, data: { embeddingHash: mark('pa-again') } });

    expect(await restoreRejected(r.backupFile!)).toEqual({ topics: 1, profiles: 1 });
    expect(await topicHashes()).toEqual({ ...TOPIC_HASHES, [T_M1]: `new-${RUN}` });
    expect(await profileHashes()).toEqual({ ...TENANT_HASHES, [TA]: mark('pa-again') });
    fs.rmSync(r.backupFile!);
  });

  test('no backup, no clearing: a backup that cannot be written leaves every mark in place', async () => {
    const missing = path.join(backupDir, 'no-such-dir');
    await expect(unlockRejected({ ...SCOPE, apply: true, backupDir: missing })).rejects.toThrow(/ENOENT/);
    expect(await topicHashes()).toEqual(TOPIC_HASHES);
    expect(await profileHashes()).toEqual(TENANT_HASHES);
  });
});
