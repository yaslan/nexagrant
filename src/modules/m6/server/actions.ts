'use server';

import { revalidatePath } from 'next/cache';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { assertModuleAccess } from '@/lib/modules/access';
import { generateText } from '@/lib/llm';

import {
  getPanelScoresForProposal,
  updateEvaluationScore,
  type PanelScoreQueryResult,
} from './scoring';
import {
  aiEvaluationSchema,
  calibrateEsrSchema,
  EvaluationInputError,
  EvaluationNotFoundError,
  idSchema,
  parseOrThrow,
  saveEvaluationSchema,
  saveHumanEvaluationSchema,
  type AiEvaluationResult,
} from './validation';

/**
 * M6 Evaluator Lens — server actions.
 *
 * Two invariants hold for every action in this file.
 *
 * 1. `tenantId`/`userId` come from the session (`requireTenantAction`), never from
 *    arguments. A server action is a public POST endpoint, so a caller that named its
 *    own tenant could write into another workspace and charge its credits.
 * 2. Every query runs inside `withTenant(...)` so the RLS policies apply, and every
 *    lookup by a guessable id is additionally matched on `tenantId`.
 *
 * Failures are *thrown*, not logged and swallowed. These actions previously answered
 * `console.warn` + a normal return on a DB error, so the form reported a save that had
 * not happened.
 *
 * Input shapes and the error types live in ./validation.ts — a `'use server'` module may
 * only export async functions.
 */

const EVALUATION_PATH = '/[workspace]/opportunities/[id]/evaluations';
const PROPOSAL_PATH = '/[workspace]/proposals/[id]';

/** `revalidatePath` throws outside a request scope (build, unit test); that is not a save failure. */
function revalidateQuietly(path: string) {
  try {
    revalidatePath(path, 'page');
  } catch {
    // no request store — nothing to revalidate
  }
}

// ───────────────────────────── AI single-reader lens ─────────────────────────────

const AI_EVALUATION_PROMPT = `Perform a rigorous EU Horizon Europe expert evaluation for opportunity {{opportunityId}} based on official REA criteria:
  1. Excellence (0.0 - 5.0): Clarity of objectives, soundness of methodology, open science, gender dimension.
  2. Impact (0.0 - 5.0): Credibility of outcomes/impacts, scale and significance, dissemination & exploitation plan (DEC).
  3. Quality and efficiency of implementation (0.0 - 5.0): Work plan structure, WPs, milestone risk management, consortium capacity.

  Return ONLY valid JSON with keys: excellence (number), impact (number), implementation (number),
  strengths (string[]), weaknesses (string[]), recommendations (string[]).`;

/**
 * Run the AI reader over an opportunity and record the result.
 *
 * There is deliberately no scored fallback. The previous version kept a literal
 * `{ excellence: 4.2, impact: 4.0, implementation: 3.8, ... }` object and persisted it
 * whenever the model call or the JSON parse failed — an invented score, written to the
 * database and shown to the user as an assessment of their proposal. CLAUDE.md §7 says
 * every number on screen traces to a record; a fabricated one cannot. A failed call now
 * fails, and the caller reports it.
 */
export async function generateAiEvaluation(opportunityId: string): Promise<AiEvaluationResult> {
  const oppId = parseOrThrow(idSchema, opportunityId);
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M6');
  const { tenantId, userId } = await requireTenantAction();

  const resultStr = await generateText({
    tenantId,
    userId,
    module: 'M6',
    purpose: 'evaluation',
    prompt: AI_EVALUATION_PROMPT.replace('{{opportunityId}}', oppId),
    system: 'You are an official European Commission Horizon Europe Proposal Evaluator. Return ONLY valid JSON.',
  });

  let raw: unknown;
  try {
    raw = JSON.parse(resultStr.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch {
    throw new EvaluationInputError('The AI reader did not return valid JSON; no evaluation was recorded.');
  }

  const parsed = parseOrThrow(aiEvaluationSchema, raw);

  await withTenant(tenantId, async (tx) => {
    // The opportunity must belong to the session tenant; its id is guessable.
    const opp = await tx.opportunity.findFirst({
      where: { id: oppId, tenantId },
      select: { id: true },
    });
    if (!opp) throw new EvaluationNotFoundError(`Opportunity ${oppId} not found in this workspace.`);

    await tx.creditLedger.create({
      data: {
        tenantId,
        delta: -3,
        reason: 'M6: Evaluator Lens AI pre-assessment',
      },
    });

    await tx.evaluation.create({
      data: {
        tenantId,
        opportunityId: oppId,
        userId,
        readerType: 'AI',
        status: 'completed',
        excellence: parsed.excellence,
        impact: parsed.impact,
        implementation: parsed.implementation,
        weaknesses: {
          strengths: parsed.strengths,
          weaknesses: parsed.weaknesses,
          recommendations: parsed.recommendations,
        },
      },
    });
  });

  revalidateQuietly(EVALUATION_PATH);
  return parsed;
}

// ──────────────────────────── Human single-reader lens ───────────────────────────

export async function saveHumanEvaluation(data: {
  opportunityId: string;
  excellence: number;
  impact: number;
  implementation: number;
  weaknesses?: string[];
  strengths?: string[];
}): Promise<{ id: string }> {
  const input = parseOrThrow(saveHumanEvaluationSchema, data);
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M6');
  const { tenantId, userId } = await requireTenantAction();

  const created = await withTenant(tenantId, async (tx) => {
    const opp = await tx.opportunity.findFirst({
      where: { id: input.opportunityId, tenantId },
      select: { id: true },
    });
    if (!opp) {
      throw new EvaluationNotFoundError(`Opportunity ${input.opportunityId} not found in this workspace.`);
    }

    return tx.evaluation.create({
      data: {
        tenantId,
        opportunityId: input.opportunityId,
        userId,
        readerType: 'HUMAN',
        status: 'completed',
        excellence: input.excellence,
        impact: input.impact,
        implementation: input.implementation,
        weaknesses: {
          strengths: input.strengths,
          weaknesses: input.weaknesses,
        },
      },
      select: { id: true },
    });
  });

  revalidateQuietly(EVALUATION_PATH);
  return created;
}

export async function calibrateESR(evaluationId: string, actualScore: number): Promise<{ calibration: number }> {
  const input = parseOrThrow(calibrateEsrSchema, { evaluationId, actualScore });
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M6');
  const { tenantId } = await requireTenantAction();

  const calibration = await withTenant<number>(tenantId, async (tx) => {
    // Scoped read: an evaluation id from another tenant must not resolve here.
    const ev = await tx.evaluation.findFirst({
      where: { id: input.evaluationId, tenantId },
      select: { id: true, excellence: true, impact: true, implementation: true },
    });
    if (!ev) {
      throw new EvaluationNotFoundError(`Evaluation ${input.evaluationId} not found in this workspace.`);
    }

    const predictedTotal = ev.excellence + ev.impact + ev.implementation;
    const value = Number((predictedTotal - input.actualScore).toFixed(2));

    await tx.evaluation.update({ where: { id: ev.id }, data: { calibration: value } });
    return value;
  });

  revalidateQuietly(EVALUATION_PATH);
  return { calibration };
}

// ────────────────────────────────── Panel lens ───────────────────────────────────

/**
 * Record the signed-in reviewer's marks on a PANEL evaluation.
 *
 * The scores are written against *this user's* Reviewer row. The previous version wrote
 * them against `evaluation.reviewers[0]` — whoever happened to be seated first — so a
 * second reviewer's submission silently overwrote the first reviewer's marks and the
 * panel average was computed from one opinion counted twice.
 */
export async function saveEvaluation(data: {
  evaluationId: string;
  proposalId: string;
  scores: Record<string, number>;
}): Promise<{ avgScore: number | null }> {
  const input = parseOrThrow(saveEvaluationSchema, data);
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M6');
  const { tenantId, userId } = await requireTenantAction();

  const avgScore = await withTenant<number | null>(tenantId, async (tx) => {
    const evaluation = await tx.evaluation.findFirst({
      where: { id: input.evaluationId, tenantId, proposalId: input.proposalId },
      include: { reviewers: true, criteria: true },
    });
    if (!evaluation) {
      throw new EvaluationNotFoundError(`Evaluation ${input.evaluationId} not found in this workspace.`);
    }

    const reviewer = evaluation.reviewers.find(
      (r: typeof evaluation.reviewers[0]) => r.userId === userId,
    );
    if (!reviewer) {
      throw new EvaluationNotFoundError('You are not seated as a reviewer on this evaluation.');
    }

    for (const [name, score] of Object.entries(input.scores)) {
      const criterion = evaluation.criteria.find(
        (c: typeof evaluation.criteria[0]) => c.name === name,
      );
      if (!criterion) {
        throw new EvaluationInputError(`Unknown criterion for this evaluation: ${name}`);
      }

      await tx.score.upsert({
        where: { reviewerId_criterionId: { reviewerId: reviewer.id, criterionId: criterion.id } },
        create: {
          tenantId,
          reviewerId: reviewer.id,
          criterionId: criterion.id,
          score,
          submittedAt: new Date(),
        },
        update: { score, submittedAt: new Date() },
      });
    }

    await tx.reviewer.update({ where: { id: reviewer.id }, data: { status: 'completed' } });

    await updateEvaluationScore(tx, evaluation.id, tenantId);

    // The evaluation is completed only once every seated reviewer has submitted.
    const pending = await tx.reviewer.count({
      where: { evaluationId: evaluation.id, tenantId, status: { not: 'completed' } },
    });
    await tx.evaluation.update({
      where: { id: evaluation.id },
      data: { status: pending === 0 ? 'completed' : 'in-progress' },
    });

    const refreshed = await tx.evaluation.findFirst({
      where: { id: evaluation.id, tenantId },
      select: { avgScore: true },
    });
    return refreshed?.avgScore ?? null;
  });

  revalidateQuietly(PROPOSAL_PATH);
  return { avgScore };
}

/**
 * Panel scores for one proposal, for the dashboard.
 *
 * This exists because the dashboard used to import `prisma` into a `'use client'`
 * component and query the database from a `useEffect` — which cannot run in a browser —
 * and took `tenantId` as a prop from the client, which would have been a cross-tenant
 * read had it run at all. The tenant now comes from the session.
 */
export async function listPanelScores(proposalId: string): Promise<PanelScoreQueryResult[]> {
  const propId = parseOrThrow(idSchema, proposalId);
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M6');
  const { tenantId } = await requireTenantAction();

  return withTenant(tenantId, async (tx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: propId, tenantId },
      select: { id: true },
    });
    if (!proposal) {
      throw new EvaluationNotFoundError(`Proposal ${propId} not found in this workspace.`);
    }
    return getPanelScoresForProposal(tx, tenantId, propId);
  });
}
