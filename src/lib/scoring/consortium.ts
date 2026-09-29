/**
 * M8 — SeatCandidate scoring algorithm (the "Aday Bul" button on
 * /[workspace]/pipeline/[id]/consortium).
 *
 * Ranks CORDIS organisations for a given ConsortiumSeat by:
 *  - topicExperience: has the org been on a project under the same topic prefix?
 *  - networkCentrality: how broad the org's CORDIS track record is
 *  - countryDiversity: bonus if its country is not already in the consortium
 *  - smeBonus: bonus if the org is an SME
 *  - warmthBonus: bonus if the tenant already has a warm/hot relationship
 *
 * This scorer used to read `prisma.organization` and `prisma.participation`.
 * Neither model is in prisma/schema.prisma, so every click on "Aday Bul"
 * returned a 500. The partner graph the product actually imports is CORDIS
 * (src/lib/k2-cordis), so the sources are now:
 *
 *   Organization.eigenvector → CordisPartnerProfile.totalProjects  (the
 *       purpose-built ranked partner summary; "top 50 by centrality" becomes
 *       "top 50 by track record", which is the signal that table exists to carry)
 *   Organization.isSme       → CordisPartnerProfile.sme
 *   Participation            → CordisProjectTopic ⨝ CordisParticipation
 *
 * The second bug this fixes is the topic argument: callers pass
 * `Opportunity.topicId`, which is a `Topic` cuid — it was compared against
 * `project.topicCode`, a call identifier like `HORIZON-CL5-2026-D4-01`, and so
 * never matched. The topic is now resolved to its identifier here.
 */

import { withTenant, type TenantTx } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { topicPrefix } from '@/modules/m8/server/matching';

export interface ScoringBreakdown {
  topicExperience: number;
  networkCentrality: number;
  countryDiversity: number;
  smeBonus: number;
  warmthBonus: number;
  total: number;
}

/** Bounds on the search space, mirroring src/modules/m8/server/matching.ts. */
const TOPIC_PROJECT_LIMIT = 2_000;
const PARTICIPATION_LIMIT = 20_000;
/** Organisations pre-filtered by track record before scoring. */
const CANDIDATE_POOL = 50;

interface PartnerProfileRow {
  organisationId: string;
  country: string | null;
  sme: boolean;
  totalProjects: number;
}

export async function scoreCandidatesForSeat(
  tenantId: string,
  seatId: string,
  opportunityId: string,
  topicId: string | null,
  limit: number = 5
): Promise<{ organizationId: string; score: ScoringBreakdown; rank: number }[]> {
  return withTenant(tenantId, (tx) =>
    runScoring(tx, { tenantId, seatId, opportunityId, topicId, limit })
  );
}

async function runScoring(
  tx: TenantTx,
  params: {
    tenantId: string;
    seatId: string;
    opportunityId: string;
    topicId: string | null;
    limit: number;
  }
) {
  const { tenantId, seatId, opportunityId, topicId, limit } = params;
  // The persist step is `deleteMany({ tenantId, seatId })`: a missing seat id would
  // wipe the candidates of every seat of the tenant (TASK-MUN2KUHP1BP18).
  if (!isPresentId(seatId) || !isPresentId(tenantId)) throw new Error('Seat not found in this workspace.');

  // 1. Existing consortium members, for country diversity. Scoped to the tenant:
  // the seat ids come from a URL and an opportunity id is guessable.
  const existingSeats: { organizationId: string | null }[] = await tx.consortiumSeat.findMany({
    where: {
      tenantId,
      opportunityId,
      status: { in: ['CONFIRMED', 'INVITED'] },
      organizationId: { not: null },
    },
    select: { organizationId: true },
  });
  const existingOrgIds = existingSeats
    .map((s) => s.organizationId)
    .filter((id): id is string => Boolean(id));

  const existingOrgs: { country: string | null }[] = existingOrgIds.length
    ? await tx.cordisOrganization.findMany({
        where: { organisationId: { in: existingOrgIds } },
        select: { country: true },
      })
    : [];
  const existingCountries = new Set(
    existingOrgs.map((o) => o.country).filter((c): c is string => Boolean(c))
  );

  // 2. The tenant's warm relationships.
  const relationships: { organizationId: string | null }[] = await tx.relationship.findMany({
    where: { tenantId, warmth: { in: ['warm', 'hot', 'active'] } },
    select: { organizationId: true },
  });
  const warmOrgIds = new Set(
    relationships.map((r) => r.organizationId).filter((id): id is string => Boolean(id))
  );

  // 3. Candidate organisations, best track record first, minus the seated ones.
  const candidates: PartnerProfileRow[] = await tx.cordisPartnerProfile.findMany({
    where: existingOrgIds.length ? { organisationId: { notIn: existingOrgIds } } : {},
    orderBy: { totalProjects: 'desc' },
    select: { organisationId: true, country: true, sme: true, totalProjects: true },
    take: CANDIDATE_POOL,
  });

  // 4. Organisations with experience under this topic's call prefix.
  const topic = topicId
    ? await tx.topic.findUnique({ where: { id: topicId }, select: { identifier: true } })
    : null;
  const prefix = topicPrefix(topic?.identifier);

  let topicOrgIds = new Set<string>();
  if (prefix) {
    const topicProjects: { projectId: string }[] = await tx.cordisProjectTopic.findMany({
      where: { topicCode: { startsWith: prefix } },
      select: { projectId: true },
      take: TOPIC_PROJECT_LIMIT,
    });
    const projectIds = [...new Set(topicProjects.map((r) => r.projectId))];

    if (projectIds.length) {
      const participations: { organisationId: string }[] = await tx.cordisParticipation.findMany({
        where: { projectId: { in: projectIds } },
        select: { organisationId: true },
        take: PARTICIPATION_LIMIT,
      });
      topicOrgIds = new Set(participations.map((p) => p.organisationId));
    }
  }

  // 5. Score each candidate.
  const scored = candidates.map((org) => {
    const topicExperience = topicOrgIds.has(org.organisationId) ? 3.0 : 0;
    const networkCentrality = Math.min(org.totalProjects / 10, 3.0); // normalise to 0-3
    const countryDiversity = org.country && !existingCountries.has(org.country) ? 1.5 : 0;
    const smeBonus = org.sme ? 1.0 : 0;
    const warmthBonus = warmOrgIds.has(org.organisationId) ? 1.5 : 0;
    const total = topicExperience + networkCentrality + countryDiversity + smeBonus + warmthBonus;

    return {
      organizationId: org.organisationId,
      score: { topicExperience, networkCentrality, countryDiversity, smeBonus, warmthBonus, total },
    };
  });

  // 6. Sort by total score descending, take top N.
  scored.sort((a, b) => b.score.total - a.score.total);
  const results = scored.slice(0, limit).map((c, i) => ({ ...c, rank: i + 1 }));

  // 7. Persist. `deleteMany` carries the tenant so a guessed seat id from
  // another tenant cannot clear its candidates.
  await tx.seatCandidate.deleteMany({ where: { tenantId, seatId } });

  for (const r of results) {
    await tx.seatCandidate.create({
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
export async function detectConflicts(
  opportunityId: string,
  tenantId: string
): Promise<string[]> {
  const seats: { organizationId: string | null; roleKey: string }[] = await withTenant(
    tenantId,
    (tx) =>
      tx.consortiumSeat.findMany({
        where: { tenantId, opportunityId, organizationId: { not: null } },
        select: { organizationId: true, roleKey: true },
      })
  );

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
