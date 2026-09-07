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

/**
 * Read `Evaluation.avgScore` back as a panel average, or null when the stored value
 * cannot be one.
 *
 * A weighted mean of marks that are each at least 1 is itself at least 1, so a stored
 * value below `PANEL_SCALE_MIN` was never computed from anyone's marks. Rows written
 * before this file stopped substituting 0 for "no weighted criterion" still hold that
 * 0, and there is no migration that can tell them from a real score — the guard is
 * here so those rows read as unmeasured instead of as a failing grade. Nothing is
 * deleted: the `Score` rows remain the source of truth and a recalculation overwrites
 * the cached column with a real value or with null.
 */
export function storedPanelAverage(avgScore: number | null | undefined): number | null {
  if (typeof avgScore !== 'number' || !Number.isFinite(avgScore)) return null;
  if (avgScore < PANEL_SCALE_MIN) return null;
  return avgScore;
}

export interface ReviewerScores {
  reviewerId: string;
  scores: Record<string, ScoreValue>; // criterionId -> score
}

/**
 * Panel consensus outcome.
 * - solid: ≥70% of reviewer pairs within 1 point of each other (high agreement)
 * - divergent: <70% agreement (conflicting views)
 * - not-measured: fewer than two reviewers have submitted, so there are no pairs to
 *   compare. This is not agreement. A lone reviewer used to be reported as
 *   `solid` at 100%, which asserts a panel agreed when no panel ever met.
 */
export type ConsensusOutcome = 'solid' | 'divergent' | 'not-measured';

/**
 * Why a panel average does not exist. Carried instead of a number so the dashboard
 * can say which of the two absences it is looking at.
 *
 * - no-submitted-marks: no reviewer has submitted a score on this evaluation.
 * - no-weighted-criterion: marks exist, but none of them falls on a criterion that
 *   carries weight, so there is nothing to average. Previously this produced 0.
 */
export type PanelScoreUnmeasuredReason = 'no-submitted-marks' | 'no-weighted-criterion';

export interface PanelScoreResult {
  /** Weighted 1–5 average, or null when it could not be computed. Never 0 as a stand-in. */
  panelAverage: number | null;
  /** Set exactly when `panelAverage` is null. */
  unmeasuredReason: PanelScoreUnmeasuredReason | null;
  consensusOutcome: ConsensusOutcome;
  /** criterionId -> unweighted mean of the marks on it. */
  criterionAverages: Record<string, number>;
  reviewerCount: number;
  /** 0–100, or null when there was no pair to compare. */
  agreementPercentage: number | null;
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
  /** Reviewers who have submitted. The panel score is derived from these alone. */
  completedReviewerCount: number;
  panelScore: number | null;
  /** Set exactly when `panelScore` is null, so the dashboard can name the absence. */
  unmeasuredReason: PanelScoreUnmeasuredReason | null;
  esrScore: number | null;
  consensusOutcome: ConsensusOutcome;
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
  // No marks is a state, not a crash. This used to throw, which meant the only two
  // things a caller could do were guard the call itself or take down the page — and
  // the one caller that forgot the guard would have written a fabricated number.
  if (reviewerScores.length === 0) {
    return {
      panelAverage: null,
      unmeasuredReason: 'no-submitted-marks',
      consensusOutcome: 'not-measured',
      criterionAverages: {},
      reviewerCount: 0,
      agreementPercentage: null,
    };
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

  // `: 0` used to close this expression. A panel is scored 1..5, so 0 is not a low
  // score — it is outside the scale, and it reached the dashboard as "0.00", a
  // failing verdict on a proposal whose marks simply landed on unweighted criteria.
  // Absence leaves here as absence (CLAUDE.md §7).
  const panelAverage = weightSum > 0 ? weightedSum / weightSum : null;

  const consensus = calculateConsensusOutcome(reviewerScores);

  return {
    panelAverage,
    unmeasuredReason: panelAverage === null ? 'no-weighted-criterion' : null,
    consensusOutcome: consensus.outcome,
    criterionAverages,
    reviewerCount: reviewerScores.length,
    agreementPercentage: consensus.agreementPercentage,
  };
}

/**
 * Determine if reviewers agree (solid) or diverge (divergent).
 * Solid = ≥70% of reviewer pairs have ≤1 point difference.
 *
 * Fewer than two sets of marks yields `not-measured`: consensus is a statement about
 * reviewers agreeing *with each other*, and with one reviewer there is no pair to
 * compare. The previous `{ solid, 100 }` was a claim of unanimous agreement derived
 * from an empty set of comparisons — the dashboard printed "Güçlü" on a panel where
 * exactly one person had voted.
 */
export function calculateConsensusOutcome(
  reviewerScores: ReviewerScores[],
): { outcome: ConsensusOutcome; agreementPercentage: number | null } {
  if (reviewerScores.length <= 1) {
    return { outcome: 'not-measured', agreementPercentage: null };
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

  // totalPairs is at least 1 here: the early return above covers 0 and 1 reviewers.
  const agreementPercentage = (agreeingPairs / totalPairs) * 100;
  const outcome: ConsensusOutcome = agreementPercentage >= 70 ? 'solid' : 'divergent';

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
        select: {
          id: true,
          status: true,
          // Submitted marks only. A reviewer's draft is not their opinion yet, and
          // `calculateCriterionAverage`/`getScoreDistribution` have always filtered on
          // this — without it the headline score and the per-criterion breakdown on the
          // same screen were computed over two different populations.
          scores: {
            where: { submittedAt: { not: null } },
            select: { score: true, criterionId: true },
          },
        },
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

    const panelScore = storedPanelAverage(eval_.avgScore);

    return {
      evaluationId: eval_.id,
      proposalId: eval_.proposalId || '',
      reviewerCount: eval_.reviewers.length,
      completedReviewerCount: completed,
      panelScore,
      // Which absence it is: nobody has submitted, versus marks that landed on no
      // weighted criterion. The row still shows how many reviewers are seated.
      unmeasuredReason:
        panelScore !== null
          ? null
          : reviewerScores.length === 0
            ? 'no-submitted-marks'
            : 'no-weighted-criterion',
      esrScore: esrScoreFromProposal(eval_.proposal?.esrScores),
      consensusOutcome: calculateConsensusOutcome(reviewerScores).outcome,
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
  // Submitted scores only. The `submittedAt` filter was missing here while the two
  // analytics readers below both applied it, so `Evaluation.avgScore` — the number the
  // dashboard prints — was the one figure in the module computed from drafts as well.
  const scores = await db.score.findMany({
    where: { reviewer: { evaluationId, tenantId }, submittedAt: { not: null } },
    include: {
      reviewer: { select: { id: true } },
      criterion: { select: { id: true, name: true, weight: true } },
    },
  });

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

  // `avgScore` is a cache of the marks, so it is written even when the answer is null:
  // returning early on "nothing to compute" left whatever number was there last time,
  // which outlives the marks it came from once a score is withdrawn. Recomputing from
  // the same rows twice writes the same value, so this is safe to run repeatedly.
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
    // A calibration point needs both halves to be real. `storedPanelAverage` also
    // drops legacy rows holding the old fabricated 0, which would otherwise enter the
    // matrix as a 4-point miss and drag the reported drift of the whole model.
    const panelScore = storedPanelAverage(eval_.avgScore);
    if (panelScore === null || !eval_.proposal?.esrScores) continue;

    const esrScore = esrScoreFromProposal(eval_.proposal.esrScores);
    if (esrScore === null) continue;

    const deltaAbsolute = esrScore - panelScore;
    const deltaPercent = (deltaAbsolute / esrScore) * 100;

    results.push({
      evaluationId: eval_.id,
      panelScore,
      esrScore,
      deltaAbsolute,
      deltaPercent,
    });
  }

  return results;
}
