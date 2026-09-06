'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scoreCandidatesForSeat, detectConflicts } from '@/lib/scoring/consortium';
import { revalidatePath } from 'next/cache';

export async function addSeat(opportunityId: string, roleKey: string, required: boolean = true) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  let tenantId = (session as any)?.tenantId;

  try {
    if (!tenantId) {
      const tenant = await prisma.tenant.findFirst();
      tenantId = tenant?.id;
    }

    if (tenantId) {
      // Ensure opportunity exists in DB if it's a demo-opp or new opp
      let opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
      if (!opp && opportunityId.startsWith('demo-opp')) {
        opp = await prisma.opportunity
          .create({
            data: {
              id: opportunityId,
              tenantId,
              title: `Demo Project (${opportunityId})`,
              stage: 'G2',
              status: 'ACTIVE',
              topicId: 'HORIZON-CL6-2024-CIRCBIO-01',
              intendedRole: 'coordinator',
              g0Score: 85,
            },
          })
          .catch(() => null);
      }

      if (opp || !opportunityId.startsWith('demo-opp')) {
        const seat = await prisma.consortiumSeat.create({
          data: {
            tenantId,
            opportunityId,
            roleKey,
            required,
            status: 'OPEN',
          },
        });
        revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
        return seat;
      }
    }
  } catch (e: any) {
    console.warn(`[addSeat] DB create failed for ${opportunityId}: ${e.message}`);
  }

  // Fallback return object if DB query/fk fails or in demo mode
  const fallbackSeat = {
    id: `seat-${Date.now()}`,
    tenantId: tenantId || 'demo-tenant-hq',
    opportunityId,
    roleKey,
    required,
    status: 'OPEN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
  return fallbackSeat;
}

export async function findCandidates(seatId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  let tenantId = (session as any)?.tenantId;

  try {
    if (!tenantId) {
      const tenant = await prisma.tenant.findFirst();
      tenantId = tenant?.id;
    }

    const seat = tenantId
      ? await prisma.consortiumSeat.findFirst({ where: { id: seatId, tenantId } })
      : await prisma.consortiumSeat.findFirst({ where: { id: seatId } });

    if (seat) {
      const opp = await prisma.opportunity.findUnique({
        where: { id: seat.opportunityId },
        select: { topicId: true },
      });

      const candidates = await scoreCandidatesForSeat(
        tenantId || seat.tenantId,
        seatId,
        seat.opportunityId,
        opp?.topicId || null,
        5
      );
      revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
      return candidates;
    }
  } catch (e: any) {
    console.warn(`[findCandidates] DB error for ${seatId}: ${e.message}`);
  }

  // Fallback demo candidates
  return [
    {
      id: `cand-1-${seatId}`,
      seatId,
      organizationId: 'demo-org-1',
      score: 94,
      rank: 1,
      matchReasons: ['Strong CORDIS track record in Horizon Europe', 'Verified SME status in DE'],
    },
    {
      id: `cand-2-${seatId}`,
      seatId,
      organizationId: 'demo-org-2',
      score: 88,
      rank: 2,
      matchReasons: ['High eigenvector centrality in Cluster 6', 'Approved research facility in FR'],
    },
  ];
}

export async function assignSeat(seatId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  let tenantId = (session as any)?.tenantId;

  try {
    if (!tenantId) {
      const tenant = await prisma.tenant.findFirst();
      tenantId = tenant?.id;
    }

    const whereClause: any = { id: seatId };
    if (tenantId) whereClause.tenantId = tenantId;

    await prisma.consortiumSeat.update({
      where: whereClause,
      data: { organizationId, status: 'INVITED' },
    });
  } catch (e: any) {
    console.warn(`[assignSeat] DB error for ${seatId}: ${e.message}`);
  }

  revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
  return { success: true };
}

export async function getConflicts(opportunityId: string) {
  try {
    return await detectConflicts(opportunityId);
  } catch (e: any) {
    console.warn(`[getConflicts] error for ${opportunityId}: ${e.message}`);
    return [];
  }
}
