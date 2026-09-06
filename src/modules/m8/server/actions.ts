'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { generateSeatCandidates } from './matching';

export async function computeSeatCandidates(opportunityId: string, seatId: string, tenantId: string) {
  await generateSeatCandidates(opportunityId, seatId, tenantId, 5);
  revalidatePath('/[workspace]/opportunities/[id]/matching', 'page');
}

export async function assignCandidateToSeat(
  seatId: string,
  organizationId: string,
  status: 'CANDIDATE' | 'INVITED' | 'CONFIRMED',
  opportunityId: string
) {
  if (status === 'CONFIRMED') {
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { topic: true }
    });

    if (opp?.topic?.callId) {
      const conflict = await prisma.consortiumSeat.findFirst({
        where: {
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

  await prisma.consortiumSeat.update({
    where: { id: seatId },
    data: {
      organizationId,
      status
    }
  });

  revalidatePath('/[workspace]/opportunities/[id]/matching', 'page');
}
