'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import { generateSeatCandidates } from './matching';

/**
 * M8 consortium matching.
 *
 * `tenantId` used to be an argument from the matching page, and both the
 * opportunity and the seat were addressed by id alone — so a guessed seat id
 * could be confirmed against another tenant's consortium. The tenant now comes
 * from the session and every row is matched on `(id, tenantId)`.
 */

export async function computeSeatCandidates(opportunityId: string, seatId: string) {
  const { tenantId } = await requireTenantAction();

  const seat = await withTenant<{ id: string } | null>(tenantId, (tx) =>
    tx.consortiumSeat.findFirst({
      where: { id: seatId, opportunityId, tenantId },
      select: { id: true },
    })
  );
  if (!seat) throw new Error(`Seat ${seatId} not found in this workspace.`);

  await generateSeatCandidates(opportunityId, seatId, tenantId, 5);
  revalidatePath('/[workspace]/opportunities/[id]/matching', 'page');
}

export async function assignCandidateToSeat(
  seatId: string,
  organizationId: string,
  status: 'CANDIDATE' | 'INVITED' | 'CONFIRMED',
  opportunityId: string
) {
  const { tenantId } = await requireTenantAction();

  const updated = await withTenant<number>(tenantId, async (tx) => {
    if (status === 'CONFIRMED') {
      const opp = await tx.opportunity.findFirst({
        where: { id: opportunityId, tenantId },
        include: { topic: true }
      });

      if (!opp) throw new Error(`Opportunity ${opportunityId} not found in this workspace.`);

      if (opp.topic?.callId) {
        // The conflict check stays inside the tenant: another tenant's
        // consortium is none of this tenant's business and must not leak a
        // partner name through the error message.
        const conflict = await tx.consortiumSeat.findFirst({
          where: {
            tenantId,
            organizationId,
            status: 'CONFIRMED',
            opportunity: {
              callId: opp.topic.callId,
              id: { not: opportunityId },
              status: 'ACTIVE'
            }
          },
          include: { opportunity: true }
        });
        if (conflict) {
          throw new Error(`Conflict: Organization is already CONFIRMED in another active opportunity for the same call (${conflict.opportunity.title}).`);
        }
      }
    }

    // `updateMany` so the tenant stays in the WHERE clause.
    const result = await tx.consortiumSeat.updateMany({
      where: { id: seatId, opportunityId, tenantId },
      data: {
        organizationId,
        status
      }
    });
    return result.count;
  });

  if (updated === 0) throw new Error(`Seat ${seatId} not found in this workspace.`);

  revalidatePath('/[workspace]/opportunities/[id]/matching', 'page');
}
