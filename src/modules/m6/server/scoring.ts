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
  let esrScore: number | null = null;

  if (esrScores && typeof esrScores === 'object' && 'total' in esrScores) {
    const total = (esrScores as Record<string, unknown>).total;
    if (typeof total === 'number') {
      // Normalize ESR (typically 0–15) to 1–5 scale
      esrScore = (total / 15) * 4 + 1; // maps 0→1, 15→5
    }
  }

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
  prisma: PrismaClient,
  tenantId: string,
  proposalId: string,
): Promise<PanelScoreQueryResult[]> {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      tenantId,
      proposalId,
      readerType: 'PANEL',
    },
    include: {
      proposal: { select: { esrScores: true } },
      reviewers: { select: { id: true, status: true } },
    },
  });

  return evaluations.map((eval_: typeof evaluations[0]) => {
    const completed = eval_.reviewers.filter((r: typeof eval_.reviewers[0]) => r.status === 'completed').length;

    const esrScores = eval_.proposal?.esrScores as Record<string, unknown> | null;
    let esrScore: number | null = null;
    if (esrScores?.total && typeof esrScores.total === 'number') {
      esrScore = (esrScores.total / 15) * 4 + 1;
    }

    return {
      evaluationId: eval_.id,
      proposalId: eval_.proposalId || '',
      reviewerCount: eval_.reviewers.length,
      completedReviewerCount: completed,
      panelScore: eval_.avgScore ?? null,
      esrScore,
      consensusOutcome: null, // Would need to query scores to recalculate
    };
  });
}

/**
 * Recalculate and persist panel score for an evaluation.
 * Called after a reviewer submits their scores.
 */
export async function updateEvaluationScore(
  prisma: PrismaClient,
  evaluationId: string,
  tenantId: string,
): Promise<void> {
  // Fetch all submitted scores for this evaluation
  const scores = await prisma.score.findMany({
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
  await prisma.evaluation.update({
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
  prisma: PrismaClient,
  tenantId: string,
): Promise<Array<{
  evaluationId: string;
  panelScore: number;
  esrScore: number;
  deltaAbsolute: number;
  deltaPercent: number;
}>> {
  const evaluations = await prisma.evaluation.findMany({
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

    const esrScores = eval_.proposal.esrScores as Record<string, unknown>;
    const esrTotal = esrScores.total as number;

    if (!esrTotal) continue;

    const esrScore = (esrTotal / 15) * 4 + 1;
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
