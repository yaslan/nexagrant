/**
 * M8 — SeatCandidate scoring algorithm.
 * 
 * Ranks CORDIS organizations for a given ConsortiumSeat by:
 *  - topicExperience: Has the org participated in projects with the same topicCode?
 *  - networkCentrality: eigenvector from the CORDIS graph
 *  - countryDiversity: bonus if country not already in the consortium
 *  - smeBonus: bonus if seat requires SME and org is SME
 *  - warmthBonus: bonus if we have an existing warm/hot relationship
 */

import { prisma } from '@/lib/db';

export interface ScoringBreakdown {
  topicExperience: number;
  networkCentrality: number;
  countryDiversity: number;
  smeBonus: number;
  warmthBonus: number;
  total: number;
}

export async function scoreCandidatesForSeat(
  tenantId: string,
  seatId: string,
  opportunityId: string,
  topicCode: string | null,
  limit: number = 5
): Promise<{ organizationId: string; score: ScoringBreakdown; rank: number }[]> {
  // 1. Get existing consortium members to check country diversity
  const existingSeats = await prisma.consortiumSeat.findMany({
    where: { opportunityId, status: { in: ['CONFIRMED', 'INVITED'] }, organizationId: { not: null } },
    select: { organizationId: true },
  });
  const existingOrgIds = existingSeats.map((s: any) => s.organizationId).filter(Boolean) as string[];

  // Get countries already in consortium
  const existingOrgs = existingOrgIds.length > 0
    ? await prisma.organization.findMany({
        where: { id: { in: existingOrgIds } },
        select: { country: true },
      })
    : [];
  const existingCountries = new Set(existingOrgs.map((o: any) => o.country).filter(Boolean));

  // 2. Get tenant's warm/hot relationships
  const relationships = await prisma.relationship.findMany({
    where: { tenantId, warmth: { in: ['warm', 'hot', 'active'] } },
    select: { organizationId: true },
  });
  const warmOrgIds = new Set(relationships.map((r: any) => r.organizationId).filter(Boolean));

  // 3. Get candidate organizations (exclude already assigned)
  const candidates = await prisma.organization.findMany({
    where: { id: { notIn: existingOrgIds } },
    orderBy: { eigenvector: 'desc' },
    take: 50, // pre-filter top 50 by centrality
  });

  // 4. If we have a topicCode, find orgs that have participated in projects with that topic
  let topicOrgIds = new Set<string>();
  if (topicCode) {
    const participations = await prisma.participation.findMany({
      where: { project: { topicCode } },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });
    topicOrgIds = new Set(participations.map((p: any) => p.organizationId));
  }

  // 5. Score each candidate
  const scored = candidates.map((org: any) => {
    const topicExperience = topicOrgIds.has(org.id) ? 3.0 : 0;
    const networkCentrality = Math.min(org.eigenvector * 10, 3.0); // normalize to 0-3
    const countryDiversity = (org.country && !existingCountries.has(org.country)) ? 1.5 : 0;
    const smeBonus = org.isSme ? 1.0 : 0;
    const warmthBonus = warmOrgIds.has(org.id) ? 1.5 : 0;
    const total = topicExperience + networkCentrality + countryDiversity + smeBonus + warmthBonus;

    return {
      organizationId: org.id,
      score: { topicExperience, networkCentrality, countryDiversity, smeBonus, warmthBonus, total },
    };
  });

  // 6. Sort by total score descending, take top N
  scored.sort((a: any, b: any) => b.score.total - a.score.total);
  const topCandidates = scored.slice(0, limit);

  // 7. Persist as SeatCandidate records
  const results = topCandidates.map((c: any, i: any) => ({ ...c, rank: i + 1 }));

  // Clear old candidates for this seat
  await prisma.seatCandidate.deleteMany({ where: { seatId } });

  for (const r of results) {
    await prisma.seatCandidate.create({
      data: {
        tenantId,
        seatId,
        organizationId: r.organizationId,
        score: r.score.total,
        breakdown: r.score,
        rank: r.rank,
      },
    });
  }

  return results;
}

/**
 * Detect conflicts: same org assigned to multiple seats in the same opportunity.
 */
export async function detectConflicts(opportunityId: string): Promise<string[]> {
  const seats = await prisma.consortiumSeat.findMany({
    where: { opportunityId, organizationId: { not: null } },
    select: { organizationId: true, roleKey: true },
  });

  const seen = new Map<string, string[]>();
  for (const s of seats) {
    if (!s.organizationId) continue;
    const roles = seen.get(s.organizationId) || [];
    roles.push(s.roleKey);
    seen.set(s.organizationId, roles);
  }

  const conflicts: string[] = [];
  for (const [orgId, roles] of seen.entries()) {
    if (roles.length > 1) {
      conflicts.push(`Org ${orgId} is assigned to multiple seats: ${roles.join(', ')}`);
    }
  }

  return conflicts;
}
