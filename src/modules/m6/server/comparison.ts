/**
 * M6 Evaluator Lens — ESR Comparison & Validation.
 *
 * Compares M6 panel scores against official ESR scores, with validation rules
 * for score integrity, reviewer access, and tenant isolation.
 */

import { assertTenantScope, type TenantTx } from '@/lib/db';
import {
  compareWithEsr,
  esrScoreFromProposal,
  storedPanelAverage,
  type EsrComparisonResult,
} from './scoring';

export interface M6EsrComparisonResult extends EsrComparisonResult {
  m6Score: number;
  esrScore: number;
  agreement: boolean;
  delta: number;
}

/**
 * Compare M6 panel score to ESR for a specific evaluation.
 * Fetches the evaluation and proposal, validates reviewer access, then returns comparison.
 *
 * Why `tenantId` is required, and why there is no longer a form without a `db`
 * (TASK-MTV5GFB75N43S, then TASK-MTV5H4HCGGGQ5): this is the exact twin of the
 * scoring defect closed in TASK-MTUIPYSSNLVWG, one file over. A two-argument form
 * used to accept no tenant, and omitting it did not narrow
 * the lookup — it handed `compareM6ToESRInternal` the global `prisma` client
 * (which connects as a role RLS does not constrain) and then short-circuited the
 * ownership check below, because the guard read `tenantId && evaluation.tenantId
 * !== tenantId`. With no tenant, `findUnique({ where: { id } })` is a lookup by a
 * known id *across tenants*: any caller holding an evaluation id would have been
 * handed that evaluation's panel scores, reviewer roster and ESR comparison.
 *
 * No caller in the repo took that branch, so nothing leaked; the defect was the
 * signature, which kept `pnpm typecheck` green for whoever wrote
 * `compareM6ToESR('eval-1')` next.
 *
 * The branch is gone rather than fixed: a tenant-less call no longer compiles,
 * and {@link assertTenantScope} — the repo's query-boundary guard in
 * `src/lib/db.ts` — refuses `''`, whitespace, `null` and `undefined` arriving
 * from untyped code before any query is issued. The ownership guard is now
 * unconditional. The string-first overload that carried the unscoped branch was
 * deleted outright in TASK-MTV5H4HCGGGQ5; it had no callers. Behaviour for a
 * tenant-scoped call is unchanged.
 *
 * @throws MissingTenantScopeError if called without a tenant
 * @throws EvaluationNotFoundError if evaluation or proposal not found
 * @throws UnauthorizedError if reviewer lacks access
 */
export async function compareM6ToESR(
  db: TenantTx,
  evaluationId: string,
  tenantId: string,
  currentUserId?: string,
): Promise<M6EsrComparisonResult> {
  assertTenantScope(tenantId, 'compareM6ToESR');
  return compareM6ToESRInternal(db, evaluationId, tenantId, currentUserId);
}

async function compareM6ToESRInternal(
  db: TenantTx,
  evaluationId: string,
  tenantId: string,
  currentUserId?: string,
): Promise<M6EsrComparisonResult> {
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

  if (currentUserId) {
    const isReviewer = evaluation.reviewers.some(
      (r: (typeof evaluation.reviewers)[number]) => r.userId === currentUserId,
    );
    if (!isReviewer) {
      throw new Error(`User ${currentUserId} is not a reviewer on this evaluation`);
    }
  }

  let panelScore = storedPanelAverage(evaluation.avgScore);
  if (panelScore === null) {
    const submittedReviews = evaluation.reviewers.filter(
      (r: (typeof evaluation.reviewers)[number]) => r.status === 'completed',
    );
    if (submittedReviews.length === 0) {
      throw new Error(`No completed reviews yet for evaluation ${evaluationId}`);
    }

    const allScores = submittedReviews.flatMap(
      (r: (typeof submittedReviews)[number]) =>
        r.scores.map((s: (typeof r.scores)[number]) => s.score),
    );
    if (allScores.length === 0) {
      throw new Error('No scores submitted for comparison');
    }
    panelScore = allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length;
  }

  const baseResult = compareWithEsr(panelScore, evaluation.proposal.esrScores);

  const rawEsr = evaluation.proposal.esrScores;
  const esrScoreNum =
    typeof rawEsr === 'number'
      ? rawEsr
      : (baseResult.esrScore ?? esrScoreFromProposal(rawEsr) ?? 0);

  const m6Score = Number(panelScore.toFixed(2));
  const esrScore = Number(esrScoreNum.toFixed(2));
  const delta = Number((esrScore - m6Score).toFixed(2));
  // Agreement: true if M6 <= ESR and difference is within 0.5 points
  const agreement = m6Score <= esrScore && Math.abs(delta) <= 0.5;

  return {
    ...baseResult,
    m6Score,
    esrScore,
    agreement,
    delta,
  };
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
  db: TenantTx,
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
  db: TenantTx,
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
  db: TenantTx,
  evaluationId: string,
  tenantId: string,
): Promise<boolean> {
  const evaluation = await db.evaluation.findUnique({
    where: { id: evaluationId },
    select: { tenantId: true },
  });
  return evaluation?.tenantId === tenantId;
}
