/**
 * NG-38 — withdrawing from an opportunity ("vazgeç", spec §4 decision_log, §5 başvur/vazgeç).
 *
 * The one place that writes `Opportunity.status = 'WITHDRAWN'`. Before this, the value was read
 * (gates/evaluate.ts G4, applicationOutcome.ts) but nothing wrote it (NG-22 F-7). The reason is
 * required: a withdrawal without one is refused and nothing is written. Status and decision_log
 * row are written in one transaction, so neither exists without the other.
 *
 * The pipeline "archive" action (pipeline/actions.ts, reason `archived_by_user`) is a different
 * thing: it soft-deletes, it does not withdraw. It is left as it is.
 *
 * Every read and write runs in `withTenant`. Another tenant's id answers like an id that does not
 * exist. The audit row names the act, not the reason: the audit log is read more widely.
 *
 * This module imports `@/lib/db`, so it can only ever run on the server.
 */
import type { DecisionKind, OppStatus } from '@prisma/client';
import { z } from 'zod';

import { withTenant } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';

type Scope = { tenantId: string; userId: string };

export const WITHDRAWAL_REASON_MAX = 2000;

export const WithdrawalInputSchema = z
  .object({ reason: z.string().trim().min(1).max(WITHDRAWAL_REASON_MAX) })
  .strict();
export type WithdrawalInput = z.input<typeof WithdrawalInputSchema>;

export type WithdrawalRefusal = 'REASON_REQUIRED' | 'NOT_FOUND' | 'ALREADY_WITHDRAWN' | 'ALREADY_DECIDED';

export type DecisionView = {
  id: string;
  opportunityId: string;
  kind: DecisionKind;
  reason: string;
  decidedById: string | null;
  decidedAt: Date;
};

const WITHDRAWABLE: readonly OppStatus[] = ['ACTIVE', 'SUBMITTED'];

/**
 * Pure, so it can be tested without a database. Before a result (ACTIVE, SUBMITTED) the
 * institution can still step back; a submitted proposal can be withdrawn on the portal too.
 * Once there is a result (FUNDED, REJECTED, ABOVE_THRESHOLD) withdrawing would erase it.
 */
export function withdrawalRefusal(status: OppStatus): Exclude<WithdrawalRefusal, 'REASON_REQUIRED' | 'NOT_FOUND'> | null {
  if (status === 'WITHDRAWN') return 'ALREADY_WITHDRAWN';
  return WITHDRAWABLE.includes(status) ? null : 'ALREADY_DECIDED';
}

const DECISION_SELECT = {
  id: true,
  opportunityId: true,
  kind: true,
  reason: true,
  decidedById: true,
  decidedAt: true,
} as const;

export async function withdrawOpportunity(
  scope: Scope,
  opportunityId: string,
  input: WithdrawalInput,
): Promise<{ decision: DecisionView } | { refused: WithdrawalRefusal }> {
  // An id from a server action can arrive missing; Prisma would drop it from the `where` and
  // the conditional update below would cover every withdrawable row of the tenant.
  if (!isPresentId(opportunityId)) return { refused: 'NOT_FOUND' };
  const parsed = WithdrawalInputSchema.safeParse(input);
  if (!parsed.success) return { refused: 'REASON_REQUIRED' };
  const { reason } = parsed.data;

  return withTenant(scope.tenantId, async (tx) => {
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId: scope.tenantId, deletedAt: null },
      select: { status: true },
    });
    if (!opp) return { refused: 'NOT_FOUND' as const };
    const refusal = withdrawalRefusal(opp.status);
    if (refusal) return { refused: refusal };

    // Conditional on the status just read: of two concurrent withdrawals one updates, the
    // other sees count 0 and writes no second row.
    const moved = await tx.opportunity.updateMany({
      where: { id: opportunityId, tenantId: scope.tenantId, deletedAt: null, status: { in: [...WITHDRAWABLE] } },
      data: { status: 'WITHDRAWN' },
    });
    if (moved.count === 0) return { refused: 'ALREADY_WITHDRAWN' as const };

    const decision = await tx.decisionLog.create({
      data: { tenantId: scope.tenantId, opportunityId, kind: 'WITHDRAW', reason, decidedById: scope.userId },
      select: DECISION_SELECT,
    });
    await tx.auditEvent.create({
      data: {
        tenantId: scope.tenantId,
        actorId: scope.userId,
        type: 'opportunity.withdrawn',
        target: opportunityId,
        data: { decisionId: decision.id, from: opp.status },
      },
    });
    return { decision };
  });
}

/** The decisions on one opportunity, oldest first; `null` when it is not this tenant's. */
export function listDecisions(scope: Pick<Scope, 'tenantId'>, opportunityId: string): Promise<DecisionView[] | null> {
  return withTenant(scope.tenantId, async (tx) => {
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId: scope.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!opp) return null;
    return tx.decisionLog.findMany({
      where: { opportunityId, tenantId: scope.tenantId },
      select: DECISION_SELECT,
      orderBy: { decidedAt: 'asc' },
    });
  });
}
