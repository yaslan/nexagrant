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
import { consortiumLiveDemandWeight } from '@/lib/env';
import { topicPrefix } from '@/modules/m8/server/matching';
import type { LiveDemandInput } from '@/core/contracts/live-demand';
import {
  liveDemandReason,
  liveDemandSignalFor,
  normalizedWeights,
  DEFAULT_LIVE_DEMAND_WEIGHT,
  type LiveDemandWeights,
} from '@/lib/scoring/live-demand';
import { normalizeSeatScore } from '@/lib/scoring/seat-score';

export interface ScoringBreakdown {
  topicExperience: number;
  networkCentrality: number;
  countryDiversity: number;
  smeBonus: number;
  warmthBonus: number;
  /** 0–1, live partner demand on the topic (src/lib/scoring/live-demand.ts). */
  liveDemandSignal: number;
  /** Shown only when M8 is on for the viewer; null otherwise or without an own request. */
  liveDemandReason: { days: number } | null;
  /** Weighted, normalised total on a 0–100 scale. */
  total: number;
}

export interface SeatScoringOptions {
  /** M8 is on for the viewer: the reason line is returned. The signal is always computed. */
  liveDemandVisible?: boolean;
  /** Weight of the live-demand dimension; unset = CONSORTIUM_LIVE_DEMAND_WEIGHT, then 15 %. */
  liveDemandWeight?: number;
}

/** Ceiling of the live-demand request set read per topic. */
const LIVE_DEMAND_REQUEST_LIMIT = 500;

/** Each raw dimension's maximum, so every component can be scaled to 0–1. */
const DIMENSION_MAX = {
  topicExperience: 3.0,
  networkCentrality: 3.0,
  countryDiversity: 1.5,
  smeBonus: 1.0,
  warmthBonus: 1.5,
} as const;

/** The raw dimensions a consortium breakdown stores, each in 0…its DIMENSION_MAX. */
export type ConsortiumDimensions = Pick<
  ScoringBreakdown,
  'topicExperience' | 'networkCentrality' | 'countryDiversity' | 'smeBonus' | 'warmthBonus'
>;

/**
 * The consortium score of one candidate on the 0–100 seat scale. Every component
 * is scaled to 0–1 and the weights sum to 1, so whatever the config weight is,
 * the fraction handed to {@link normalizeSeatScore} is 0–1. Also used by the
 * SeatCandidate rescore (src/lib/scoring/seat-rescore.ts) on stored breakdowns.
 */
export function consortiumSeatScore(
  dims: ConsortiumDimensions,
  liveDemandSignal: number,
  weights: LiveDemandWeights
): number {
  const fraction =
    weights.topicExperience * (dims.topicExperience / DIMENSION_MAX.topicExperience) +
    weights.networkCentrality * (dims.networkCentrality / DIMENSION_MAX.networkCentrality) +
    weights.countryDiversity * (dims.countryDiversity / DIMENSION_MAX.countryDiversity) +
    weights.smeBonus * (dims.smeBonus / DIMENSION_MAX.smeBonus) +
    weights.warmthBonus * (dims.warmthBonus / DIMENSION_MAX.warmthBonus) +
    weights.liveDemand * liveDemandSignal;
  return normalizeSeatScore(fraction);
}

/** The weights the consortium scorer uses: option, then CONSORTIUM_LIVE_DEMAND_WEIGHT, then 15 %. */
export function consortiumWeights(liveDemandWeight?: number): LiveDemandWeights {
  return normalizedWeights(liveDemandWeight ?? consortiumLiveDemandWeight ?? DEFAULT_LIVE_DEMAND_WEIGHT);
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

/**
 * K-572451=A: keep one live-demand owner in the top `limit`. When none of the first
 * `limit` candidates published a request, the best-scored owner below the cut takes
 * slot `limit` in place of the last one. Scores and weights are untouched.
 * `sorted` must already be ordered by score, highest first.
 */
export function withLiveDemandSlot<T extends { demandOwner: boolean }>(sorted: T[], limit: number): T[] {
  const top = sorted.slice(0, limit);
  if (limit < 1 || top.some((c) => c.demandOwner)) return top;
  const owner = sorted.find((c, i) => i >= limit && c.demandOwner);
  if (!owner) return top;
  return [...top.slice(0, limit - 1), owner];
}

export async function scoreCandidatesForSeat(
  tenantId: string,
  seatId: string,
  opportunityId: string,
  topicId: string | null,
  limit: number = 5,
  options: SeatScoringOptions = {}
): Promise<{ organizationId: string; score: ScoringBreakdown; rank: number }[]> {
  return withTenant(tenantId, (tx) =>
    runScoring(tx, { tenantId, seatId, opportunityId, topicId, limit, options })
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
    options: SeatScoringOptions;
  }
) {
  const { tenantId, seatId, opportunityId, topicId, limit, options } = params;
  const liveDemandVisible = options.liveDemandVisible === true;
  const weights = consortiumWeights(options.liveDemandWeight);
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

  // 4b. Active partner-search requests on this topic (M1 ingestion; read as plain
  // rows and mapped to the contract shape, M8 never imports the M1 module).
  const liveDemand: LiveDemandInput | null = topic
    ? {
        topicIdentifier: topic.identifier,
        requests: (
          await tx.partnerSearchAnnouncement.findMany({
            where: { topicIdentifier: topic.identifier, type: 'EXPERTISE_REQUEST', withdrawnAt: null },
            select: { organizationPic: true, publishedAt: true },
            take: LIVE_DEMAND_REQUEST_LIMIT,
          })
        ).map((r) => ({ organizationPic: r.organizationPic, publishedAt: r.publishedAt })),
      }
    : null;
  // 4c. Ö1: organisations that published a request on this topic join the pool even
  // when their track record puts them outside the top CANDIDATE_POOL, so a small
  // partner with live demand is not dropped before scoring. Bounded by the request
  // ceiling (LIVE_DEMAND_REQUEST_LIMIT), so the pool is at most CANDIDATE_POOL + 500.
  const pooled = new Set(candidates.map((c) => c.organisationId));
  const demandPicIds = [
    ...new Set((liveDemand?.requests ?? []).map((r) => r.organizationPic).filter((id): id is string => Boolean(id))),
  ].filter((id) => !pooled.has(id) && !existingOrgIds.includes(id));
  if (demandPicIds.length) {
    const demandProfiles: PartnerProfileRow[] = await tx.cordisPartnerProfile.findMany({
      where: { organisationId: { in: demandPicIds } },
      select: { organisationId: true, country: true, sme: true, totalProjects: true },
    });
    candidates.push(...demandProfiles);
  }
  const now = new Date();

  // 5. Score each candidate, on the 0–100 seat scale (consortiumSeatScore).
  const scored = candidates.map((org) => {
    const topicExperience = topicOrgIds.has(org.organisationId) ? DIMENSION_MAX.topicExperience : 0;
    const networkCentrality = Math.min(org.totalProjects / 10, DIMENSION_MAX.networkCentrality); // normalise to 0-3
    const countryDiversity =
      org.country && !existingCountries.has(org.country) ? DIMENSION_MAX.countryDiversity : 0;
    const smeBonus = org.sme ? DIMENSION_MAX.smeBonus : 0;
    const warmthBonus = warmOrgIds.has(org.organisationId) ? DIMENSION_MAX.warmthBonus : 0;
    const demand = liveDemand
      ? liveDemandSignalFor(liveDemand, org.organisationId, now)
      : { signal: 0, ownRequestAgeDays: null };

    const total = consortiumSeatScore(
      { topicExperience, networkCentrality, countryDiversity, smeBonus, warmthBonus },
      demand.signal,
      weights
    );

    return {
      organizationId: org.organisationId,
      demandOwner: demand.ownRequestAgeDays !== null,
      score: {
        topicExperience,
        networkCentrality,
        countryDiversity,
        smeBonus,
        warmthBonus,
        liveDemandSignal: demand.signal,
        liveDemandReason: liveDemandReason(demand.ownRequestAgeDays, liveDemandVisible),
        total,
      },
    };
  });

  // 6. Sort by total score descending, take top N. K-572451=A: the top N keeps one
  // live-demand owner, so a small partner with a request is not cut off by the track record.
  scored.sort((a, b) => b.score.total - a.score.total);
  const results = withLiveDemandSlot(scored, limit).map(({ organizationId, score }, i) => ({
    organizationId,
    score,
    rank: i + 1,
  }));

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
