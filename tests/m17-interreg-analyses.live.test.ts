import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * FO-186 fix — M17 storage on a real database, over `fabrika_app` (NOBYPASSRLS,
 * asserted). Nothing is mocked but the routing of `withTenant` to that client.
 *
 *  - crw2 Ö1: saveDocument() is the single place the status rule lives; its four
 *    transitions, two uploads racing for the two slots, another user's or another
 *    tenant's id, and the ANALYZING refusal are measured here.
 *  - se-fb D1 / crw2 Ö5: a result or mark cannot point at another tenant's
 *    analysis, and a mark cannot name a criterion of another rubric — the
 *    composite foreign keys refuse it even where RLS would let the row in.
 *  - se-fb D3: the rubric tables are SELECT-only for fabrika_app at the privilege
 *    level (permission denied, not just a policy refusal).
 *
 * `.live`: needs the docker-compose Postgres, `pnpm db:setup` (seeded rubric) and
 * `pnpm db:rls-role`.
 */

const SUITE = 'm17-interreg-analyses.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `m17-${Date.now().toString(36)}`;
const SEEDED_RUBRIC = 'interreg-next-bsb.call2.regular';
const OTHER_RUBRIC = `${RUN}-other-rubric`;

const state = vi.hoisted(() => ({ rls: undefined as PrismaClient | undefined }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { createDbClient, withTenantOn } = await import('@/lib/db');
const { createAnalysis, saveDocument } = await import('@/modules/m17/server/analyses');
const { loadScorableRubric } = await import('@/modules/m17/server/rubrics');
type Owner = { tenantId: string; userId: string };

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const users: string[] = [];

let alice: Owner; // tenant A
let bob: Owner; // tenant A, a colleague
let carol: Owner; // tenant B
let seededCriterion = '';
let otherCriterion = '';

const doc = (text: string) => ({ format: 'TXT' as const, text, pages: null, chars: text.length });

async function makeTenant(key: string, people: string[]): Promise<Owner[]> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(t.id);
  const out: Owner[] = [];
  for (const n of people) {
    const u = await admin!.user.create({ data: { email: `${RUN}-${key}-${n}@example.com`, name: n } });
    users.push(u.id);
    await admin!.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
    out.push({ tenantId: t.id, userId: u.id });
  }
  return out;
}

async function newAnalysis(owner: Owner): Promise<string> {
  const created = await createAnalysis(owner, SEEDED_RUBRIC);
  if (!created.ok) throw new Error(`createAnalysis: ${created.error}`);
  return created.analysis.id;
}

const statusOf = async (id: string) =>
  (await admin!.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  state.rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await state.rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(state.rls, SUITE);
  const seeded = await admin.interregRubricCriterion.findFirst({ where: { rubricId: SEEDED_RUBRIC }, select: { id: true } });
  if (!seeded) {
    skipReason = `rubric ${SEEDED_RUBRIC} is not seeded. Run \`pnpm db:seed\`.`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  seededCriterion = seeded.id;
  // A second grid, written as owner like the seed does.
  await admin.interregRubric.create({
    data: {
      id: OTHER_RUBRIC,
      programme: 'test',
      label: `${RUN} other`,
      source: {},
      maxRaw: 4,
      passRaw: 2,
      allowedMarks: [1, 2, 3, 4],
      criteria: { create: [{ criterionKey: 'only', officialRef: '1', section: 's', group: 'strategic', name: 'Only', position: 1, maxMark: 4 }] },
    },
  });
  otherCriterion = (await admin.interregRubricCriterion.findFirstOrThrow({ where: { rubricId: OTHER_RUBRIC } })).id;
  [alice, bob] = (await makeTenant('a', ['alice', 'bob'])) as [Owner, Owner];
  [carol] = (await makeTenant('b', ['carol'])) as [Owner];
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin) {
    for (const id of presentIds(tenants)) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.user.deleteMany({ where: { id: { in: presentIds(users) } } }).catch(() => {});
    await admin.interregRubric.deleteMany({ where: { id: OTHER_RUBRIC } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('saveDocument — the status rule (crw2 Ö1)', () => {
  test('project alone stays UPLOADING; call then makes it READY; a new call keeps it READY', async () => {
    const id = await newAnalysis(alice);
    expect(await statusOf(id)).toBe('UPLOADING');

    const p = await saveDocument(alice, id, 'project', 'draft.txt', doc('project text'));
    expect(p).toMatchObject({ ok: true, analysis: { status: 'UPLOADING', call: null, project: { fileName: 'draft.txt' } } });

    const c = await saveDocument(alice, id, 'call', 'guide.txt', doc('call text'));
    expect(c).toMatchObject({ ok: true, analysis: { status: 'READY' } });

    const again = await saveDocument(alice, id, 'call', 'guide-v2.txt', doc('call text v2'));
    expect(again).toMatchObject({ ok: true, analysis: { status: 'READY', call: { fileName: 'guide-v2.txt' } } });
    const row = await admin!.interregAnalysis.findUniqueOrThrow({ where: { id } });
    expect(row.callText).toBe('call text v2');
    expect(row.textExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 864e5);
  });

  test('the call guide alone is CALL_READY', async () => {
    const id = await newAnalysis(alice);
    expect(await saveDocument(alice, id, 'call', 'guide.txt', doc('call'))).toMatchObject({
      ok: true,
      analysis: { status: 'CALL_READY' },
    });
  });

  test('DONE and FAILED fall back to the rule and drop the earlier F2 result and marks', async () => {
    for (const before of ['DONE', 'FAILED'] as const) {
      const id = await newAnalysis(alice);
      await saveDocument(alice, id, 'call', 'guide.txt', doc('call'));
      await saveDocument(alice, id, 'project', 'draft.txt', doc('project'));
      await admin!.interregAnalysis.update({ where: { id }, data: { status: before } });
      await withTenantOn(state.rls!, alice.tenantId, async (tx) => {
        await tx.interregCriterionMark.create({
          data: { tenantId: alice.tenantId, analysisId: id, rubricId: SEEDED_RUBRIC, criterionId: seededCriterion, mark: 3 },
        });
        await tx.interregAnalysisResult.create({
          data: { tenantId: alice.tenantId, analysisId: id, rawScore: 40, score100: 71.4, passesThresholds: true, reportMarkdown: 'r', model: 'm', promptHash: 'h' },
        });
      });

      const res = await saveDocument(alice, id, 'project', 'draft-2.txt', doc('project 2'));
      expect(res, before).toMatchObject({ ok: true, analysis: { status: 'READY' } });
      expect(await admin!.interregCriterionMark.count({ where: { analysisId: id } }), before).toBe(0);
      expect(await admin!.interregAnalysisResult.count({ where: { analysisId: id } }), before).toBe(0);
    }
  });

  test('two uploads racing for the two slots end READY, every time', async () => {
    for (let i = 0; i < 8; i += 1) {
      const id = await newAnalysis(alice);
      const [c, p] = await Promise.all([
        saveDocument(alice, id, 'call', 'guide.txt', doc('call')),
        saveDocument(alice, id, 'project', 'draft.txt', doc('project')),
      ]);
      expect(c.ok && p.ok).toBe(true);
      expect(await statusOf(id), `round ${i}`).toBe('READY');
    }
  });

  test("a colleague's or another tenant's user gets not_found and the row does not change", async () => {
    const id = await newAnalysis(alice);
    await saveDocument(alice, id, 'call', 'guide.txt', doc('alice call'));
    expect(await saveDocument(bob, id, 'call', 'x.txt', doc('bob'))).toEqual({ ok: false, error: 'not_found' });
    expect(await saveDocument(carol, id, 'project', 'x.txt', doc('carol'))).toEqual({ ok: false, error: 'not_found' });
    // Carol's tenant id with Alice's analysis id: RLS hides the row.
    expect(await saveDocument({ tenantId: carol.tenantId, userId: alice.userId }, id, 'call', 'x.txt', doc('x'))).toEqual({
      ok: false,
      error: 'not_found',
    });
    const row = await admin!.interregAnalysis.findUniqueOrThrow({ where: { id } });
    expect([row.status, row.callText, row.projectText]).toEqual(['CALL_READY', 'alice call', null]);
  });

  test('the call guide first, then the project, ends READY', async () => {
    const id = await newAnalysis(alice);
    expect(await saveDocument(alice, id, 'call', 'guide.txt', doc('call'))).toMatchObject({ ok: true, analysis: { status: 'CALL_READY' } });
    expect(await saveDocument(alice, id, 'project', 'draft.txt', doc('project'))).toMatchObject({ ok: true, analysis: { status: 'READY' } });
    expect(await statusOf(id)).toBe('READY');
  });

  test('a new call guide on a READY analysis keeps it READY and drops the marks and the result', async () => {
    const id = await newAnalysis(alice);
    await saveDocument(alice, id, 'call', 'guide.txt', doc('call'));
    await saveDocument(alice, id, 'project', 'draft.txt', doc('project'));
    await withTenantOn(state.rls!, alice.tenantId, async (tx) => {
      await tx.interregCriterionMark.create({
        data: { tenantId: alice.tenantId, analysisId: id, rubricId: SEEDED_RUBRIC, criterionId: seededCriterion, mark: 3 },
      });
      await tx.interregAnalysisResult.create({
        data: { tenantId: alice.tenantId, analysisId: id, rawScore: 40, score100: 71.4, passesThresholds: true, reportMarkdown: 'r', model: 'm', promptHash: 'h' },
      });
    });

    expect(await saveDocument(alice, id, 'call', 'guide-v2.txt', doc('call v2'))).toMatchObject({ ok: true, analysis: { status: 'READY' } });
    expect(await admin!.interregCriterionMark.count({ where: { analysisId: id } })).toBe(0);
    expect(await admin!.interregAnalysisResult.count({ where: { analysisId: id } })).toBe(0);
  });

  test('another tenant sees no row of the analysis, not even the texts', async () => {
    const id = await newAnalysis(alice);
    await saveDocument(alice, id, 'call', 'guide.txt', doc('alice call'));
    const seen = await withTenantOn(state.rls!, carol.tenantId, (tx) => tx.interregAnalysis.count({ where: { id } }));
    expect(seen).toBe(0);
  });

  test('ANALYZING refuses the upload as analysis_busy and keeps the texts', async () => {
    const id = await newAnalysis(alice);
    await saveDocument(alice, id, 'call', 'guide.txt', doc('call'));
    await admin!.interregAnalysis.update({ where: { id }, data: { status: 'ANALYZING' } });
    expect(await saveDocument(alice, id, 'call', 'new.txt', doc('new'))).toEqual({ ok: false, error: 'analysis_busy' });
    const row = await admin!.interregAnalysis.findUniqueOrThrow({ where: { id } });
    expect([row.status, row.callText, row.callFileName]).toEqual(['ANALYZING', 'call', 'guide.txt']);
  });
});

describe('loadScorableRubric on the database (FO-196 B1)', () => {
  test('returns the seeded grid: 14 criteria, 56, pass at 37', async () => {
    const def = await loadScorableRubric(alice.tenantId, SEEDED_RUBRIC);
    expect(def.criteria).toHaveLength(14);
    expect([def.maxRaw, def.passRaw]).toEqual([56, 37]);
  });

  test('refuses a stored grid whose total no longer matches its criteria', async () => {
    await admin!.interregRubric.update({ where: { id: OTHER_RUBRIC }, data: { maxRaw: 9 } });
    try {
      await expect(loadScorableRubric(alice.tenantId, OTHER_RUBRIC)).rejects.toMatchObject({
        code: 'rubric_inconsistent',
        problems: ['maxRaw 9 ≠ Σ maxMark 4'],
      });
    } finally {
      await admin!.interregRubric.update({ where: { id: OTHER_RUBRIC }, data: { maxRaw: 4 } });
    }
    await expect(loadScorableRubric(alice.tenantId, OTHER_RUBRIC)).resolves.toMatchObject({ maxRaw: 4 });
  });

  test('an id that does not exist is rubric_not_found', async () => {
    await expect(loadScorableRubric(alice.tenantId, `${RUN}-missing`)).rejects.toMatchObject({ code: 'rubric_not_found' });
  });
});

describe('integrity in the database (se-fb D1, crw2 Ö5)', () => {
  const fkRefused = /foreign key|P2003/i;

  test("a tenant cannot file a result or a mark under another tenant's analysis", async () => {
    const aliceAnalysis = await newAnalysis(alice);
    await expect(
      withTenantOn(state.rls!, carol.tenantId, (tx) =>
        tx.interregAnalysisResult.create({
          data: { tenantId: carol.tenantId, analysisId: aliceAnalysis, rawScore: 1, score100: 1, passesThresholds: false, reportMarkdown: 'x', model: 'm', promptHash: 'h' },
        }),
      ),
    ).rejects.toThrow(fkRefused);
    await expect(
      withTenantOn(state.rls!, carol.tenantId, (tx) =>
        tx.interregCriterionMark.create({
          data: { tenantId: carol.tenantId, analysisId: aliceAnalysis, rubricId: SEEDED_RUBRIC, criterionId: seededCriterion, mark: 1 },
        }),
      ),
    ).rejects.toThrow(fkRefused);
    expect(await admin!.interregAnalysisResult.count({ where: { analysisId: aliceAnalysis } })).toBe(0);
    expect(await admin!.interregCriterionMark.count({ where: { analysisId: aliceAnalysis } })).toBe(0);
  });

  test('a mark cannot name a criterion of another rubric, nor claim another rubric for its analysis', async () => {
    const id = await newAnalysis(alice);
    const mark = (rubricId: string, criterionId: string) =>
      withTenantOn(state.rls!, alice.tenantId, (tx) =>
        tx.interregCriterionMark.create({ data: { tenantId: alice.tenantId, analysisId: id, rubricId, criterionId, mark: 2 } }),
      );
    // The analysis is on the seeded grid; the criterion is of the other one.
    await expect(mark(SEEDED_RUBRIC, otherCriterion)).rejects.toThrow(fkRefused);
    // Claiming the other grid matches the criterion but not the analysis.
    await expect(mark(OTHER_RUBRIC, otherCriterion)).rejects.toThrow(fkRefused);
    expect(await admin!.interregCriterionMark.count({ where: { analysisId: id } })).toBe(0);
    // The consistent mark is accepted.
    await expect(mark(SEEDED_RUBRIC, seededCriterion)).resolves.toMatchObject({ rubricId: SEEDED_RUBRIC });
  });

  test('deleting the analysis still cascades to its result and marks', async () => {
    const id = await newAnalysis(alice);
    await withTenantOn(state.rls!, alice.tenantId, async (tx) => {
      await tx.interregCriterionMark.create({
        data: { tenantId: alice.tenantId, analysisId: id, rubricId: SEEDED_RUBRIC, criterionId: seededCriterion, mark: 4 },
      });
      await tx.interregAnalysisResult.create({
        data: { tenantId: alice.tenantId, analysisId: id, rawScore: 4, score100: 7.1, passesThresholds: false, reportMarkdown: 'r', model: 'm', promptHash: 'h' },
      });
    });
    await admin!.interregAnalysis.delete({ where: { id } });
    expect(await admin!.interregCriterionMark.count({ where: { analysisId: id } })).toBe(0);
    expect(await admin!.interregAnalysisResult.count({ where: { analysisId: id } })).toBe(0);
  });
});

describe('rubric tables are read-only for fabrika_app at the privilege level (se-fb D3)', () => {
  const denied = /permission denied/i;

  test.each([
    ['INSERT', `INSERT INTO "InterregRubric" (id, programme, label, source, "maxRaw", "allowedMarks", "updatedAt") VALUES ('${RUN}-x', 'p', 'l', '{}', 1, '[1]', now())`],
    ['UPDATE', `UPDATE "InterregRubric" SET label = 'x' WHERE id = '${SEEDED_RUBRIC}'`],
    ['DELETE', `DELETE FROM "InterregRubricCriterion" WHERE "rubricId" = '${SEEDED_RUBRIC}'`],
    ['TRUNCATE', 'TRUNCATE "InterregRubricCriterion"'],
  ])('%s is permission denied', async (_cmd, sql) => {
    await expect(state.rls!.$executeRawUnsafe(sql)).rejects.toThrow(denied);
  });

  test('SELECT still works, and the seeded grid is intact', async () => {
    const rows = await state.rls!.interregRubricCriterion.count({ where: { rubricId: SEEDED_RUBRIC } });
    expect(rows).toBe(14);
    const grants = await admin!.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'fabrika_app' AND table_name IN ('InterregRubric', 'InterregRubricCriterion')
       ORDER BY 1`;
    expect([...new Set(grants.map((g) => g.privilege_type))]).toEqual(['SELECT']);
  });
});
