/**
 * M6 Evaluator Lens — ESR Comparison & Validation.
 *
 * Compares M6 panel scores against official ESR scores, with validation rules
 * for score integrity, reviewer access, and tenant isolation.
 */

import {
  compareWithEsr,
  storedPanelAverage,
  type EsrComparisonResult,
  type TenantScopedDb,
} from './scoring';

/**
 * Compare M6 panel score to ESR for a specific evaluation.
 * Fetches the evaluation and proposal, validates reviewer access, then returns comparison.
 *
 * @throws EvaluationNotFoundError if evaluation or proposal not found
 * @throws UnauthorizedError if reviewer lacks access
 */
export async function compareM6ToESR(
  db: TenantScopedDb,
  evaluationId: string,
  tenantId: string,
  currentUserId?: string,
): Promise<EsrComparisonResult> {
  // Fetch evaluation with proposal and scores
  const evaluation = await db.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      proposal: { select: { esrScores: true } },
      reviewers: {
        select: {
          id: true,
          userId: true,
          status: true,
          scores: { select: { score: true, criterionId: true } },
        },
      },
    },
  });

  if (!evaluation || evaluation.tenantId !== tenantId) {
    throw new Error(`Evaluation ${evaluationId} not found or access denied`);
  }

  if (!evaluation.proposal || !evaluation.proposal.esrScores) {
    throw new Error(`Proposal for evaluation ${evaluationId} not found or has no ESR scores`);
  }

  // Validate current user is a reviewer (if provided)
  if (currentUserId) {
    const isReviewer = evaluation.reviewers.some(
      (r: (typeof evaluation.reviewers)[number]) => r.userId === currentUserId,
    );
    if (!isReviewer) {
      throw new Error(`User ${currentUserId} is not a reviewer on this evaluation`);
    }
  }

  // Use the evaluation's avgScore if already calculated, otherwise compute from submitted
  // reviews. `storedPanelAverage` rather than a falsy check: the guard has to reject a
  // stored 0 (never a real 1..5 mean) while a legitimate low average like 1.0 — which
  // `!panelScore` would have accepted anyway — keeps its own value.
  let panelScore = storedPanelAverage(evaluation.avgScore);
  if (panelScore === null) {
    const submittedReviews = evaluation.reviewers.filter(
      (r: (typeof evaluation.reviewers)[number]) => r.status === 'completed',
    );
    if (submittedReviews.length === 0) {
      throw new Error(`No completed reviews yet for evaluation ${evaluationId}`);
    }

    // Compute unweighted average from all submitted scores
    const allScores = submittedReviews.flatMap(
      (r: (typeof submittedReviews)[number]) =>
        r.scores.map((s: (typeof r.scores)[number]) => s.score),
    );
    if (allScores.length === 0) {
      throw new Error('No scores submitted for comparison');
    }
    panelScore = allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length;
  }

  return compareWithEsr(panelScore, evaluation.proposal.esrScores);
}

/**
 * Validation: score must be in 1..5 range (enforced by DB CHECK, but validate early).
 */
export function validateScoreRange(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

/**
 * Validation: no duplicate scores from the same reviewer on the same criterion.
 * DB enforces via UNIQUE(reviewerId, criterionId), but check in app code too.
 */
export async function checkNoDuplicateScore(
  db: TenantScopedDb,
  reviewerId: string,
  criterionId: string,
): Promise<boolean> {
  const existing = await db.score.findFirst({
    where: { reviewerId, criterionId },
  });
  return !existing;
}

/**
 * Validation: reviewer has access to the evaluation (is listed as a reviewer).
 */
export async function validateReviewerAccess(
  db: TenantScopedDb,
  evaluationId: string,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const reviewer = await db.reviewer.findFirst({
    where: {
      evaluationId,
      userId,
      tenantId,
    },
  });
  return !!reviewer;
}

/**
 * Validation: evaluation belongs to the tenant (tenant isolation).
 */
export async function validateEvaluationTenant(
  db: TenantScopedDb,
  evaluationId: string,
  tenantId: string,
): Promise<boolean> {
  const evaluation = await db.evaluation.findUnique({
    where: { id: evaluationId },
    select: { tenantId: true },
  });
  return evaluation?.tenantId === tenantId;
}

/**
 * Validation: all reviewers for an evaluation are from the same tenant.
 * Used as a sanity check after batch operations.
 */
export async function validateReviewersTenant(
  db: TenantScopedDb,
  evaluationId: string,
  expectedTenantId: string,
): Promise<boolean> {
  const evaluation = await db.evaluation.findUnique({
    where: { id: evaluationId },
    include: { reviewers: { select: { tenantId: true } } },
  });

  if (!evaluation || evaluation.tenantId !== expectedTenantId) {
    return false;
  }

  return evaluation.reviewers.every(
    (r: { tenantId: string }) => r.tenantId === expectedTenantId,
  );
}
