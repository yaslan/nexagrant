import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';
import type { LlmCompletion, LlmGenerateOptions } from '@/lib/llm';

/**
 * FO-281 K-1 (follow-up to the FO-191 review, PR #225), on a real database over `fabrika_app` (NOBYPASSRLS,
 * asserted). Only the model is replaced by scripted answers.
 *
 * The DONE write in `evaluate.ts` carries two guards: `updatedAt: row.claimedAt` (the run still holds the
 * claim) and `callText/projectText: { not: null }` (both texts are still there). The retention purge goes
 * through Prisma, which bumps `updatedAt` on every write, so the first guard alone already refuses a run that
 * a purge emptied (tests/m17-interreg-fo191.live.test.ts). That means the second guard is never what decides
 * there: remove it and everything stays green.
 *
 * This test empties a slot with raw SQL, which does not touch `updatedAt`: status and `updatedAt` still say
 * "this run's claim", so `{ not: null }` is the only thing standing between the run and a DONE result that
 * quotes text that no longer exists. Measured by mutation (docs/agent-results/FO-281-se-fb.md).
 */

const SUITE = 'm17-interreg-fo191-guards.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `m17g-${Date.now().toString(36)}`;
const SEEDED_RUBRIC = 'interreg-next-bsb.call2.regular';

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  answers: [] as string[],
  calls: [] as LlmGenerateOptions[],
  /** Runs once, inside the next call, before its answer is returned. */
  beforeAnswer: undefined as (() => Promise<void>) | undefined,
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) => actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

vi.mock('@/lib/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm')>();
  return {
    ...actual,
    generateCompletion: async (options: LlmGenerateOptions): Promise<LlmCompletion> => {
      state.calls.push(options);
      const hook = state.beforeAnswer;
      state.beforeAnswer = undefined;
      await hook?.();
      const text = state.answers.shift();
      if (text === undefined) throw new Error('scripted model: no answer left');
      return { text, inputTokens: 1000, outputTokens: 500, credits: 0, provider: 'anthropic', model: 'scripted', stopReason: 'end_turn' };
    },
  };
});

const { createDbClient } = await import('@/lib/db');
const { createAnalysis, saveDocument } = await import('@/modules/m17/server/analyses');
const { runEvaluation } = await import('@/modules/m17/server/evaluate');
type Owner = { tenantId: string; userId: string };

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let criterionKeys: string[] = [];
let programCheckKeys: string[] = [];
let tenantId = '';
let userId = '';
let owner: Owner;

const doc = (text: string) => ({ format: 'TXT' as const, text, pages: null, chars: text.length });

async function readyAnalysis(): Promise<string> {
  const created = await createAnalysis(owner, SEEDED_RUBRIC);
  if (!created.ok) throw new Error(`createAnalysis: ${created.error}`);
  const id = created.analysis.id;
  await saveDocument(owner, id, 'call', 'guide.txt', doc('call guide text'));
  const p = await saveDocument(owner, id, 'project', 'draft.txt', doc('project text'));
  if (!p.ok || p.analysis.status !== 'READY') throw new Error('readyAnalysis: not READY');
  return id;
}

function goodAnswer(): string {
  return JSON.stringify({
    rubricId: SEEDED_RUBRIC,
    callGridNote: null,
    criterionMarks: criterionKeys.map((k) => ({
      criterionKey: k,
      mark: 3,
      strengths: [`${k} strength`],
      weaknesses: [`${k} weakness`],
      evidence: [{ quote: `quote for ${k}`, location: 'C.4' }],
    })),
    programChecks: programCheckKeys.map((key) => ({ key, status: 'met', note: `${key} ok` })),
    redFlags: [],
    improvements: [],
    rewrite: { originalExcerpt: 'We will do things.', location: 'C.2.1', revisedEn: 'The partnership will jointly develop…' },
  });
}

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
  const rubric = await admin.interregRubric.findUnique({
    where: { id: SEEDED_RUBRIC },
    select: { programChecks: true, criteria: { select: { criterionKey: true } } },
  });
  if (!rubric) {
    skipReason = `rubric ${SEEDED_RUBRIC} is not seeded. Run \`pnpm db:seed\`.`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  criterionKeys = rubric.criteria.map((c) => c.criterionKey);
  programCheckKeys = (rubric.programChecks as { key: string }[]).map((c) => c.key);
  const t = await admin.tenant.create({
    data: { name: `${RUN} g`, slug: `${RUN}-g`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenantId = t.id;
  await admin.creditLedger.create({ data: { tenantId, delta: 500, reason: 'purchase' } });
  const u = await admin.user.create({ data: { email: `${RUN}-g@example.com`, name: 'gina' } });
  userId = u.id;
  await admin.membership.create({ data: { tenantId, userId, role: 'MEMBER' } });
  owner = { tenantId, userId };
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
  state.answers = [];
  state.calls = [];
  state.beforeAnswer = undefined;
});

afterAll(async () => {
  if (admin) {
    for (const id of presentIds([tenantId])) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.user.deleteMany({ where: { id: { in: presentIds([userId]) } } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('FO-281 K-1 — the DONE write refuses a slot emptied without touching updatedAt', () => {
  for (const slot of ['call', 'project'] as const) {
    test(`${slot} text set to NULL by raw SQL while the model runs: run FAILS, no result, no mark, no charge`, async () => {
      const id = await readyAnalysis();
      let statusInHook: string | undefined;
      state.answers.push(goodAnswer());
      state.beforeAnswer = async () => {
        // Raw SQL: Prisma's client-side `@updatedAt` does not run, so status stays ANALYZING and `updatedAt`
        // stays the claim instant. The expiry column goes with the text (CHECK InterregAnalysis_text_expiry_pair).
        if (slot === 'call') await admin!.$executeRaw`UPDATE "InterregAnalysis" SET "callText" = NULL, "callTextExpiresAt" = NULL WHERE "id" = ${id}`;
        else await admin!.$executeRaw`UPDATE "InterregAnalysis" SET "projectText" = NULL, "projectTextExpiresAt" = NULL WHERE "id" = ${id}`;
        // Recorded here, asserted after `runEvaluation` returns: an `expect` thrown inside this hook lands in
        // runEvaluation's own catch, which turns it into the very `evaluation_failed` this test wants (FO-293 D1).
        statusInHook = (await admin!.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
      };

      const run = await runEvaluation(owner, id, { locale: 'en' });

      expect(statusInHook, 'the hook ran, and the run still looked like the claim holder when it did').toBe('ANALYZING');
      expect(run).toEqual({ ok: false, error: 'evaluation_failed' });
      expect(await admin!.interregAnalysisResult.count({ where: { analysisId: id } })).toBe(0);
      expect(await admin!.interregCriterionMark.count({ where: { analysisId: id } })).toBe(0);
      // `startsWith`, not equality: after PR #228 the ledger refId is `<id>:<ms>`, so `refId: id` matches nothing
      // and would pass even with the refund removed. Net zero holds on both bases (no row / charge + refund).
      const ledger = await admin!.creditLedger.aggregate({ where: { tenantId, refId: { startsWith: id } }, _sum: { delta: true } });
      expect(ledger._sum.delta ?? 0, 'no net charge for the failed run').toBe(0);
      expect((await admin!.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { status: true } })).status).toBe('FAILED');
    });
  }

  test('control: the same run without the raw UPDATE reaches DONE', async () => {
    const id = await readyAnalysis();
    state.answers.push(goodAnswer());

    expect(await runEvaluation(owner, id, { locale: 'en' })).toMatchObject({ ok: true });
    expect((await admin!.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { status: true } })).status).toBe('DONE');
  });
});
