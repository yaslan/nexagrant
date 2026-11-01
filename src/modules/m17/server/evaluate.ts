/**
 * The M17 F2 run (FO-188): one analysis's call guide and project file against its
 * grid, through `generateCompletion` (CLAUDE.md rule 5: AiUsageLog + credits).
 *
 *   READY | DONE | FAILED (or an ANALYZING claim older than STALE_CLAIM_MS)
 *     → ANALYZING (claimed atomically; uploads are refused meanwhile)
 *     → DONE   result + one mark per criterion written in one transaction
 *     → FAILED anything else; the documents stay, the user may run it again.
 *
 * The model returns marks; the score, the knockout flags and the report are
 * computed here from the marks and the grid (`scoreMarks`, `knockoutFlags`,
 * `buildReportMarkdown`). An answer that fails the schema is asked again once.
 *
 * Both model calls are priced 0 (`M17:evaluate-attempt`, `M17:evaluate-retry`).
 * The price (`M17:evaluate`) is booked once, as one ledger row, in the same
 * transaction that saves the result — a run that fails, or whose claim was taken
 * over, costs nothing.
 *
 * The ANALYZING claim is identified by its `updatedAt` (the claim instant). The
 * writes that end a run (DONE, FAILED) match on it, so a run whose claim was
 * taken over by a later one cannot overwrite that later run's state.
 */
import type { Prisma } from '@prisma/client';
import { createTranslator } from 'next-intl';

import { renderPrompt, type PromptLocale } from '@/lib/ai/prompts';
import { withTenant } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import {
  creditBalanceIn,
  generateCompletion,
  hashMessages,
  lockTenantCredits,
  releaseAiReservation,
  reserveAiAction,
  resolveCredits,
  type LlmMessage,
} from '@/lib/llm';
import { requireActionId } from '@/lib/required-id';

import { knockoutFlags, scoreMarks } from '../rubric';
import type { Owner } from './analyses';
import { fitContext, serializeRubric, type PromptRubric } from './context';
import { parseEvaluation, type EvaluationGrid, type EvaluationOutput } from './evaluation-output';
import { buildReportMarkdown, redFlagsOf } from './report';
import { scorableDef, toRubricView } from './rubrics';
import trMessages from '../../../../messages/tr.json';
import enMessages from '../../../../messages/en.json';

const MESSAGES = { tr: trMessages, en: enMessages };

export const EVALUATE_MODULE = 'M17';
/** The price of a delivered run (`AI_ACTION_CREDITS`); reserved before the first model call, released if no result is written (FO-274). */
export const EVALUATE_PURPOSE = 'evaluate';
export const EVALUATE_ATTEMPT_PURPOSE = 'evaluate-attempt';
export const EVALUATE_RETRY_PURPOSE = 'evaluate-retry';

/** `maxDuration` of the POST route (`app/api/interreg-review/analyses/[id]/evaluate/route.ts`). Keep them equal. */
const MAX_RUN_MS = 300 * 1000;

/**
 * Time kept back from the run's deadline for the writes after the last provider answer
 * (the result transaction, or FAILED). Without it the platform can kill the route first.
 */
const RUN_DEADLINE_MARGIN_MS = 30 * 1000;

/**
 * A run that crashed mid-way (process killed) leaves ANALYZING; after this it may be
 * claimed again. A margin over MAX_RUN_MS: a run the platform has not killed is
 * not taken over (FO-188 Ö1).
 */
export const STALE_CLAIM_MS = MAX_RUN_MS + 60 * 1000;

const RUN_RUBRIC_SELECT = {
  id: true,
  programme: true,
  label: true,
  isDefault: true,
  allowedMarks: true,
  maxRaw: true,
  passRaw: true,
  budgetMinMinor: true,
  budgetMaxMinor: true,
  currency: true,
  maxDurationMonths: true,
  programChecks: true,
  criteria: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      criterionKey: true,
      officialRef: true,
      section: true,
      group: true,
      name: true,
      maxMark: true,
      knockoutBelow: true,
      subQuestions: true,
      afSections: true,
      evidenceExpectation: true,
    },
  },
} satisfies Prisma.InterregRubricSelect;

function strings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function checks(value: Prisma.JsonValue): { key: string; rule: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) =>
    v && typeof v === 'object' && !Array.isArray(v) && typeof v.key === 'string' && typeof v.rule === 'string'
      ? [{ key: v.key, rule: v.rule }]
      : [],
  );
}

export interface InterregCriterionMarkView {
  criterionKey: string;
  officialRef: string;
  mark: number;
  maxMark: number;
  strengths: string[];
  weaknesses: string[];
  evidence: { quote: string; location: string }[];
}

export interface InterregResultView {
  analysisId: string;
  assessmentKind: 'internal_pre_assessment';
  rubricId: string;
  rawScore: number;
  maxRaw: number;
  score100: number;
  passesThresholds: boolean;
  knockouts: string[];
  reportMarkdown: string;
  marks: InterregCriterionMarkView[];
  model: string;
  credits: number;
  inputTokens: number;
  outputTokens: number;
  callCharsOmitted: number;
}

export type EvaluateError = 'not_found' | 'not_ready' | 'analysis_busy' | 'insufficient_credits' | 'evaluation_failed';
export type EvaluateResult = { ok: true; result: InterregResultView } | { ok: false; error: EvaluateError };

type Claimed = {
  rubricId: string;
  callText: string;
  projectText: string;
  /** The claim's `updatedAt`: this run's identity on the row (FO-188 B3). */
  claimedAt: Date;
};

/** READY/DONE/FAILED (or a stale ANALYZING) with both texts → ANALYZING, in one UPDATE. */
async function claim(owner: Owner, analysisId: string, now: Date): Promise<{ ok: true; row: Claimed } | { ok: false; error: EvaluateError }> {
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');
  // An Invalid Date would turn `gt: now` into a filter that matches nothing, and every analysis
  // would answer `not_ready` with no hint why (FO-191 B4).
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('claim: now must be a valid Date');
  return withTenant(tenantId, async (tx) => {
    // The balance check, the claim and the reservation are one step per tenant (FO-274): the lock
    // keeps a second run of this tenant from reading the same credits before this one debits them.
    await lockTenantCredits(tx, tenantId);
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
    // A run that died still holds its reservation; release it before the balance is read.
    const dead = await tx.interregAnalysis.findFirst({
      where: { id, tenantId, userId, status: 'ANALYZING', updatedAt: { lt: staleBefore } },
      select: { updatedAt: true },
    });
    if (dead) await releaseAiReservation(tx, { tenantId, module: EVALUATE_MODULE, refId: runRef(id, dead.updatedAt) });
    // Refused before the claim, while nothing has changed: a run the tenant cannot pay for.
    if ((await creditBalanceIn(tx, tenantId)) < resolveCredits(EVALUATE_MODULE, EVALUATE_PURPOSE).credits) {
      return { ok: false, error: 'insufficient_credits' } as const;
    }
    const { count } = await tx.interregAnalysis.updateMany({
      where: {
        id,
        tenantId,
        userId,
        callText: { not: null },
        projectText: { not: null },
        // A text past its 30 days is no longer ours to read, even before the nightly purge
        // reaches it (FO-191 B4); the user is asked to upload again (`not_ready`).
        callTextExpiresAt: { gt: now },
        projectTextExpiresAt: { gt: now },
        OR: [{ status: { in: ['READY', 'DONE', 'FAILED'] } }, { status: 'ANALYZING', updatedAt: { lt: staleBefore } }],
      },
      data: { status: 'ANALYZING', updatedAt: now },
    });
    const row = await tx.interregAnalysis.findFirst({
      where: { id, tenantId, userId },
      select: { status: true, rubricId: true, callText: true, projectText: true },
    });
    if (!row) return { ok: false, error: 'not_found' } as const;
    if (count === 0) return { ok: false, error: row.status === 'ANALYZING' ? 'analysis_busy' : 'not_ready' } as const;
    const reserved = await reserveAiAction(tx, {
      tenantId,
      module: EVALUATE_MODULE,
      purpose: EVALUATE_PURPOSE,
      refId: runRef(id, now),
    });
    // The balance was read under the same lock a moment ago; a refusal here is a broken invariant.
    if (!reserved) throw new Error('credit reservation refused after the balance check');
    return { ok: true, row: { rubricId: row.rubricId, callText: row.callText ?? '', projectText: row.projectText ?? '', claimedAt: now } } as const;
  });
}

/** The ledger reference of one run: the analysis and its claim instant, so each run's reservation is its own. */
export function runRef(analysisId: string, claimedAt: Date): string {
  return `${analysisId}:${claimedAt.getTime()}`;
}

/**
 * ANALYZING → FAILED, only while this run still holds the claim. The run's reservation is released
 * either way: a run that wrote no result must not keep the credits it reserved (FO-274).
 */
async function markFailed(owner: Owner, analysisId: string, claimedAt: Date): Promise<void> {
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');
  await withTenant(tenantId, async (tx) => {
    await lockTenantCredits(tx, tenantId);
    await tx.interregAnalysis.updateMany({
      where: { id, tenantId, userId, status: 'ANALYZING', updatedAt: claimedAt },
      data: { status: 'FAILED' },
    });
    await releaseAiReservation(tx, { tenantId, module: EVALUATE_MODULE, refId: runRef(id, claimedAt) });
  });
}

export interface EvaluateOptions {
  locale: PromptLocale;
  now?: Date;
}

export async function runEvaluation(owner: Owner, analysisId: string, opts: EvaluateOptions): Promise<EvaluateResult> {
  const id = requireActionId(analysisId, 'analysisId');
  const now = opts.now ?? new Date();

  // Claim, balance check and reservation happen in one locked transaction (see claim).
  const claimed = await claim(owner, id, now);
  if (!claimed.ok) return claimed;

  try {
    return { ok: true, result: await evaluateClaimed(owner, id, claimed.row, opts.locale) };
  } catch (error) {
    // No document text in the log: the analysis id and the reason are enough to find the AiUsageLog row.
    console.error('[interreg-review][evaluate]', id, errorMessage(error));
    await markFailed(owner, id, claimed.row.claimedAt);
    return { ok: false, error: 'evaluation_failed' };
  }
}

async function evaluateClaimed(owner: Owner, analysisId: string, row: Claimed, locale: PromptLocale): Promise<InterregResultView> {
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');
  const rubric = await withTenant(tenantId, (tx) =>
    tx.interregRubric.findUniqueOrThrow({ where: { id: row.rubricId }, select: RUN_RUBRIC_SELECT }),
  );
  const view = toRubricView(rubric);
  const def = scorableDef(view);
  const promptRubric: PromptRubric = {
    id: rubric.id,
    label: rubric.label,
    allowedMarks: view.allowedMarks,
    programChecks: checks(rubric.programChecks),
    criteria: rubric.criteria.map((c) => ({
      criterionKey: c.criterionKey,
      officialRef: c.officialRef,
      section: c.section,
      name: c.name,
      maxMark: Number(c.maxMark),
      subQuestions: strings(c.subQuestions),
      afSections: strings(c.afSections),
      evidenceExpectation: c.evidenceExpectation,
    })),
  };
  const grid: EvaluationGrid = { def, programCheckKeys: promptRubric.programChecks.map((p) => p.key) };
  const fitted = fitContext(row.callText, row.projectText);

  const messages: LlmMessage[] = [
    { role: 'system', content: renderPrompt('m17/call-context', { call_context: fitted.callText }, locale) },
    {
      role: 'user',
      content: renderPrompt('m17/evaluate', { rubric: serializeRubric(promptRubric), project_context: fitted.projectText }, locale),
    },
  ];
  // The run's budget counts from the claim, less a margin: each provider request is cut off at
  // this instant (FO-188 Ö1), so the run ends before the route's maxDuration kills it mid-write.
  // The clock starts at the claim, a few steps after the request began (gate, credit check):
  // that gap is small and is not counted here.
  const base = {
    tenantId,
    userId,
    module: EVALUATE_MODULE,
    deadlineAt: row.claimedAt.getTime() + MAX_RUN_MS - RUN_DEADLINE_MARGIN_MS,
    // The price was reserved in the claim; the balance pre-check of generateCompletion would
    // refuse the run once the reservation has taken the balance to 0 (FO-274).
    creditsReserved: true,
  };

  // Both calls are priced 0; the run's price is booked once, after the result is saved.
  const first = await generateCompletion({ ...base, purpose: EVALUATE_ATTEMPT_PURPOSE, messages });
  let completion = first;
  let parsed = parseEvaluation(first.text, grid);
  let usage = { inputTokens: first.inputTokens, outputTokens: first.outputTokens };
  if (!parsed.ok) {
    const retry: LlmMessage[] = [
      ...messages,
      { role: 'assistant', content: first.text },
      { role: 'user', content: renderPrompt('m17/evaluate-retry', { problems: parsed.problems.slice(0, 20).map((p) => `- ${p}`).join('\n') }, locale) },
    ];
    completion = await generateCompletion({ ...base, purpose: EVALUATE_RETRY_PURPOSE, messages: retry });
    usage = {
      inputTokens: usage.inputTokens + completion.inputTokens,
      outputTokens: usage.outputTokens + completion.outputTokens,
    };
    parsed = parseEvaluation(completion.text, grid);
    if (!parsed.ok) throw new Error(`answer failed the output schema twice: ${parsed.problems.slice(0, 5).join('; ')}`);
  }

  const output: EvaluationOutput = parsed.output;
  const marks = Object.fromEntries(output.criterionMarks.map((m) => [m.criterionKey, m.mark]));
  const score = scoreMarks(def, marks);
  const flags = knockoutFlags(def, marks);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'InterregReview' });
  const criteria = view.criteria.map((c) => ({ criterionKey: c.criterionKey, officialRef: c.officialRef, maxMark: c.maxMark }));
  const reportInput = {
    t: (key: string, values?: Record<string, string | number>) => t(key as never, values as never),
    locale,
    criteria,
    programCheckKeys: grid.programCheckKeys,
    score,
    flags,
    output,
    callCharsOmitted: fitted.callCharsOmitted,
    projectCharsOmitted: fitted.projectCharsOmitted,
  };
  const reportMarkdown = buildReportMarkdown(reportInput);
  const redFlags = redFlagsOf(reportInput);
  const promptHash = hashMessages(messages);
  const criterionIds = new Map(rubric.criteria.map((c) => [c.criterionKey, c.id]));

  // The price was reserved before the first model call (claim). The result and its status change
  // are one transaction; if they fail, the run's reservation is released by markFailed.
  const { credits } = resolveCredits(EVALUATE_MODULE, EVALUATE_PURPOSE);
  await withTenant(tenantId, async (tx) => {
    await tx.interregCriterionMark.deleteMany({ where: { analysisId: id, tenantId } });
    await tx.interregAnalysisResult.deleteMany({ where: { analysisId: id, tenantId } });
    await tx.interregAnalysisResult.create({
      data: {
        tenantId,
        analysisId: id,
        rawScore: score.raw,
        score100: score.score100,
        passesThresholds: score.passesThresholds,
        knockouts: score.knockouts,
        reportMarkdown,
        redFlags: redFlags as unknown as Prisma.InputJsonValue,
        improvements: output.improvements,
        rewriteSample: output.rewrite,
        programChecks: output.programChecks,
        model: completion.model,
        promptHash,
      },
    });
    await tx.interregCriterionMark.createMany({
      data: output.criterionMarks.map((m) => ({
        tenantId,
        analysisId: id,
        rubricId: rubric.id,
        criterionId: criterionIds.get(m.criterionKey)!,
        mark: m.mark,
        strengths: m.strengths,
        weaknesses: m.weaknesses,
        evidenceQuote: m.evidence[0]?.quote ?? null,
        evidenceLocator: m.evidence[0]?.location ?? null,
        evidence: m.evidence,
      })),
    });
    // Still this run's: a later claim moved `updatedAt`, so this write matches nothing and the
    // whole transaction (marks and result included) rolls back.
    const done = await tx.interregAnalysis.updateMany({
      // Both texts still present: the purge may have emptied a slot while the model ran, and a
      // result quoting text that is gone would outlive it (the slot's expiry is NULL then, so no
      // later purge would match it) — FO-191 B4. The transaction rolls back and the run is FAILED.
      where: { id, tenantId, userId, status: 'ANALYZING', updatedAt: row.claimedAt, callText: { not: null }, projectText: { not: null } },
      data: { status: 'DONE' },
    });
    if (done.count !== 1) throw new Error('analysis claim was taken over, or a document expired, before the result was written');
  });

  return {
    analysisId: id,
    assessmentKind: 'internal_pre_assessment',
    rubricId: rubric.id,
    rawScore: score.raw,
    maxRaw: score.maxRaw,
    score100: score.score100,
    passesThresholds: score.passesThresholds,
    knockouts: score.knockouts,
    reportMarkdown,
    marks: output.criterionMarks.map((m) => ({
      criterionKey: m.criterionKey,
      officialRef: view.criteria.find((c) => c.criterionKey === m.criterionKey)!.officialRef,
      mark: m.mark,
      maxMark: view.criteria.find((c) => c.criterionKey === m.criterionKey)!.maxMark,
      strengths: m.strengths,
      weaknesses: m.weaknesses,
      evidence: m.evidence,
    })),
    model: completion.model,
    credits,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    callCharsOmitted: fitted.callCharsOmitted,
  };
}

/** The stored result of a DONE analysis, for GET …/result. */
export async function getResult(owner: Owner, analysisId: string): Promise<Omit<InterregResultView, 'credits' | 'inputTokens' | 'outputTokens' | 'callCharsOmitted'> | null> {
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');
  return withTenant(tenantId, async (tx) => {
    const analysis = await tx.interregAnalysis.findFirst({
      where: { id, tenantId, userId, status: 'DONE' },
      select: {
        rubricId: true,
        rubric: { select: { maxRaw: true } },
        result: true,
        marks: { select: { mark: true, strengths: true, weaknesses: true, evidence: true, criterion: { select: { criterionKey: true, officialRef: true, maxMark: true, position: true } } } },
      },
    });
    if (!analysis?.result) return null;
    const r = analysis.result;
    return {
      analysisId: id,
      assessmentKind: 'internal_pre_assessment',
      rubricId: analysis.rubricId,
      rawScore: Number(r.rawScore),
      maxRaw: Number(analysis.rubric.maxRaw),
      score100: Number(r.score100),
      passesThresholds: r.passesThresholds,
      knockouts: strings(r.knockouts),
      reportMarkdown: r.reportMarkdown,
      model: r.model,
      marks: [...analysis.marks]
        .sort((a, b) => a.criterion.position - b.criterion.position)
        .map((m) => ({
          criterionKey: m.criterion.criterionKey,
          officialRef: m.criterion.officialRef,
          mark: Number(m.mark),
          maxMark: Number(m.criterion.maxMark),
          strengths: strings(m.strengths),
          weaknesses: strings(m.weaknesses),
          evidence: Array.isArray(m.evidence)
            ? m.evidence.flatMap((e) =>
                e && typeof e === 'object' && !Array.isArray(e) && typeof e.quote === 'string' && typeof e.location === 'string'
                  ? [{ quote: e.quote, location: e.location }]
                  : [],
              )
            : [],
        })),
    };
  });
}
