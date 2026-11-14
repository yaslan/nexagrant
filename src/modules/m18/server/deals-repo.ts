import type { DealStage } from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import { checkStageTransition, STAGE_ORDER, TERMINAL_STAGES, type TransitionRefusal } from './pipeline-rules';
import { dealCreateSchema, stageMoveSchema, type DealCreateInput, type StageMoveInput } from './schemas';

/**
 * Deal (sales pipeline) CRUD and stage moves (NG-135 / F3). Stage rules are NOT repeated here:
 * `checkStageTransition` in pipeline-rules.ts is the only rule table; this file only asks it.
 */

export class DealTransitionError extends Error {
  constructor(public readonly reason: TransitionRefusal) {
    super(`Deal stage transition refused: ${reason}`);
    this.name = 'DealTransitionError';
  }
}

export const DEAL_BOARD_STAGES: readonly DealStage[] = [...STAGE_ORDER, ...TERMINAL_STAGES] as DealStage[];

export const DEAL_BOARD_SELECT = {
  id: true,
  title: true,
  stage: true,
  stageChangedAt: true,
  estimatedFeeCents: true,
  currency: true,
  organizationId: true,
  organization: { select: { name: true } },
} as const;

/** All open deals, grouped by stage in board order. Empty stages are kept so the board shows them. */
export async function listDealsByStage(tx: TenantTx, tenantId: string, take = 500) {
  const deals = await tx.deal.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ stageChangedAt: 'desc' }, { id: 'asc' }],
    take,
    select: DEAL_BOARD_SELECT,
  });
  const byStage = new Map<DealStage, typeof deals>();
  for (const stage of DEAL_BOARD_STAGES) byStage.set(stage, []);
  for (const deal of deals) byStage.get(deal.stage)?.push(deal);
  return DEAL_BOARD_STAGES.map((stage) => ({ stage, deals: byStage.get(stage) ?? [] }));
}

export async function createDeal(tx: TenantTx, tenantId: string, rawInput: unknown, ownerUserId: string | null) {
  const input: DealCreateInput = dealCreateSchema.parse(rawInput);
  const org = await tx.leadOrganization.findFirst({
    where: { id: input.organizationId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!org) return null;
  return tx.deal.create({
    data: {
      tenantId,
      organizationId: org.id,
      title: input.title,
      stage: 'NEW',
      estimatedFeeCents: input.estimatedFeeCents,
      currency: input.currency,
      ownerUserId,
    },
    select: { id: true },
  });
}

/**
 * Moves a deal to `to` if the rule table allows it. Writes a STAGE_CHANGE activity in the same
 * transaction so the history never disagrees with the stage.
 */
export async function moveDealStage(
  tx: TenantTx,
  tenantId: string,
  rawInput: unknown,
  actorUserId: string | null,
) {
  const input: StageMoveInput = stageMoveSchema.parse(rawInput);
  const deal = await tx.deal.findFirst({
    where: { id: input.dealId, tenantId, deletedAt: null },
    select: { id: true, stage: true },
  });
  if (!deal) return null;

  const check = checkStageTransition({ from: deal.stage, to: input.to, lostReason: input.lostReason });
  if (!check.ok) throw new DealTransitionError(check.reason);

  const now = new Date();
  await tx.deal.update({
    where: { id: deal.id },
    data: {
      stage: input.to,
      stageChangedAt: now,
      ...(input.to === 'LOST' ? { lostReason: input.lostReason ?? null } : {}),
    },
  });
  await tx.dealActivity.create({
    data: {
      tenantId,
      dealId: deal.id,
      kind: 'STAGE_CHANGE',
      payload: { from: deal.stage, to: input.to },
      actorUserId,
      occurredAt: now,
    },
  });
  return { id: deal.id, from: deal.stage, to: input.to };
}
