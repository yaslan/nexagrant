import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { InterregAnalysisStatus } from '@prisma/client';

/**
 * Live M17 text retention (FO-195 B1/B5) — real Postgres, the `fabrika_app` role
 * (NOBYPASSRLS), no mocks.
 *
 * purgeExpiredInterregText() works across EVERY tenant by date, so like
 * notification-retention.live this file refuses to run on the shared local database
 * named `fabrika` outside CI. Singleton swap as there: the code under test runs as
 * fabrika_app, where an unscoped updateMany would match no row and report 0; fixtures
 * and counts go through the owner role.
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
import { INTERREG_UPLOAD_LIMITS } from '@/modules/m17/limits';
import { purgeExpiredInterregText } from '@/modules/m17/server/retention';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'm17 text retention test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE
  ? ((await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database()::text AS db`)[0]?.db ?? '')
  : '';
const SHARED = DB_NAME === 'fabrika' && !isCi();
if (SHARED) {
  console.warn(`${SUITE} skipped: the purge works across every tenant; refusing to run on the shared "fabrika" database`);
}
const HAS_DB = REACHABLE && !SHARED;
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const RUBRIC = 'interreg-next-bsb.call2.regular';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const tenantIds: string[] = [];
const userIds: string[] = [];
let criterionId = '';

type Slot = { text: string; expiresInDays: number | 'now' | 'now+1ms' };
const slotData = (kind: 'call' | 'project', s: Slot | null) => {
  const exp = s === null ? null : s.expiresInDays === 'now' ? NOW : s.expiresInDays === 'now+1ms' ? new Date(NOW.getTime() + 1) : at(s.expiresInDays);
  return s === null
    ? {}
    : {
        [`${kind}FileName`]: `${kind}-${RUN}.txt`,
        [`${kind}Format`]: 'TXT',
        [`${kind}Chars`]: s.text.length,
        [`${kind}Text`]: s.text,
        [`${kind}ExtractedAt`]: new Date((exp as Date).getTime() - INTERREG_UPLOAD_LIMITS.textRetentionDays * DAY),
        [`${kind}TextExpiresAt`]: exp,
      };
};

async function makeTenant(key: string): Promise<{ tenantId: string; userId: string }> {
  const t = await admin.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenantIds.push(t.id);
  const u = await admin.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  userIds.push(u.id);
  await admin.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
  return { tenantId: t.id, userId: u.id };
}

async function analysis(
  owner: { tenantId: string; userId: string },
  status: InterregAnalysisStatus,
  call: Slot | null,
  project: Slot | null,
  withResult = true,
): Promise<string> {
  const row = await admin.interregAnalysis.create({
    data: { tenantId: owner.tenantId, userId: owner.userId, rubricId: RUBRIC, status, ...slotData('call', call), ...slotData('project', project) },
    select: { id: true },
  });
  if (withResult) {
    await admin.interregCriterionMark.create({
      data: { tenantId: owner.tenantId, analysisId: row.id, rubricId: RUBRIC, criterionId, mark: 3, evidenceQuote: 'quoted text' },
    });
    await admin.interregAnalysisResult.create({
      data: { tenantId: owner.tenantId, analysisId: row.id, rawScore: 40, score100: 71.4, passesThresholds: true, reportMarkdown: 'r', model: 'm', promptHash: 'h' },
    });
  }
  return row.id;
}

const load = (id: string) => admin.interregAnalysis.findUniqueOrThrow({ where: { id } });
const derived = (id: string) =>
  Promise.all([
    admin.interregCriterionMark.count({ where: { analysisId: id } }),
    admin.interregAnalysisResult.count({ where: { analysisId: id } }),
  ]);

describe.skipIf(!HAS_DB)('M17 text retention (live, fabrika_app)', () => {
  beforeAll(async () => {
    const c = await admin.interregRubricCriterion.findFirst({ where: { rubricId: RUBRIC }, select: { id: true } });
    if (!c) throw new Error(`rubric ${RUBRIC} is not seeded (pnpm db:seed)`);
    criterionId = c.id;
  });

  afterAll(async () => {
    await admin.interregAnalysis.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.membership.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenantIds) } } });
    await admin.user.deleteMany({ where: { id: { in: presentIds(userIds) } } });
    await admin.$disconnect();
  });

  test('empties each slot on its OWN expiry, in every tenant, and keeps the analysis consistent', async () => {
    const a = await makeTenant('a');
    const b = await makeTenant('b');
    const text = 'x'.repeat(300);
    // A: call uploaded 31 days ago (due), project 10 days ago (kept) — the per-slot rule (B5).
    const callDue = await analysis(a, 'READY', { text, expiresInDays: -1 }, { text, expiresInDays: 20 });
    // B: project due, call kept → CALL_READY.
    const projectDue = await analysis(a, 'DONE', { text, expiresInDays: 20 }, { text, expiresInDays: -1 });
    // C: both due → UPLOADING, nothing left to read.
    const bothDue = await analysis(b, 'FAILED', { text, expiresInDays: -3 }, { text, expiresInDays: -2 });
    // D: nothing due → untouched, result kept.
    const young = await analysis(b, 'READY', { text, expiresInDays: 5 }, { text, expiresInDays: 6 });
    // E: no documents at all.
    const empty = await analysis(a, 'UPLOADING', null, null, false);
    // F: ANALYZING with a due call text: text goes, and so does ANALYZING (FO-191 B4): the run cannot finish
    //    without it, and an ANALYZING row refuses the re-upload that would fix it. Project slot not due -> UPLOADING.
    const analyzing = await analysis(a, 'ANALYZING', { text, expiresInDays: -1 }, { text, expiresInDays: 9 }, false);

    const result = await purgeExpiredInterregText(NOW);
    expect(result.callSlots).toBeGreaterThanOrEqual(3); // callDue, bothDue, analyzing
    expect(result.projectSlots).toBeGreaterThanOrEqual(2); // projectDue, bothDue
    expect(result.more).toBe(false);

    const r1 = await load(callDue);
    expect(r1).toMatchObject({
      status: 'UPLOADING', // project file only: the call guide is missing
      callText: null, callFileName: null, callFormat: null, callPages: null, callChars: null,
      callExtractedAt: null, callTextExpiresAt: null,
    });
    expect(r1.projectText).toBe(text);
    expect(r1.projectTextExpiresAt).not.toBeNull();
    expect(await derived(callDue)).toEqual([0, 0]);

    const r2 = await load(projectDue);
    expect(r2).toMatchObject({ status: 'CALL_READY', projectText: null, projectFileName: null, projectTextExpiresAt: null });
    expect(r2.callText).toBe(text);
    expect(await derived(projectDue)).toEqual([0, 0]);

    expect(await load(bothDue)).toMatchObject({
      status: 'UPLOADING', callText: null, projectText: null, callTextExpiresAt: null, projectTextExpiresAt: null,
    });
    expect(await derived(bothDue)).toEqual([0, 0]);

    const r4 = await load(young);
    expect(r4).toMatchObject({ status: 'READY', callText: text, projectText: text });
    expect(await derived(young)).toEqual([1, 1]);

    expect(await load(empty)).toMatchObject({ status: 'UPLOADING', callText: null, projectText: null });
    expect(await load(analyzing)).toMatchObject({ status: 'UPLOADING', callText: null, projectText: text });

    // Raw proof: no text of this run is left past its expiry, and no row holds text without an expiry.
    const leftover = await admin.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM "InterregAnalysis"
       WHERE "tenantId" = ANY(${tenantIds})
         AND (("callText" IS NOT NULL AND "callTextExpiresAt" <= ${NOW})
           OR ("projectText" IS NOT NULL AND "projectTextExpiresAt" <= ${NOW}))`;
    expect(Number(leftover[0]?.n)).toBe(0);
  });

  test('is idempotent: a second run, and two at once, find nothing of this file to change', async () => {
    const t = await makeTenant('idem');
    const text = 'y'.repeat(300);
    const id = await analysis(t, 'READY', { text, expiresInDays: -1 }, { text, expiresInDays: 4 });
    const [first, second] = await Promise.all([purgeExpiredInterregText(NOW), purgeExpiredInterregText(NOW)]);
    expect(first.callSlots + second.callSlots).toBeGreaterThanOrEqual(1);
    const after = await load(id);
    const again = await purgeExpiredInterregText(NOW);
    expect(again.callSlots).toBe(0);
    expect(again.projectSlots).toBe(0);
    expect(again.analyses).toBe(0);
    expect(await load(id)).toEqual(after); // updatedAt included: nothing was written
  });

  test('an expiry exactly at the tick is purged; one millisecond later is kept', async () => {
    const t = await makeTenant('edge');
    const text = 'z'.repeat(300);
    const onTick = await analysis(t, 'CALL_READY', { text, expiresInDays: 'now' }, null, false);
    const justAfter = await analysis(t, 'CALL_READY', { text, expiresInDays: 'now+1ms' }, null, false);
    await purgeExpiredInterregText(NOW);
    expect((await load(onTick)).callText).toBeNull();
    expect((await load(justAfter)).callText).toBe(text);
  });

  test('pages: more due rows than one batch are ALL emptied, each page committing on its own (FO-195 B1)', async () => {
    const t = await makeTenant('pages');
    const text = 'p'.repeat(300);
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await analysis(t, 'READY', { text, expiresInDays: -1 - i }, { text, expiresInDays: 9 }));
    const young = await analysis(t, 'READY', { text, expiresInDays: 5 }, { text, expiresInDays: 6 });

    // batchSize 3 over 7 due rows (+ whatever the other tests of this file left due): several pages.
    const result = await purgeExpiredInterregText(NOW, { batchSize: 3 });
    expect(result.more).toBe(false);
    expect(result.callSlots).toBeGreaterThanOrEqual(7);
    for (const id of ids) {
      expect(await load(id)).toMatchObject({ status: 'UPLOADING', callText: null, callTextExpiresAt: null });
      expect(await derived(id)).toEqual([0, 0]);
    }
    expect(await load(young)).toMatchObject({ status: 'READY', callText: text });
  });

  test('a run cut short keeps what it finished, and the next run carries on to the end', async () => {
    const t = await makeTenant('resume');
    const text = 'q'.repeat(300);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push(await analysis(t, 'CALL_READY', { text, expiresInDays: -2 }, null, false));
    const dueNow = async () =>
      Number(
        (
          await admin.$queryRaw<Array<{ n: bigint }>>`
            SELECT count(*)::bigint AS n FROM "InterregAnalysis" WHERE "tenantId" = ANY(${tenantIds}) AND "callText" IS NOT NULL AND "callTextExpiresAt" <= ${NOW}`
        )[0]?.n,
      );
    const before = await dueNow();
    expect(before).toBeGreaterThanOrEqual(8);

    // Two pages of 2, then stop: the 4 rows of those pages are gone (committed), the rest stay.
    const first = await purgeExpiredInterregText(NOW, { batchSize: 2, maxBatches: 2 });
    expect(first.more).toBe(true);
    expect(first.callSlots).toBe(4);
    expect(await dueNow()).toBe(before - 4);

    // The next run is the same call: it finishes the backlog and the one after finds nothing.
    const second = await purgeExpiredInterregText(NOW, { batchSize: 2 });
    expect(second.more).toBe(false);
    expect(second.callSlots).toBe(before - 4);
    expect(await dueNow()).toBe(0);
    const third = await purgeExpiredInterregText(NOW, { batchSize: 2 });
    expect(third).toEqual({ callSlots: 0, projectSlots: 0, analyses: 0, more: false });
    for (const id of ids) expect((await load(id)).callText).toBeNull();
  });

  test('a time budget that is already spent stops after one page and reports more', async () => {
    const t = await makeTenant('budget');
    const text = 'b'.repeat(300);
    for (let i = 0; i < 4; i++) await analysis(t, 'CALL_READY', { text, expiresInDays: -2 }, null, false);
    const r = await purgeExpiredInterregText(NOW, { batchSize: 2, budgetMs: 1e-9 });
    expect(r.more).toBe(true);
    expect(r.callSlots).toBe(2);
    await purgeExpiredInterregText(NOW); // leave the database clean for the other tests
  });

  test('an invalid `now` is refused instead of silently matching nothing', async () => {
    await expect(purgeExpiredInterregText(new Date('nope'))).rejects.toThrow(/valid Date/);
  });

  test('the database refuses a text without an expiry, so nothing can escape the purge', async () => {
    const t = await makeTenant('check');
    await expect(
      admin.interregAnalysis.create({ data: { tenantId: t.tenantId, userId: t.userId, rubricId: RUBRIC, callText: 'orphan text' } }),
    ).rejects.toThrow(/InterregAnalysis_text_expiry_pair/);
  });

  test('a user or tenant deletion removes the analyses, their texts and results (FK cascade, KVKK erasure)', async () => {
    const t = await makeTenant('erase');
    const text = 'k'.repeat(300);
    const id = await analysis(t, 'READY', { text, expiresInDays: 20 }, { text, expiresInDays: 20 });
    await admin.user.delete({ where: { id: t.userId } });
    expect(await admin.interregAnalysis.count({ where: { id } })).toBe(0);
    expect(await derived(id)).toEqual([0, 0]);

    // The tenant FK does the same for an institution deletion.
    const t2 = await makeTenant('erase-tenant');
    const id2 = await analysis(t2, 'READY', { text, expiresInDays: 20 }, { text, expiresInDays: 20 });
    expect(await derived(id2)).not.toEqual([0, 0]);
    await admin.tenant.delete({ where: { id: t2.tenantId } });
    expect(await admin.interregAnalysis.count({ where: { id: id2 } })).toBe(0);
    expect(await derived(id2)).toEqual([0, 0]);
  });
});
