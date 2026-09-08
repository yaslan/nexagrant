'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { scoreCandidatesForSeat, detectConflicts } from '@/lib/scoring/consortium';
import { revalidatePath } from 'next/cache';
import { errorMessage } from '@/lib/errors';

/**
 * M8 consortium seats.
 *
 * Every action here used to resolve its tenant as
 * `session.tenantId ?? prisma.tenant.findFirst()` — the first row in the table,
 * which is whichever tenant happened to be seeded first — and then queried
 * seats by `id` alone. A seat id from another tenant was therefore readable and
 * writable. The tenant now comes from `requireTenantAction()` and every query
 * runs inside `withTenant`, matched on `(id, tenantId)`.
 */

const PIPELINE_PATH = '/[locale]/(app)/[workspace]/pipeline';

export async function addSeat(opportunityId: string, roleKey: string, required: boolean = true) {
  const { tenantId } = await requireTenantAction();

  const seat = await withTenant(tenantId, async (tx) => {
    // The opportunity must belong to this tenant; an id is guessable.
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true },
    });
    if (!opp) return null;

    return tx.consortiumSeat.create({
      data: {
        tenantId,
        opportunityId,
        roleKey,
        required,
        status: 'OPEN',
      },
    });
  });

  if (!seat) {
    throw new Error(`Opportunity ${opportunityId} not found in this workspace.`);
  }

  revalidatePath(PIPELINE_PATH, 'page');
  return seat;
}

export async function findCandidates(seatId: string) {
  const { tenantId } = await requireTenantAction();

  const seat = await withTenant<{ id: string; opportunityId: string } | null>(tenantId, (tx) =>
    tx.consortiumSeat.findFirst({
      where: { id: seatId, tenantId },
      select: { id: true, opportunityId: true },
    })
  );

  if (!seat) return [];

  const opp = await withTenant<{ topicId: string | null } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: seat.opportunityId, tenantId },
      select: { topicId: true },
    })
  );

  // `Opportunity.topicId` is a `Topic` cuid; the scorer resolves it to the topic
  // identifier itself, so it is passed through as an id rather than a code.
  const candidates = await scoreCandidatesForSeat(
    tenantId,
    seatId,
    seat.opportunityId,
    opp?.topicId || null,
    5
  );

  revalidatePath(PIPELINE_PATH, 'page');
  return candidates;
}

export async function assignSeat(seatId: string, organizationId: string) {
  const { tenantId } = await requireTenantAction();

  // `updateMany` keeps tenantId in the WHERE clause; `update` takes only a
  // unique selector and would let a guessed seat id reassign another tenant's seat.
  const updated = await withTenant<{ count: number }>(tenantId, (tx) =>
    tx.consortiumSeat.updateMany({
      where: { id: seatId, tenantId },
      data: { organizationId, status: 'INVITED' },
    })
  );

  revalidatePath(PIPELINE_PATH, 'page');
  return { success: updated.count > 0 };
}

export async function getConflicts(opportunityId: string) {
  const { tenantId } = await requireTenantAction();

  const opp = await withTenant<{ id: string } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true },
    })
  );
  if (!opp) return [];

  try {
    return await detectConflicts(opportunityId, tenantId);
  } catch (e) {
    console.warn(`[getConflicts] error for ${opportunityId}: ${errorMessage(e)}`);
    return [];
  }
}
