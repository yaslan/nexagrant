import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';
import type { TenantTx } from '@/lib/db';
import type { LlmCompletion, LlmGenerateOptions } from '@/lib/llm';

/**
 * FO-188 B2 — the M17 run (`runEvaluation`) on a real database, over `fabrika_app`
 * (NOBYPASSRLS, asserted). Only the model is replaced: `generateCompletion` returns
 * scripted answers, so the claim, the retry, the result transaction and the ledger
 * are measured as they run in production.
 *
 *  - the happy path: DONE, 14 marks, one ledger row of −3;
 *  - two malformed answers: FAILED, no ledger row (B1);
 *  - a stale ANALYZING claim is taken over;
 *  - a fresh ANALYZING claim gives analysis_busy;
 *  - another tenant's analysis, or a colleague's, gives not_found;
 *  - a claim taken over mid-run: the run writes nothing and the later claim stays (B3);
 *  - a reservation the database refuses: the run stops before the model (FO-274).
 *  - two runs of one tenant with credits for one: one runs, the balance never goes below zero (FO-274).
 *
 * `.live`: needs the docker-compose Postgres, `pnpm db:setup` (seeded rubric) and
 * `pnpm db:rls-role`. No provider is called.
 */

const SUITE = 'm17-interreg-evaluate.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `m17e-${Date.now().toString(36)}`;
const SEEDED_RUBRIC = 'interreg-next-bsb.call2.regular';
const GRANT = 500;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  /** Answers handed out in order, one per model call. */
  answers: [] as string[],
  /** Every call the run made, for its purposes and its message count. */
  calls: [] as LlmGenerateOptions[],
  /** Runs once, inside the next call, before its answer is returned. */
  beforeAnswer: undefined as (() => Promise<void>) | undefined,
  /** While set, every `creditLedger` write inside a tenant transaction fails. */
  failLedger: false,
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  // A ledger write that the database refuses: only `create` throws, and only inside the caller's
  // own transaction; the balance read beside it is the real one.
  const failingLedger = (tx: TenantTx): TenantTx =>
    new Proxy(tx, {
      get: (target, prop) => {
        if (prop !== 'creditLedger') return Reflect.get(target, prop);
        const ledger = Reflect.get(target, prop);
        return new Proxy(ledger, {
          get: (t, p) => (p === 'create' ? async () => { throw new Error('scripted ledger write failure'); } : Reflect.get(t, p)),
        });
      },
    });
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, (tx) => cb(state.failLedger ? failingLedger(tx) : tx)),
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
const { runEvaluation, EVALUATE_ATTEMPT_PURPOSE, EVALUATE_RETRY_PURPOSE, STALE_CLAIM_MS } = await import('@/modules/m17/server/evaluate');
type Owner = { tenantId: string; userId: string };

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let criterionKeys: string[] = [];
let programCheckKeys: string[] = [];
const tenants: string[] = [];
const users: string[] = [];

let alice: Owner; // tenant A
let bob: Owner; // tenant A, a colleague
let carol: Owner; // tenant B

const doc = (text: string) => ({ format: 'TXT' as const, text, pages: null, chars: text.length });

async function makeTenant(key: string, people: string[], grant = GRANT): Promise<Owner[]> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(t.id);
  await admin!.creditLedger.create({ data: { tenantId: t.id, delta: grant, reason: 'purchase' } });
  const out: Owner[] = [];
  for (const n of people) {
    const u = await admin!.user.create({ data: { email: `${RUN}-${key}-${n}@example.com`, name: n } });
    users.push(u.id);
    await admin!.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
    out.push({ tenantId: t.id, userId: u.id });
  }
  return out;
}

/** A READY analysis of the seeded grid: both documents uploaded. */
async function readyAnalysis(owner: Owner): Promise<string> {
  const created = await createAnalysis(owner, SEEDED_RUBRIC);
  if (!created.ok) throw new Error(`createAnalysis: ${created.error}`);
  const id = created.analysis.id;
  await saveDocument(owner, id, 'call', 'guide.txt', doc('call guide text'));
  const p = await saveDocument(owner, id, 'project', 'draft.txt', doc('project text'));
  if (!p.ok || p.analysis.status !== 'READY') throw new Error('readyAnalysis: not READY');
  return id;
}

/** A well-formed answer for the seeded grid: every criterion at 3, every programme check met. */
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

/** Fails the output schema: no criterion marks at all. */
const badAnswer = '{"criterionMarks": []}';

const statusOf = async (id: string) =>
  (await admin!.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

/** Put an analysis in a given status with a given `updatedAt` (the claim instant). */
async function setClaim(id: string, status: 'READY' | 'ANALYZING', updatedAt: Date): Promise<void> {
  await admin!.interregAnalysis.update({ where: { id }, data: { status, updatedAt } });
}

/**
 * The ledger deltas of one analysis, sorted. A run's rows carry `refId = "<analysis>:<claim ms>"`
 * (FO-274), so every run of the analysis is matched.
 */
async function ledgerFor(id: string): Promise<number[]> {
  const rows = await admin!.creditLedger.findMany({ where: { refId: { startsWith: id } }, select: { delta: true } });
  return rows.map((r) => r.delta).sort((a, b) => a - b);
}

/** The tenant's whole balance, as the ledger sums it. */
const balanceOf = async (tenantId: string) =>
  (await admin!.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } }))._sum.delta ?? 0;

const marksOf = (id: string) => admin!.interregCriterionMark.count({ where: { analysisId: id } });
const resultsOf = (id: string) => admin!.interregAnalysisResult.count({ where: { analysisId: id } });

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
  const rubric = await admin.interregRubric.findUnique({ where: { id: SEEDED_RUBRIC }, select: { programChecks: true, criteria: { select: { criterionKey: true } } } });
  if (!rubric) {
    skipReason = `rubric ${SEEDED_RUBRIC} is not seeded. Run \`pnpm db:seed\`.`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  criterionKeys = rubric.criteria.map((c) => c.criterionKey);
  programCheckKeys = (rubric.programChecks as { key: string }[]).map((c) => c.key);
  [alice, bob] = (await makeTenant('a', ['alice', 'bob'])) as [Owner, Owner];
  [carol] = (await makeTenant('b', ['carol'])) as [Owner];
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
  state.answers = [];
  state.calls = [];
  state.beforeAnswer = undefined;
  state.failLedger = false;
});

afterAll(async () => {
  if (admin) {
    for (const id of presentIds(tenants)) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.user.deleteMany({ where: { id: { in: presentIds(users) } } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('runEvaluation — the run on a real database (FO-188 B2)', () => {
  test('a good answer: DONE, 14 marks, one reservation of −3, both model calls priced as free attempts', async () => {
    const id = await readyAnalysis(alice);
    state.answers.push(goodAnswer());

    const run = await runEvaluation(alice, id, { locale: 'en' });

    expect(run).toMatchObject({ ok: true, result: { credits: 3, assessmentKind: 'internal_pre_assessment' } });
    expect(await statusOf(id)).toBe('DONE');
    expect(await marksOf(id)).toBe(14);
    expect(await resultsOf(id)).toBe(1);
    expect(await ledgerFor(id)).toEqual([-3]);
    expect(state.calls.map((c) => c.purpose)).toEqual([EVALUATE_ATTEMPT_PURPOSE]);
  });

  test('two malformed answers: FAILED, no marks, no result, the reservation is released (B1, FO-274)', async () => {
    const id = await readyAnalysis(alice);
    state.answers.push(badAnswer, badAnswer);

    const run = await runEvaluation(alice, id, { locale: 'en' });

    expect(run).toEqual({ ok: false, error: 'evaluation_failed' });
    expect(await statusOf(id)).toBe('FAILED');
    expect(await marksOf(id)).toBe(0);
    expect(await resultsOf(id)).toBe(0);
    expect(await ledgerFor(id)).toEqual([-3, 3]);
    expect(state.calls.map((c) => c.purpose)).toEqual([EVALUATE_ATTEMPT_PURPOSE, EVALUATE_RETRY_PURPOSE]);
  });

  test('a malformed answer then a good one: DONE, and still one reservation of −3', async () => {
    const id = await readyAnalysis(alice);
    state.answers.push(badAnswer, goodAnswer());

    const run = await runEvaluation(alice, id, { locale: 'en' });

    expect(run).toMatchObject({ ok: true, result: { credits: 3 } });
    expect(await statusOf(id)).toBe('DONE');
    expect(await ledgerFor(id)).toEqual([-3]);
    expect(state.calls.map((c) => c.purpose)).toEqual([EVALUATE_ATTEMPT_PURPOSE, EVALUATE_RETRY_PURPOSE]);
  });

  test('two runs at once, credits for one: exactly one reaches the model and the balance never goes below zero (FO-274)', async () => {
    const [dan, erin] = (await makeTenant('d', ['dan', 'erin'], 3)) as [Owner, Owner];
    const idDan = await readyAnalysis(dan);
    const idErin = await readyAnalysis(erin);
    state.answers.push(goodAnswer(), goodAnswer());

    const [first, second] = await Promise.all([
      runEvaluation(dan, idDan, { locale: 'en' }),
      runEvaluation(erin, idErin, { locale: 'en' }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
    expect(outcomes.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'insufficient_credits' }]);
    expect(state.calls.filter((c) => c.purpose === EVALUATE_ATTEMPT_PURPOSE)).toHaveLength(1);
    expect(await balanceOf(dan.tenantId)).toBe(0);
  });

  test('a stale ANALYZING claim (a run that died) is taken over', async () => {
    const id = await readyAnalysis(alice);
    await setClaim(id, 'ANALYZING', new Date(Date.now() - STALE_CLAIM_MS - 60_000));
    state.answers.push(goodAnswer());

    const run = await runEvaluation(alice, id, { locale: 'en' });

    expect(run).toMatchObject({ ok: true });
    expect(await statusOf(id)).toBe('DONE');
    expect(await ledgerFor(id)).toEqual([-3]);
  });

  test('a dead run keeps its reservation until the takeover: the takeover releases it, then reserves its own (FO-274)', async () => {
    const id = await readyAnalysis(alice);
    const died = new Date(Date.now() - STALE_CLAIM_MS - 60_000);
    // What the dead run wrote before it died: its reservation, and no result.
    await admin!.creditLedger.create({ data: { tenantId: alice.tenantId, delta: -3, reason: 'usage:M17', refId: `${id}:${died.getTime()}` } });
    await setClaim(id, 'ANALYZING', died);
    state.answers.push(goodAnswer());

    const run = await runEvaluation(alice, id, { locale: 'en' });

    expect(run).toMatchObject({ ok: true });
    expect(await ledgerFor(id)).toEqual([-3, -3, 3]);
  });

  test('a fresh ANALYZING claim gives analysis_busy, and the other run is left alone', async () => {
    const id = await readyAnalysis(alice);
    const claimed = new Date(Date.now() - 1000);
    await setClaim(id, 'ANALYZING', claimed);

    const run = await runEvaluation(alice, id, { locale: 'en' });

    expect(run).toEqual({ ok: false, error: 'analysis_busy' });
    expect(state.calls).toHaveLength(0);
    expect(await statusOf(id)).toBe('ANALYZING');
    expect(
      (await admin!.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt.getTime(),
    ).toBe(claimed.getTime());
    expect(await ledgerFor(id)).toEqual([]);
  });

  test("another tenant's analysis, and a colleague's, give not_found and no model call", async () => {
    const id = await readyAnalysis(alice);

    expect(await runEvaluation(carol, id, { locale: 'en' })).toEqual({ ok: false, error: 'not_found' });
    expect(await runEvaluation({ tenantId: carol.tenantId, userId: alice.userId }, id, { locale: 'en' })).toEqual({ ok: false, error: 'not_found' });
    expect(await runEvaluation(bob, id, { locale: 'en' })).toEqual({ ok: false, error: 'not_found' });

    expect(state.calls).toHaveLength(0);
    expect(await statusOf(id)).toBe('READY');
    expect(await ledgerFor(id)).toEqual([]);
  });

  test('a reservation the database refuses: the run stops before the model, the analysis stays READY, nothing is charged', async () => {
    const id = await readyAnalysis(alice);
    state.answers.push(goodAnswer());
    state.failLedger = true;

    await expect(runEvaluation(alice, id, { locale: 'en' })).rejects.toThrow('scripted ledger write failure');

    expect(state.calls).toHaveLength(0);
    expect(await statusOf(id)).toBe('READY');
    expect(await marksOf(id)).toBe(0);
    expect(await resultsOf(id)).toBe(0);
    expect(await ledgerFor(id)).toEqual([]);
  });

  test('a claim taken over during the run: this run writes nothing, its reservation is released, the later claim stays (B3)', async () => {
    const id = await readyAnalysis(alice);
    const takeover = new Date(Date.now() + 5000);
    state.beforeAnswer = () => setClaim(id, 'ANALYZING', takeover);
    state.answers.push(goodAnswer());

    const run = await runEvaluation(alice, id, { locale: 'en' });

    expect(run).toEqual({ ok: false, error: 'evaluation_failed' });
    expect(await statusOf(id)).toBe('ANALYZING');
    expect(
      (await admin!.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt.getTime(),
    ).toBe(takeover.getTime());
    expect(await marksOf(id)).toBe(0);
    expect(await resultsOf(id)).toBe(0);
    expect(await ledgerFor(id)).toEqual([-3, 3]);
  });
});
