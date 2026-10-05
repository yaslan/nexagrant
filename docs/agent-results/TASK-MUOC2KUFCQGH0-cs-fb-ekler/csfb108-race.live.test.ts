import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// cs-fb İNCELEME-108 throwaway: does the `LIKE 'rejected:%'` guard on the clear (S16d) matter?
// A concurrent writer holds the profile row lock between the listing and the UPDATE.
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const ownerUrl = process.env.DATABASE_URL;
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST;
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});
import { createDbClient } from '@/lib/db';
import { unlockRejected } from '../scripts/k1-embeddings-unlock-rejected';

if (!RLS_URL || !OWNER_URL?.includes('55108')) throw new Error('isolated DB only');
const admin = createDbClient(OWNER_URL);
const RUN = Math.random().toString(36).slice(2, 10);
const T = `t-race-${RUN}`, P = `P-RACE-${RUN}`, C = `c-race-${RUN}`, TP = `tp-race-${RUN}`;
let dir = '';
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-'));
  await admin.tenant.create({ data: { id: T, name: T, slug: T, country: 'TR' } });
  await admin.tenantProfile.create({ data: { tenantId: T, capabilities: 'x', keywords: [], naceCodes: [], trlRange: [], preferredRoles: [], embeddingHash: `rejected:old-${RUN}` } });
  await admin.programme.create({ data: { id: P, name: 'race', sourceKey: 'test' } });
  await admin.call.create({ data: { id: C, programmeId: P, callIdentifier: `R-${RUN}`, title: 'r' } });
  await admin.topic.create({ data: { id: TP, callId: C, identifier: `R-${RUN}`, title: 't', keywords: [], status: 'OPEN', deadlines: [], eligibility: {}, embeddingHash: `rejected:oldt-${RUN}` } });
});
afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: T } });
  await admin.topic.deleteMany({ where: { id: TP } });
  await admin.call.deleteMany({ where: { id: C } });
  await admin.programme.deleteMany({ where: { id: P } });
  fs.rmSync(dir, { recursive: true, force: true });
  await admin.$disconnect();
});

test('a row re-embedded between the listing and the clear keeps its new hash (profile + topic)', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  let p!: Promise<unknown>;
  await admin.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "TenantProfile" SET "embeddingHash" = ${`new-${RUN}`} WHERE "tenantId" = ${T}`;
    await tx.$executeRaw`UPDATE "Topic" SET "embeddingHash" = ${`newt-${RUN}`} WHERE id = ${TP}`;
    p = unlockRejected({ topicIds: [TP], tenantIds: [T], apply: true, backupDir: dir });
    // The backup is written after the listing and before the UPDATEs: they now wait on our row locks.
    for (let i = 0; i < 100 && fs.readdirSync(dir).length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(fs.readdirSync(dir)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 500));
  }, { timeout: 20_000 });
  const r = (await p) as { clearedTopics: number; clearedProfiles: number };
  const prof = await admin.tenantProfile.findUnique({ where: { tenantId: T }, select: { embeddingHash: true } });
  const top = await admin.topic.findUnique({ where: { id: TP }, select: { embeddingHash: true } });
  expect({ prof: prof?.embeddingHash, top: top?.embeddingHash, r }).toEqual({
    prof: `new-${RUN}`, top: `newt-${RUN}`, r: expect.objectContaining({ clearedTopics: 0, clearedProfiles: 0 }),
  });
}, 30_000);
