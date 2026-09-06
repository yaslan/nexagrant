import { prisma } from '@/lib/db';

interface MatchCandidate {
  organizationId: string;
  score: number;
  breakdown: any;
}

export async function generateSeatCandidates(
  opportunityId: string,
  seatId: string,
  tenantId: string,
  limit = 5
) {
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { seats: true, topic: { include: { call: true } } }
  });

  const seat = await prisma.consortiumSeat.findUnique({
    where: { id: seatId }
  });

  if (!opp || !seat) throw new Error('Missing opp or seat');

  // Prefix matching for OrgTopicStat
  const prefixParts = opp.topic?.identifier?.split('-') || [];
  const prefix = prefixParts.length > 2 ? prefixParts.slice(0, 3).join('-') : opp.topic?.identifier || '';
  
  const stats = await prisma.orgTopicStat.findMany({
    where: { topicPrefix: { startsWith: prefix } },
    include: { organization: true },
    take: 100 // limit search space for performance (< 3s target)
  });
  
  let candidatesMap = new Map<string, MatchCandidate>();

  const confirmedSeats = opp.seats.filter((s: any) => s.status === 'CONFIRMED' && s.organizationId);
  const confirmedOrgIds = confirmedSeats.map((s: any) => s.organizationId!);
  
  const confirmedOrgs = await prisma.organization.findMany({ 
    where: { id: { in: confirmedOrgIds } } 
  });
  const confirmedCountries = new Set(confirmedOrgs.map((o: any) => o.country).filter(Boolean));

  const relationships = await prisma.relationship.findMany({
    where: { tenantId }
  });
  const relMap = new Map(relationships.map((r: any) => [r.organizationId, r]));

  for (const stat of stats) {
    const orgId = stat.organizationId;
    if (!orgId) continue;
    
    // Skip if already in consortium
    if (confirmedOrgIds.includes(orgId)) continue;
    
    // Coordinator rule
    if (seat.roleKey === 'coordinator' && stat.coordinatorCount < 1) {
      continue;
    }

    let score = 0;
    const breakdown: any = {};

    // 1. Topic Experience (35 max)
    const expScore = Math.min(35, (stat.participationCount * 5) + (stat.coordinatorCount * 10));
    score += expScore;
    breakdown['topicExperience'] = expScore;

    // 2. Geographic Balance (15 max)
    const orgCountry = stat.organization.country;
    let geoScore = 15;
    if (orgCountry && confirmedCountries.has(orgCountry)) geoScore = 0; 
    score += geoScore;
    breakdown['geographicBalance'] = geoScore;

    // 3. Collab History (15 max)
    let collabScore = 0;
    if (confirmedOrgIds.length > 0) {
      const collabs = await prisma.collab.findMany({
        where: {
          OR: [
            { orgA: orgId, orgB: { in: confirmedOrgIds } },
            { orgB: orgId, orgA: { in: confirmedOrgIds } }
          ]
        }
      });
      const totalProjects = collabs.reduce((acc: any, c: any) => acc + (c.projects || 0), 0);
      collabScore = Math.min(15, totalProjects * 5);
    }
    score += collabScore;
    breakdown['collabHistory'] = collabScore;

    // 4. Warmth (15 max)
    let warmthScore = 0;
    const rel = relMap.get(orgId) as any;
    if (rel) {
      if (rel.warmth === 'active' || rel.warmth === 'hot') warmthScore = 15;
      else if (rel.warmth === 'warm') warmthScore = 10;
      else if (rel.warmth === 'cold') warmthScore = 5;
    }
    score += warmthScore;
    breakdown['relationshipWarmth'] = warmthScore;

    // 5. Centrality (10 max)
    const centScore = Math.min(10, (stat.organization.degree || 0) / 10);
    score += centScore;
    breakdown['centrality'] = centScore;

    // 6. Rival Risk (-10 max)
    let rivalScore = 0;
    if (opp.topic?.callId) {
      const rivalCheck = await prisma.consortiumSeat.findFirst({
        where: {
          organizationId: orgId,
          status: { in: ['CONFIRMED', 'CANDIDATE'] },
          opportunity: {
            callId: opp.topic.callId,
            id: { not: opportunityId },
            status: 'ACTIVE'
          }
        }
      });
      if (rivalCheck) rivalScore = -10;
    }
    score += rivalScore;
    breakdown['rivalRisk'] = rivalScore;

    candidatesMap.set(orgId, {
      organizationId: orgId,
      score,
      breakdown
    });
  }

  const sorted = Array.from(candidatesMap.values()).sort((a, b) => b.score - a.score).slice(0, limit);

  // Transaction to clean old and save new
  const savedCandidates = await prisma.$transaction(async (tx) => {
    await tx.seatCandidate.deleteMany({ where: { tenantId, seatId } });
    const created = [];
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      const sc = await tx.seatCandidate.create({
        data: {
          tenantId,
          seatId,
          organizationId: c.organizationId,
          score: c.score,
          breakdown: c.breakdown,
          rank: i + 1
        }
      });
      created.push(sc);
    }
    return created;
  });

  return savedCandidates;
}
