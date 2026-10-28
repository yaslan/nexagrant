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
 * `buildReportMarkdown`). An answer that fails the schema is asked again once
 * (`M17:evaluate-retry`, priced 0 — the user already paid for the run).
 */
import type { Prisma } from '@prisma/client';
import { createTranslator } from 'next-intl';

import { renderPrompt, type PromptLocale } from '@/lib/ai/prompts';
import { withTenant } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { generateCompletion, getCreditBalance, hashMessages, resolveCredits, type LlmMessage } from '@/lib/llm';
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
export const EVALUATE_PURPOSE = 'evaluate';
export const EVALUATE_RETRY_PURPOSE = 'evaluate-retry';

/** A run that crashed mid-way (process killed) leaves ANALYZING; after this it may be claimed again. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

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
};

/** READY/DONE/FAILED (or a stale ANALYZING) with both texts → ANALYZING, in one UPDATE. */
async function claim(owner: Owner, analysisId: string, now: Date): Promise<{ ok: true; row: Claimed } | { ok: false; error: EvaluateError }> {
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');
  return withTenant(tenantId, async (tx) => {
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
    const { count } = await tx.interregAnalysis.updateMany({
      where: {
        id,
        tenantId,
        userId,
        callText: { not: null },
        projectText: { not: null },
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
    return { ok: true, row: { rubricId: row.rubricId, callText: row.callText ?? '', projectText: row.projectText ?? '' } } as const;
  });
}

async function markFailed(owner: Owner, analysisId: string): Promise<void> {
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');
  await withTenant(tenantId, (tx) =>
    tx.interregAnalysis.updateMany({
      where: { id, tenantId, userId, status: 'ANALYZING' },
      data: { status: 'FAILED' },
    }),
  );
}

export interface EvaluateOptions {
  locale: PromptLocale;
  now?: Date;
}

export async function runEvaluation(owner: Owner, analysisId: string, opts: EvaluateOptions): Promise<EvaluateResult> {
  const id = requireActionId(analysisId, 'analysisId');
  const now = opts.now ?? new Date();

  // Refused before the claim, while nothing has changed: a run the tenant cannot pay for.
  const { credits: price } = resolveCredits(EVALUATE_MODULE, EVALUATE_PURPOSE);
  if ((await getCreditBalance(owner.tenantId)) < price) return { ok: false, error: 'insufficient_credits' };

  const claimed = await claim(owner, id, now);
  if (!claimed.ok) return claimed;

  try {
    return { ok: true, result: await evaluateClaimed(owner, id, claimed.row, opts.locale) };
  } catch (error) {
    // No document text in the log: the analysis id and the reason are enough to find the AiUsageLog row.
    console.error('[interreg-review][evaluate]', id, errorMessage(error));
    await markFailed(owner, id);
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
  const base = { tenantId, userId, module: EVALUATE_MODULE };

  const first = await generateCompletion({ ...base, purpose: EVALUATE_PURPOSE, messages });
  let completion = first;
  let parsed = parseEvaluation(first.text, grid);
  let usage = { credits: first.credits, inputTokens: first.inputTokens, outputTokens: first.outputTokens };
  if (!parsed.ok) {
    const retry: LlmMessage[] = [
      ...messages,
      { role: 'assistant', content: first.text },
      { role: 'user', content: renderPrompt('m17/evaluate-retry', { problems: parsed.problems.slice(0, 20).map((p) => `- ${p}`).join('\n') }, locale) },
    ];
    completion = await generateCompletion({ ...base, purpose: EVALUATE_RETRY_PURPOSE, messages: retry });
    usage = {
      credits: usage.credits + completion.credits,
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
  };
  const reportMarkdown = buildReportMarkdown(reportInput);
  const redFlags = redFlagsOf(reportInput);
  const promptHash = hashMessages(messages);
  const criterionIds = new Map(rubric.criteria.map((c) => [c.criterionKey, c.id]));

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
    // Still ours: nothing else moves an ANALYZING row but a stale-claim takeover.
    const done = await tx.interregAnalysis.updateMany({
      where: { id, tenantId, userId, status: 'ANALYZING' },
      data: { status: 'DONE' },
    });
    if (done.count !== 1) throw new Error('analysis left ANALYZING before the result was written');
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
    credits: usage.credits,
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
