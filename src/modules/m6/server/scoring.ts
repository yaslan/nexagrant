/**
 * M6 Evaluator Lens — Scoring logic and consensus rules.
 *
 * TASK-MTQ2L2XN88AJN: Scoring functions for panel evaluations.
 * - calculatePanelScore(): weighted avg across reviewers and criteria
 * - calculateConsensus(): reviewer agreement (≥70% = solid, <70% = divergent)
 * - compareWithEsr(): delta vs official ESR score
 * - Database queries for panel scores and reviewer stats
 */

import { PrismaClient } from '@prisma/client';
import { ScoreValue } from '../types';

/**
 * The client shape `withTenant()` hands its callback: a PrismaClient without the
 * connection/transaction methods. Every query below takes this rather than a bare
 * `PrismaClient` so it can only be called from inside a tenant-scoped transaction
 * (CLAUDE.md §1) — a plain `prisma` still satisfies it structurally.
 */
export type TenantScopedDb = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** An ESR panel total is scored out of 15 (3 criteria x 5.0). */
export const ESR_TOTAL_MAX = 15;
export const PANEL_SCALE_MIN = 1;
export const PANEL_SCALE_MAX = 5;

/**
 * Map an official ESR total (0..15) onto the 1..5 panel scale so the two can be
 * compared on one axis: 0 -> 1, 15 -> 5.
 *
 * This lived inline in three places (`compareWithEsr`, `getPanelScoresForProposal`,
 * `getCalibrationMatrix`). Three copies of one conversion is three chances for the
 * dashboard and the calibration report to disagree about the same proposal, so the
 * formula now exists once.
 */
export function esrTotalToPanelScale(total: number, maxTotal: number = ESR_TOTAL_MAX): number | null {
  if (!Number.isFinite(total) || maxTotal <= 0) return null;
  const clamped = Math.min(Math.max(total, 0), maxTotal);
  return (clamped / maxTotal) * (PANEL_SCALE_MAX - PANEL_SCALE_MIN) + PANEL_SCALE_MIN;
}

/**
 * Read the ESR total out of `Proposal.esrScores` (free-form JSON) and put it on the
 * panel scale. Returns null when the proposal has no recorded official score — the UI
 * must render that as "not scored yet", never as a zero.
 */
export function esrScoreFromProposal(esrScores: unknown): number | null {
  if (!esrScores || typeof esrScores !== 'object') return null;
  const total = (esrScores as Record<string, unknown>).total;
  if (typeof total !== 'number') return null;
  return esrTotalToPanelScale(total);
}

export interface ReviewerScores {
  reviewerId: string;
  scores: Record<string, ScoreValue>; // criterionId -> score
}

/**
 * Panel consensus outcome.
 * - solid: ≥70% of reviewers within 1 point of each other (high agreement)
 * - divergent: <70% agreement (conflicting views)
 */
export type ConsensusOutcome = 'solid' | 'divergent';

export interface PanelScoreResult {
  panelAverage: number; // weighted 1–5 average
  consensusOutcome: ConsensusOutcome;
  criterionAverages: Record<string, number>; // criterion name -> avg score
  reviewerCount: number;
  agreementPercentage: number; // 0–100
}

export interface EsrComparisonResult {
  panelScore: number;
  esrScore: number | null;
  deltaAbsolute: number | null; // esrScore - panelScore
  deltaPercent: number | null; // (deltaAbsolute / esrScore) * 100 if esrScore > 0
  esrScoreHigher: boolean; // true if ESR scored higher than panel
  agreement: boolean; // true if delta ≤ 0.5
}

export interface PanelScoreQueryResult {
  evaluationId: string;
  proposalId: string;
  reviewerCount: number;
  completedReviewerCount: number;
  panelScore: number | null;
  esrScore: number | null;
  consensusOutcome: string | null;
}

/**
 * Calculate the panel score and consensus outcome for an evaluation.
 *
 * @param reviewerScores - array of reviewer score submissions (each maps criteria -> 1..5)
 * @param criterionWeights - record of criterionId -> weight (must sum to ~1.0)
 * @returns weighted panel average, consensus, and per-criterion means
 */
export function calculatePanelScore(
  reviewerScores: ReviewerScores[],
  criterionWeights: Record<string, number>,
): PanelScoreResult {
  if (reviewerScores.length === 0) {
    throw new Error('No reviewer scores to calculate panel average');
  }

  // Collect all scores per criterion
  const scoresByCriterion: Record<string, number[]> = {};
  for (const criterion of Object.keys(criterionWeights)) {
    scoresByCriterion[criterion] = [];
  }

  for (const reviewer of reviewerScores) {
    for (const [criterion, score] of Object.entries(reviewer.scores)) {
      if (!scoresByCriterion[criterion]) {
        scoresByCriterion[criterion] = [];
      }
      scoresByCriterion[criterion].push(score);
    }
  }

  // Calculate weighted average
  let weightedSum = 0;
  let weightSum = 0;

  const criterionAverages: Record<string, number> = {};

  for (const [criterion, scores] of Object.entries(scoresByCriterion)) {
    if (scores.length === 0) continue;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    criterionAverages[criterion] = avg;

    const weight = criterionWeights[criterion] || 0;
    weightedSum += avg * weight;
    weightSum += weight;
  }

  const panelAverage = weightSum > 0 ? weightedSum / weightSum : 0;

  // Calculate consensus: measure reviewer agreement
  // Consensus = percentage of reviewers whose scores are within ±1 of the mode
  const consensus = calculateConsensusOutcome(reviewerScores);

  return {
    panelAverage,
    consensusOutcome: consensus.outcome,
    criterionAverages,
    reviewerCount: reviewerScores.length,
    agreementPercentage: consensus.agreementPercentage,
  };
}

/**
 * Determine if reviewers agree (solid) or diverge (divergent).
 * Solid = ≥70% of reviewer pairs have ≤1 point difference.
 */
export function calculateConsensusOutcome(
  reviewerScores: ReviewerScores[],
): { outcome: ConsensusOutcome; agreementPercentage: number } {
  if (reviewerScores.length <= 1) {
    return { outcome: 'solid', agreementPercentage: 100 };
  }

  // Calculate each reviewer's average score
  const reviewerAverages = reviewerScores.map((r) => {
    const scores = Object.values(r.scores);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  });

  // Count pairs within ±1 point
  let agreeingPairs = 0;
  let totalPairs = 0;

  for (let i = 0; i < reviewerAverages.length; i++) {
    for (let j = i + 1; j < reviewerAverages.length; j++) {
      totalPairs++;
      if (Math.abs(reviewerAverages[i] - reviewerAverages[j]) <= 1.0) {
        agreeingPairs++;
      }
    }
  }

  const agreementPercentage = totalPairs > 0 ? (agreeingPairs / totalPairs) * 100 : 100;
  const outcome = agreementPercentage >= 70 ? 'solid' : 'divergent';

  return { outcome, agreementPercentage };
}

/**
 * Compare M6 panel score against the official ESR score.
 * @param panelScore - 1–5 average from the evaluation panel
 * @param esrScores - ESR scoring data from Proposal (total out of 15 typically)
 */
export function compareWithEsr(
  panelScore: number,
  esrScores: unknown,
): EsrComparisonResult {
  const esrScore = esrScoreFromProposal(esrScores);

  let deltaAbsolute: number | null = null;
  let deltaPercent: number | null = null;
  let esrScoreHigher = false;
  let agreement = false;

  if (esrScore !== null) {
    deltaAbsolute = esrScore - panelScore;
    esrScoreHigher = deltaAbsolute > 0;
    agreement = Math.abs(deltaAbsolute) <= 0.5;

    if (esrScore > 0) {
      deltaPercent = (deltaAbsolute / esrScore) * 100;
    }
  }

  return {
    panelScore,
    esrScore,
    deltaAbsolute,
    deltaPercent,
    esrScoreHigher,
    agreement,
  };
}

/**
 * Fetch all completed panel scores for a proposal with ESR comparison.
 * Used for dashboard and calibration reporting.
 */
export async function getPanelScoresForProposal(
  db: TenantScopedDb,
  tenantId: string,
  proposalId: string,
): Promise<PanelScoreQueryResult[]> {
  const evaluations = await db.evaluation.findMany({
    where: {
      tenantId,
      proposalId,
      readerType: 'PANEL',
    },
    include: {
      proposal: { select: { esrScores: true } },
      reviewers: {
        select: { id: true, status: true, scores: { select: { score: true, criterionId: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return evaluations.map((eval_: typeof evaluations[0]) => {
    const completed = eval_.reviewers.filter((r: typeof eval_.reviewers[0]) => r.status === 'completed').length;

    // Consensus is derived from the stored marks rather than reported as null: the
    // dashboard column exists to tell an owner whether the panel actually agreed.
    const reviewerScores: ReviewerScores[] = eval_.reviewers
      .map((r: typeof eval_.reviewers[0]) => ({
        reviewerId: r.id,
        scores: Object.fromEntries(
          r.scores.map((s: typeof r.scores[0]) => [s.criterionId, s.score as ScoreValue]),
        ) as Record<string, ScoreValue>,
      }))
      .filter((r: ReviewerScores) => Object.keys(r.scores).length > 0);

    return {
      evaluationId: eval_.id,
      proposalId: eval_.proposalId || '',
      reviewerCount: eval_.reviewers.length,
      completedReviewerCount: completed,
      panelScore: eval_.avgScore ?? null,
      esrScore: esrScoreFromProposal(eval_.proposal?.esrScores),
      consensusOutcome:
        reviewerScores.length > 0 ? calculateConsensusOutcome(reviewerScores).outcome : null,
    };
  });
}

/**
 * Calculate the average score for a single criterion across all submitted reviews.
 * Used for per-criterion analytics and UI display.
 */
export async function calculateCriterionAverage(
  db: TenantScopedDb,
  criterionId: string,
  tenantId: string,
): Promise<number | null> {
  const scores = await db.score.findMany({
    where: {
      criterionId,
      reviewer: { tenantId },
      submittedAt: { not: null }, // only count submitted scores
    },
    select: { score: true },
  });

  if (scores.length === 0) return null;

  const sum = scores.reduce((acc: number, s: typeof scores[0]) => acc + s.score, 0);
  return sum / scores.length;
}

/**
 * Get the distribution of scores for a criterion: how many reviewers gave each mark (1-5).
 * Returns { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 } format.
 */
export async function getScoreDistribution(
  db: TenantScopedDb,
  criterionId: string,
  tenantId: string,
): Promise<Record<ScoreValue, number>> {
  const scores = await db.score.findMany({
    where: {
      criterionId,
      reviewer: { tenantId },
      submittedAt: { not: null },
    },
    select: { score: true },
  });

  const distribution: Record<ScoreValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of scores) {
    const scoreValue = s.score as ScoreValue;
    distribution[scoreValue]++;
  }
  return distribution;
}

/**
 * Recalculate and persist panel score for an evaluation.
 * Called after a reviewer submits their scores.
 */
export async function updateEvaluationScore(
  db: TenantScopedDb,
  evaluationId: string,
  tenantId: string,
): Promise<void> {
  // Fetch all submitted scores for this evaluation
  const scores = await db.score.findMany({
    where: { reviewer: { evaluationId, tenantId } },
    include: {
      reviewer: { select: { id: true } },
      criterion: { select: { id: true, name: true, weight: true } },
    },
  });

  if (scores.length === 0) return;

  // Organize scores by reviewer and criterion
  const reviewerScores: Record<string, Record<string, ScoreValue>> = {};
  const criterionWeights: Record<string, number> = {};

  for (const score of scores) {
    const reviewerId = score.reviewer.id;
    const criterionId = score.criterion.id;
    const weight = score.criterion.weight;

    if (!reviewerScores[reviewerId]) {
      reviewerScores[reviewerId] = {};
    }
    reviewerScores[reviewerId][criterionId] = score.score as ScoreValue;
    criterionWeights[criterionId] = weight;
  }

  // Calculate panel score
  const reviewerScoresArray = Object.entries(reviewerScores).map(([reviewerId, scores_]) => ({
    reviewerId,
    scores: scores_,
  }));

  const result = calculatePanelScore(reviewerScoresArray, criterionWeights);

  // Persist back to evaluation
  await db.evaluation.update({
    where: { id: evaluationId },
    data: {
      avgScore: result.panelAverage,
      updatedAt: new Date(),
    },
  });
}

/**
 * Get accuracy matrix: panel score vs ESR for all completed evaluations.
 * Used to assess calibration of the M6 panel against official scoring.
 */
export async function getCalibrationMatrix(
  db: TenantScopedDb,
  tenantId: string,
): Promise<Array<{
  evaluationId: string;
  panelScore: number;
  esrScore: number;
  deltaAbsolute: number;
  deltaPercent: number;
}>> {
  const evaluations = await db.evaluation.findMany({
    where: {
      tenantId,
      readerType: 'PANEL',
      status: 'completed',
      avgScore: { not: null },
    },
    include: { proposal: { select: { esrScores: true } } },
  });

  const results: Array<{
    evaluationId: string;
    panelScore: number;
    esrScore: number;
    deltaAbsolute: number;
    deltaPercent: number;
  }> = [];

  for (const eval_ of evaluations) {
    if (!eval_.avgScore || !eval_.proposal?.esrScores) continue;

    const esrScore = esrScoreFromProposal(eval_.proposal.esrScores);
    if (esrScore === null) continue;

    const deltaAbsolute = esrScore - eval_.avgScore;
    const deltaPercent = (deltaAbsolute / esrScore) * 100;

    results.push({
      evaluationId: eval_.id,
      panelScore: eval_.avgScore,
      esrScore,
      deltaAbsolute,
      deltaPercent,
    });
  }

  return results;
}
