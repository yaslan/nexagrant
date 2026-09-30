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
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => {
    log.mockRestore();
    vi.restoreAllMocks();
  };
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
    // Marks outside the scope (another live file's rows) are not this call's to clear.
    expect((await topicHashes())[T_OUT]).toBe(TOPIC_HASHES[T_OUT]);
    expect((await profileHashes())[TOUT]).toBe(TENANT_HASHES[TOUT]);

    const backup = JSON.parse(fs.readFileSync(r.backupFile!, 'utf8')) as Backup;
    expect(path.dirname(r.backupFile!)).toBe(backupDir);
    expect(backup.topics).toEqual(r.topics);
    expect(backup.topics.map((t) => t.id)).toEqual([T_M1, T_M2]);
    expect(backup.profiles).toEqual(expect.arrayContaining([{ tenantId: TA, embeddingHash: TENANT_HASHES[TA] }, { tenantId: TD, embeddingHash: TENANT_HASHES[TD] }]));
    expect(backup.profiles).toHaveLength(2);
    // Ids and counts only: no profile text in the backup or the output (Ö-3a).
    const printed = JSON.stringify(log.mock.calls) + fs.readFileSync(r.backupFile!, 'utf8');
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

  test('deleted tenants are not unlocked (Ö-6)', async () => {
    const T_DELETED = `t-deleted-${RUN}`;
    const T_ACTIVE = `t-active-${RUN}`;

    try {
      await admin.tenant.create({ data: { id: T_DELETED, name: T_DELETED, slug: T_DELETED, country: 'TR', deletedAt: new Date() } });
      await admin.tenantProfile.create({ data: { tenantId: T_DELETED, capabilities: 'x', keywords: [], naceCodes: [], trlRange: [], preferredRoles: [], embeddingHash: `rejected:old` } });
      await admin.tenant.create({ data: { id: T_ACTIVE, name: T_ACTIVE, slug: T_ACTIVE, country: 'TR' } });
      await admin.tenantProfile.create({ data: { tenantId: T_ACTIVE, capabilities: 'x', keywords: [], naceCodes: [], trlRange: [], preferredRoles: [], embeddingHash: `rejected:active` } });

      const r = await unlockRejected({ tenantIds: [T_DELETED, T_ACTIVE], apply: true, backupDir });
      // Only the active tenant's profile is cleared
      expect(r.profiles.map((p) => p.tenantId)).toEqual([T_ACTIVE]);
      const deletedProfile = await admin.tenantProfile.findUnique({ where: { tenantId: T_DELETED }, select: { embeddingHash: true } });
      const activeProfile = await admin.tenantProfile.findUnique({ where: { tenantId: T_ACTIVE }, select: { embeddingHash: true } });
      expect(deletedProfile?.embeddingHash).toBe('rejected:old');
      expect(activeProfile?.embeddingHash).toBeNull();
    } finally {
      await admin.tenant.deleteMany({ where: { id: { in: [T_DELETED, T_ACTIVE] } } });
    }
  });

  test('a row re-embedded between the listing and the clear keeps its new hash (validates the LIKE guard, Ö-1)', async () => {
    const RUN_RACE = `race-${Math.random().toString(36).slice(2, 10)}`;
    const T = `t-race-${RUN_RACE}`;
    const P = `P-RACE-${RUN_RACE}`;
    const C = `c-race-${RUN_RACE}`;
    const TP = `tp-race-${RUN_RACE}`;
    const raceBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-'));

    try {
      await admin.tenant.create({ data: { id: T, name: T, slug: T, country: 'TR' } });
      await admin.tenantProfile.create({
        data: { tenantId: T, capabilities: 'x', keywords: [], naceCodes: [], trlRange: [], preferredRoles: [], embeddingHash: `rejected:old-${RUN_RACE}` },
      });
      await admin.programme.create({ data: { id: P, name: 'race', sourceKey: 'test' } });
      await admin.call.create({ data: { id: C, programmeId: P, callIdentifier: `R-${RUN_RACE}`, title: 'r' } });
      await admin.topic.create({
        data: { id: TP, callId: C, identifier: `R-${RUN_RACE}`, title: 't', keywords: [], status: 'OPEN', deadlines: [], eligibility: {}, embeddingHash: `rejected:oldt-${RUN_RACE}` },
      });

      let unlockPromise!: Promise<unknown>;
      await admin.$transaction(
        async (tx) => {
          // Between listing and clear, rows are re-embedded with new hashes.
          await tx.$executeRaw`UPDATE "TenantProfile" SET "embeddingHash" = ${`new-${RUN_RACE}`} WHERE "tenantId" = ${T}`;
          await tx.$executeRaw`UPDATE "Topic" SET "embeddingHash" = ${`newt-${RUN_RACE}`} WHERE id = ${TP}`;
          // Start the unlock; it will list the rejected hashes, then wait on row locks while we commit.
          unlockPromise = unlockRejected({ topicIds: [TP], tenantIds: [T], apply: true, backupDir: raceBackupDir });
          // Wait for backup to be written (happens after listing, before UPDATE).
          for (let i = 0; i < 100 && fs.readdirSync(raceBackupDir).length === 0; i++) await new Promise((r) => setTimeout(r, 50));
          expect(fs.readdirSync(raceBackupDir)).toHaveLength(1);
          // Let the UPDATE wait a bit more to ensure it tries to clear.
          await new Promise((r) => setTimeout(r, 500));
        },
        { timeout: 20_000 }
      );
      const r = (await unlockPromise) as { clearedTopics: number; clearedProfiles: number };
      const prof = await admin.tenantProfile.findUnique({ where: { tenantId: T }, select: { embeddingHash: true } });
      const top = await admin.topic.findUnique({ where: { id: TP }, select: { embeddingHash: true } });
      // The LIKE guard prevents clearing rows that have been re-embedded with new hashes.
      expect({ prof: prof?.embeddingHash, top: top?.embeddingHash, r }).toEqual({
        prof: `new-${RUN_RACE}`,
        top: `newt-${RUN_RACE}`,
        r: expect.objectContaining({ clearedTopics: 0, clearedProfiles: 0 }),
      });
    } finally {
      await admin.tenant.deleteMany({ where: { id: T } });
      await admin.topic.deleteMany({ where: { id: TP } });
      await admin.call.deleteMany({ where: { id: C } });
      await admin.programme.deleteMany({ where: { id: P } });
      fs.rmSync(raceBackupDir, { recursive: true, force: true });
    }
  }, 30_000);
});
