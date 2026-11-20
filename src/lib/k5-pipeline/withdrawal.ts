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
 * NG-241 (K-584158 = A): a withdrawal can be taken back. `reactivateOpportunity` is the one place
 * that moves an opportunity out of WITHDRAWN, back to the status the latest withdrawal recorded in
 * `DecisionLog.fromStatus`. It is a decision too: reason required, REACTIVATE row, audit row, one
 * transaction.
 *
 * Who may decide (inceleme Ö-2): the role rule (`canArchiveOpportunity`) is checked inside the
 * same transaction as the write, and the conditional update carries it in its `where` — a role
 * that may decide only on its own opportunities updates only rows it owns. The server action no
 * longer reads the owner in a transaction of its own and then writes in another.
 *
 * This module imports `@/lib/db`, so it can only ever run on the server.
 */
import type { DecisionKind, OppStatus } from '@prisma/client';
import { z } from 'zod';

import { withTenant } from '@/lib/db';
import { ARCHIVE_ROLES, canArchiveOpportunity } from '@/lib/pipeline/archive';
import { isPresentId } from '@/lib/required-id';

/** Who decides: `role` is the session's tenant role, checked in the writing transaction. */
type Scope = { tenantId: string; userId: string; role: string };

export const WITHDRAWAL_REASON_MAX = 2000;

export const WithdrawalInputSchema = z
  .object({ reason: z.string().trim().min(1).max(WITHDRAWAL_REASON_MAX) })
  .strict();
export type WithdrawalInput = z.input<typeof WithdrawalInputSchema>;

export type WithdrawalRefusal =
  | 'REASON_REQUIRED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_WITHDRAWN'
  | 'ALREADY_DECIDED';

export type ReactivationRefusal = 'REASON_REQUIRED' | 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_WITHDRAWN';

export type DecisionView = {
  id: string;
  opportunityId: string;
  kind: DecisionKind;
  reason: string;
  fromStatus: OppStatus | null;
  toStatus: OppStatus | null;
  decidedById: string | null;
  decidedAt: Date;
};

const WITHDRAWABLE: readonly OppStatus[] = ['ACTIVE', 'SUBMITTED'];

/**
 * Pure, so it can be tested without a database. Before a result (ACTIVE, SUBMITTED) the
 * institution can still step back; a submitted proposal can be withdrawn on the portal too.
 * Once there is a result (FUNDED, REJECTED, ABOVE_THRESHOLD) withdrawing would erase it.
 */
export function withdrawalRefusal(
  status: OppStatus,
): Exclude<WithdrawalRefusal, 'REASON_REQUIRED' | 'NOT_FOUND' | 'FORBIDDEN'> | null {
  if (status === 'WITHDRAWN') return 'ALREADY_WITHDRAWN';
  return WITHDRAWABLE.includes(status) ? null : 'ALREADY_DECIDED';
}

/** Pure. Only a withdrawn opportunity can be reactivated. */
export function reactivationRefusal(status: OppStatus): 'NOT_WITHDRAWN' | null {
  return status === 'WITHDRAWN' ? null : 'NOT_WITHDRAWN';
}

/**
 * Pure. Where a reactivation returns to: the status the withdrawal left, if it is one a withdrawal
 * can leave. Anything else — NULL on a row from before NG-241, no WITHDRAW row at all — is ACTIVE:
 * SUBMITTED would claim a submission the record does not show, and the user can declare it again.
 */
export function reactivationTarget(withdrawnFrom: OppStatus | null): OppStatus {
  return withdrawnFrom !== null && WITHDRAWABLE.includes(withdrawnFrom) ? withdrawnFrom : 'ACTIVE';
}

/**
 * The `where` half of the role rule, for the conditional update: a role outside ARCHIVE_ROLES
 * touches only a row it owns (`ownerId: null` never equals a user id). Same rule as
 * `canArchiveOpportunity`, which answers the read half and names the refusal.
 */
function ownedByScope(scope: Scope): { ownerId?: string } {
  return ARCHIVE_ROLES.has(scope.role) ? {} : { ownerId: scope.userId };
}

const DECISION_SELECT = {
  id: true,
  opportunityId: true,
  kind: true,
  reason: true,
  fromStatus: true,
  toStatus: true,
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
      select: { status: true, ownerId: true },
    });
    if (!opp) return { refused: 'NOT_FOUND' as const };
    if (!canArchiveOpportunity(scope.role, opp.ownerId, scope.userId)) return { refused: 'FORBIDDEN' as const };
    const refusal = withdrawalRefusal(opp.status);
    if (refusal) return { refused: refusal };

    // Conditional on the status just read (so `fromStatus` below is the status that was really
    // left) and on the role rule: of two concurrent withdrawals one updates, the other sees
    // count 0 and writes no second row; an owner changed in between also leaves count 0 for a
    // role that may decide only on its own.
    const moved = await tx.opportunity.updateMany({
      where: {
        id: opportunityId,
        tenantId: scope.tenantId,
        deletedAt: null,
        status: opp.status,
        ...ownedByScope(scope),
      },
      data: { status: 'WITHDRAWN' },
    });
    if (moved.count === 0) return { refused: 'ALREADY_WITHDRAWN' as const };

    const decision = await tx.decisionLog.create({
      data: {
        tenantId: scope.tenantId,
        opportunityId,
        kind: 'WITHDRAW',
        reason,
        fromStatus: opp.status,
        toStatus: 'WITHDRAWN',
        decidedById: scope.userId,
      },
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

export type ReactivationInput = Scope & { opportunityId: string; reason: string };

/**
 * WITHDRAWN → the status the latest withdrawal recorded (ACTIVE or SUBMITTED). Reason: the
 * withdrawal's rule (trimmed, 1–2000). Refusals: REASON_REQUIRED, NOT_FOUND (also another
 * tenant's id), FORBIDDEN (the role rule), NOT_WITHDRAWN (any other status, or a concurrent
 * reactivation won).
 */
export async function reactivateOpportunity(
  input: ReactivationInput,
): Promise<{ decision: DecisionView; status: OppStatus } | { refused: ReactivationRefusal }> {
  const { opportunityId, ...scope } = input;
  if (!isPresentId(opportunityId)) return { refused: 'NOT_FOUND' };
  const parsed = WithdrawalInputSchema.safeParse({ reason: input.reason });
  if (!parsed.success) return { refused: 'REASON_REQUIRED' };
  const { reason } = parsed.data;

  return withTenant(scope.tenantId, async (tx) => {
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId: scope.tenantId, deletedAt: null },
      select: { status: true, ownerId: true },
    });
    if (!opp) return { refused: 'NOT_FOUND' as const };
    if (!canArchiveOpportunity(scope.role, opp.ownerId, scope.userId)) return { refused: 'FORBIDDEN' as const };
    const refusal = reactivationRefusal(opp.status);
    if (refusal) return { refused: refusal };

    const lastWithdrawal = await tx.decisionLog.findFirst({
      where: { opportunityId, tenantId: scope.tenantId, kind: 'WITHDRAW' },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
      select: { fromStatus: true },
    });
    const target = reactivationTarget(lastWithdrawal?.fromStatus ?? null);

    // Same shape as the withdrawal: conditional on WITHDRAWN and on the role rule, so of two
    // concurrent reactivations one moves the row and the other writes nothing.
    const moved = await tx.opportunity.updateMany({
      where: {
        id: opportunityId,
        tenantId: scope.tenantId,
        deletedAt: null,
        status: 'WITHDRAWN',
        ...ownedByScope(scope),
      },
      data: { status: target },
    });
    if (moved.count === 0) return { refused: 'NOT_WITHDRAWN' as const };

    const decision = await tx.decisionLog.create({
      data: {
        tenantId: scope.tenantId,
        opportunityId,
        kind: 'REACTIVATE',
        reason,
        fromStatus: 'WITHDRAWN',
        toStatus: target,
        decidedById: scope.userId,
      },
      select: DECISION_SELECT,
    });
    await tx.auditEvent.create({
      data: {
        tenantId: scope.tenantId,
        actorId: scope.userId,
        type: 'opportunity.reactivated',
        target: opportunityId,
        data: { decisionId: decision.id, from: 'WITHDRAWN', to: target },
      },
    });
    return { decision, status: target };
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
      // id breaks a tie in the same millisecond (a withdrawal and its reactivation).
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    });
  });
}
