import { withTenant, type TenantTx } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { MATCH_DIMENSION_SCALE } from '@/lib/scoring/seat-dimension-scale';
import { normalizeSeatScore } from '@/lib/scoring/seat-score';
import { SeatNotFoundError } from './errors';
import { minimumPartnerState, passesMinimumPartnerFilter, readMinimumPartnerRule } from './minimum-partners';

/**
 * M8 seat matching — ranked partner candidates for one open consortium seat.
 *
 * This file used to query four things that are not in prisma/schema.prisma:
 * `Organization`, `OrgTopicStat`, `Collab`, and `Opportunity.callId` /
 * `Opportunity.topic`. Every one of them threw the moment a user clicked
 * "Find Candidates"; the unit test stayed green because it mocked
 * `@/lib/db` wholesale, so the mock — not the schema — decided what a model was.
 *
 * The partner graph the product actually has is CORDIS, imported by
 * src/lib/k2-cordis. The mapping used here, and why it is a reuse rather than a
 * new table:
 *
 *   Organization   → CordisOrganization      `ConsortiumSeat.organizationId` is
 *                                            already documented in the schema as
 *                                            a CORDIS PIC, so a new partner
 *                                            table would be a second, unfed copy
 *                                            of the same graph.
 *   OrgTopicStat   → CordisProjectTopic ⨝ CordisParticipation, aggregated per
 *                                            organisation at query time.
 *   Collab         → CordisCoParticipation   `sharedProjectCount` is the same
 *                                            edge weight the old `projects` was.
 *
 * The CORDIS tables are platform-shared reference data (scripts/rls-models.ts
 * lists them as SYSTEM_WIDE), so no new table, migration or RLS policy is
 * needed. Everything still runs inside `withTenant`, so the tenant-scoped reads
 * and the writes below are covered by the `tenant_isolation` policy.
 */

/**
 * Why a candidate scored what it did: one entry per scoring dimension, in raw
 * points (their sum is {@link totalScore}; `MatchCandidate.score` is that sum on
 * the 0–100 seat scale, {@link matchSeatScore}). Persisted to `SeatCandidate.breakdown` (Json), so
 * the UI can show the reasoning rather than a bare number.
 */
/** Written verbatim into `SeatCandidate.breakdown`, a JSON column — a type alias, not an interface, so it stays assignable to a JSON value. */
export type MatchBreakdown = {
  topicExperience: number;
  geographicBalance: number;
  collabHistory: number;
  rivalRisk: number;
}

/**
 * A `SeatCandidate.breakdown` written before K-578751, when warmth and centrality
 * were criteria too. Rows like this stay in the table until the seat is matched
 * again, so they are still read — never written.
 */
export type LegacyMatchBreakdown = MatchBreakdown & {
  relationshipWarmth: number;
  centrality: number;
};

export interface MatchCandidate {
  organizationId: string;
  score: number;
  breakdown: MatchBreakdown;
}

/** Everything the scorer needs about one organisation, already looked up. */
export interface CandidateSignals {
  participationCount: number;
  coordinatorCount: number;
  /** ISO country of the candidate; null when CORDIS has none. */
  country: string | null;
  /** Countries already held by CONFIRMED seats on this opportunity. */
  takenCountries: ReadonlySet<string>;
  /** Shared CORDIS projects between this org and the confirmed partners. */
  sharedProjects: number;
  /** The org is seated on another live opportunity under the same call. */
  isRival: boolean;
}

/** Points per past participation and per coordination under the topic prefix. */
const POINTS_PER_PARTICIPATION = 5;
const POINTS_PER_COORDINATION = 10;
/** Points per shared project: full marks on the third, where the old 5-of-15 scale also capped. */
const POINTS_PER_SHARED_PROJECT = 11;

/**
 * The scoring rule, as a pure function so it can be tested without a database.
 * Three criteria and a separate penalty (K-578751, specification §6); each cap is
 * read from {@link MATCH_DIMENSION_SCALE}, which the UI shows it against.
 */
export function scoreCandidate(signals: CandidateSignals): MatchBreakdown {
  return {
    // 1. Past experience (0–34)
    topicExperience: Math.min(
      MATCH_DIMENSION_SCALE.topicExperience.max,
      signals.participationCount * POINTS_PER_PARTICIPATION + signals.coordinatorCount * POINTS_PER_COORDINATION
    ),
    // 2. Country balance (0 or 33) — only a recorded country not yet on the consortium earns it.
    geographicBalance:
      signals.country && !signals.takenCountries.has(signals.country) ? MATCH_DIMENSION_SCALE.geographicBalance.max : 0,
    // 3. Collaboration history with the confirmed partners (0–33)
    collabHistory: Math.min(MATCH_DIMENSION_SCALE.collabHistory.max, signals.sharedProjects * POINTS_PER_SHARED_PROJECT),
    // Rival risk (-10), a penalty on top of the three criteria.
    rivalRisk: signals.isRival ? MATCH_DIMENSION_SCALE.rivalRisk.min : 0,
  };
}

export function totalScore(breakdown: MatchBreakdown | LegacyMatchBreakdown): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

/** Highest raw total {@link scoreCandidate} can give: 34 + 33 + 33 with no rival penalty. */
export const MATCH_MAX_TOTAL = 100;

/** Highest raw total the pre-K-578751 scorer could give: 35 + 15 + 15 + 15 + 10. */
export const MATCH_LEGACY_MAX_TOTAL = 90;

/**
 * The matcher's raw total on the 0–100 `SeatCandidate.score` scale shared with
 * the consortium builder (src/lib/scoring/seat-score.ts). Linear, so the order of
 * candidates is kept; a rival whose penalty takes the raw total below 0 scores 0.
 */
export function matchSeatScore(breakdown: MatchBreakdown): number {
  return normalizeSeatScore(totalScore(breakdown) / MATCH_MAX_TOTAL);
}

/**
 * The same, for a row the old scorer wrote: its points were earned against a
 * maximum of 90, so dividing them by 100 would lower the score of every stored row.
 */
export function legacyMatchSeatScore(breakdown: LegacyMatchBreakdown): number {
  return normalizeSeatScore(totalScore(breakdown) / MATCH_LEGACY_MAX_TOTAL);
}

/**
 * The call-level prefix a topic identifier belongs to:
 * `HORIZON-CL5-2026-D4-01` → `HORIZON-CL5-2026`. Candidates are drawn from
 * CORDIS projects whose `topicCode` starts with it.
 */
export function topicPrefix(identifier: string | null | undefined): string {
  if (!identifier) return '';
  const parts = identifier.split('-').filter(Boolean);
  return parts.length > 2 ? parts.slice(0, 3).join('-') : identifier;
}

/** Bounds on the search space, so a broad prefix cannot walk the whole import. */
const TOPIC_PROJECT_LIMIT = 2_000;
const PARTICIPATION_LIMIT = 20_000;
const EDGE_LIMIT = 20_000;
/** Organisations carried into the (more expensive) scoring stage. */
const CANDIDATE_POOL = 100;

interface SeatRow {
  status: string;
  organizationId: string | null;
  partnerOrgId?: string | null;
}

/**
 * The countries the consortium already holds: every CONFIRMED seat, whether it is filled
 * by a CORDIS organisation (`organizationId` → CordisOrganization.country) or by the
 * tenant's own partner record (`partnerOrgId` → PartnerOrg.country, tenant-scoped).
 * CRW NG-186 bulgu 3: counting CORDIS seats alone overstated the country shortfall and
 * dropped candidates the consortium no longer needed to be new. One lookup for the CORDIS
 * matcher and the expert pool (expert-candidates.ts), so both count the same countries.
 */
export async function confirmedSeatCountries(
  tx: Pick<TenantTx, 'cordisOrganization' | 'partnerOrg'>,
  seats: readonly SeatRow[],
  tenantId: string
): Promise<Set<string>> {
  const confirmed = seats.filter((s) => s.status === 'CONFIRMED');
  const orgIds = [...new Set(confirmed.map((s) => s.organizationId).filter((id): id is string => Boolean(id)))];
  const partnerIds = [
    ...new Set(confirmed.filter((s) => !s.organizationId).map((s) => s.partnerOrgId).filter((id): id is string => Boolean(id))),
  ];
  const cordis: { country: string | null }[] = orgIds.length
    ? await tx.cordisOrganization.findMany({ where: { organisationId: { in: orgIds } }, select: { country: true } })
    : [];
  const partners: { country: string | null }[] = partnerIds.length
    ? await tx.partnerOrg.findMany({ where: { id: { in: partnerIds }, tenantId }, select: { country: true } })
    : [];
  return new Set(
    [...cordis.map((o) => o.country), ...partners.map((o) => o.country?.trim().toUpperCase() ?? null)].filter(
      (c): c is string => Boolean(c)
    )
  );
}

/**
 * The topic an opportunity points at, by either key the pipeline has written: the Topic
 * cuid (older rows) or the topic IDENTIFIER (the form). NG-100 B-4: this is the one lookup
 * for the matcher and for the consortium page's live-demand badge, so they resolve a topic
 * the same way.
 */
export async function findOpportunityTopic(
  tx: Pick<TenantTx, 'topic'>,
  topicId: string | null | undefined
): Promise<{ identifier: string; callId: string | null; eligibility?: unknown } | null> {
  if (!topicId) return null;
  // `eligibility` carries the call's minimum-partner threshold (NG-52, minimum-partners.ts).
  return tx.topic.findFirst({
    where: { OR: [{ id: topicId }, { identifier: topicId }] },
    select: { identifier: true, callId: true, eligibility: true },
  });
}

/**
 * Runs one matching pass on an already tenant-scoped client.
 *
 * Exported separately from {@link generateSeatCandidates} so a test can drive it
 * with a real transaction (or a hand-built double) without having to replace the
 * `@/lib/db` module — replacing that module is exactly what hid this bug.
 */
export async function runSeatMatch(
  tx: TenantTx,
  params: { opportunityId: string; seatId: string; tenantId: string; limit: number }
) {
  const { opportunityId, seatId, tenantId, limit } = params;
  // The clear below is `deleteMany({ tenantId, seatId })`: a missing seat id would
  // wipe the candidates of every seat of the tenant (TASK-MUN2KUHP1BP18).
  if (!isPresentId(seatId) || !isPresentId(tenantId)) throw new SeatNotFoundError('Seat not found in this workspace.');

  const opp = await tx.opportunity.findFirst({
    where: { id: opportunityId, tenantId },
    select: {
      id: true,
      topicId: true,
      seats: { select: { status: true, organizationId: true, partnerOrgId: true } },
    },
  });
  if (!opp) throw new SeatNotFoundError(`Opportunity ${opportunityId} not found in this workspace.`);

  const seat = await tx.consortiumSeat.findFirst({
    where: { id: seatId, opportunityId, tenantId },
    select: { id: true, roleKey: true },
  });
  if (!seat) throw new SeatNotFoundError(`Seat ${seatId} not found in this workspace.`);

  // `Opportunity` has no `topic` relation and no `callId` column, so the topic is
  // resolved here rather than included. `Opportunity.topicId` is written by the pipeline
  // form as the topic's IDENTIFIER (the board shows it as "Topic Identifier"), while older
  // rows may hold a Topic cuid; resolving by either keeps "Aday Bul" from finding no
  // topic, and so no candidates, for a form-created opportunity (NG-100).
  const topic = await findOpportunityTopic(tx, opp.topicId);

  const prefix = topicPrefix(topic?.identifier);

  const confirmedOrgIds = (opp.seats as SeatRow[])
    .filter((s) => s.status === 'CONFIRMED' && s.organizationId)
    .map((s) => s.organizationId as string);

  // ── Topic experience: CORDIS projects under this call prefix, then who was on them.
  // An empty prefix would match every project ever imported, which is not
  // "experience on this topic" — an opportunity with no topic gets no candidates.
  const topicProjects = prefix
    ? await tx.cordisProjectTopic.findMany({
        where: { topicCode: { startsWith: prefix } },
        select: { projectId: true },
        take: TOPIC_PROJECT_LIMIT,
      })
    : [];
  const projectIds = [...new Set(topicProjects.map((r: { projectId: string }) => r.projectId))];

  const participations: { organisationId: string; role: string }[] = projectIds.length
    ? await tx.cordisParticipation.findMany({
        where: { projectId: { in: projectIds } },
        select: { organisationId: true, role: true },
        take: PARTICIPATION_LIMIT,
      })
    : [];

  const experience = new Map<string, { participationCount: number; coordinatorCount: number }>();
  for (const p of participations) {
    const entry = experience.get(p.organisationId) ?? { participationCount: 0, coordinatorCount: 0 };
    entry.participationCount += 1;
    if (p.role === 'coordinator') entry.coordinatorCount += 1;
    experience.set(p.organisationId, entry);
  }

  const confirmed = new Set(confirmedOrgIds);
  const ranked = [...experience.entries()]
    // Already on the consortium — not a candidate for another seat.
    .filter(([orgId]) => !confirmed.has(orgId))
    // A coordinator seat needs someone who has coordinated before.
    .filter(([, e]) => seat.roleKey !== 'coordinator' || e.coordinatorCount >= 1)
    .sort((a, b) => b[1].participationCount - a[1].participationCount);

  const takenCountries = await confirmedSeatCountries(tx, opp.seats as SeatRow[], tenantId);

  // NG-52: the minimum-partner pre-filter (specification §6 l.103), threshold from the
  // call. A candidate that cannot get the consortium to the call's country minimum is
  // dropped before scoring; with no threshold on the call nothing is dropped. It runs
  // BEFORE the pool is cut to CANDIDATE_POOL (CRW NG-186 bulgu 4): cut first, and the
  // dropped ones were never replaced by the eligible organisations ranked below them.
  const minimumPartners = minimumPartnerState(
    readMinimumPartnerRule(topic?.eligibility),
    (opp.seats as SeatRow[]).map((s) => s.status),
    takenCountries
  );
  const countryOf = new Map<string, string | null>();
  let eligible = ranked;
  if (minimumPartners.requiresNewCountry && ranked.length) {
    const rankedOrgs: { organisationId: string; country: string | null }[] = await tx.cordisOrganization.findMany({
      where: { organisationId: { in: ranked.map(([orgId]) => orgId) } },
      select: { organisationId: true, country: true },
    });
    for (const o of rankedOrgs) countryOf.set(o.organisationId, o.country);
    eligible = ranked.filter(([orgId]) => passesMinimumPartnerFilter(countryOf.get(orgId) ?? null, minimumPartners));
  }
  const pool = eligible.slice(0, CANDIDATE_POOL);
  const poolIds = pool.map(([orgId]) => orgId);
  const poolSet = new Set(poolIds);

  // ── Countries, for geographic balance (already read when the filter ran).
  if (countryOf.size === 0 && poolIds.length) {
    const poolOrgs: { organisationId: string; country: string | null }[] = await tx.cordisOrganization.findMany({
      where: { organisationId: { in: poolIds } },
      select: { organisationId: true, country: true },
    });
    for (const o of poolOrgs) countryOf.set(o.organisationId, o.country);
  }

  // ── Co-participation edges with the confirmed partners, for collaboration
  // history. The importer stores each edge once under `orgA < orgB`
  // (src/lib/k2-cordis/partnerProfileJob.ts), so both sides have to be examined.
  const edges: { orgA: string; orgB: string; sharedProjectCount: number }[] = poolIds.length && confirmedOrgIds.length
    ? await tx.cordisCoParticipation.findMany({
        where: {
          OR: [
            { orgA: { in: poolIds }, orgB: { in: confirmedOrgIds } },
            { orgB: { in: poolIds }, orgA: { in: confirmedOrgIds } },
          ],
        },
        select: { orgA: true, orgB: true, sharedProjectCount: true },
        take: EDGE_LIMIT,
      })
    : [];

  const sharedProjectsOf = new Map<string, number>();
  for (const edge of edges) {
    for (const [side, other] of [
      [edge.orgA, edge.orgB],
      [edge.orgB, edge.orgA],
    ] as const) {
      if (poolSet.has(side) && confirmed.has(other)) {
        sharedProjectsOf.set(side, (sharedProjectsOf.get(side) ?? 0) + edge.sharedProjectCount);
      }
    }
  }

  // ── Rival risk: seated on another live opportunity under the same call. The
  // call is reached through `Opportunity.topicId`, since the row has no callId.
  const rivals = new Set<string>();
  if (topic?.callId && poolIds.length) {
    const siblingTopics: { id: string }[] = await tx.topic.findMany({
      where: { callId: topic.callId },
      select: { id: true },
    });
    const siblingTopicIds = siblingTopics.map((t) => t.id);

    const rivalSeats: { organizationId: string | null }[] = await tx.consortiumSeat.findMany({
      where: {
        tenantId,
        organizationId: { in: poolIds },
        status: { in: ['CONFIRMED', 'CANDIDATE'] },
        opportunity: { topicId: { in: siblingTopicIds }, id: { not: opportunityId }, status: 'ACTIVE' },
      },
      select: { organizationId: true },
    });
    for (const s of rivalSeats) if (s.organizationId) rivals.add(s.organizationId);
  }

  const scored: MatchCandidate[] = pool.map(([organizationId, exp]) => {
    const breakdown = scoreCandidate({
      participationCount: exp.participationCount,
      coordinatorCount: exp.coordinatorCount,
      country: countryOf.get(organizationId) ?? null,
      takenCountries,
      sharedProjects: sharedProjectsOf.get(organizationId) ?? 0,
      isRival: rivals.has(organizationId),
    });
    return { organizationId, score: matchSeatScore(breakdown), breakdown };
  });

  // Ranked on the raw total: the 0–100 clamp ties candidates whose rival penalty
  // takes them below 0, and their order should not depend on the clamp.
  const sorted = scored
    .sort((a, b) => totalScore(b.breakdown) - totalScore(a.breakdown))
    .slice(0, limit);

  // NG-100 B-3: an empty result (no topic, or an empty pool) writes nothing and clears
  // nothing: the rows already on the seat (a G1 backup, an invited candidate) stay.
  if (sorted.length === 0) return [];

  // The caller already holds a transaction (`withTenant`), so the clear and the
  // rewrite are atomic without opening a second one.
  await tx.seatCandidate.deleteMany({ where: { tenantId, seatId } });

  const created = [];
  for (const [index, candidate] of sorted.entries()) {
    created.push(
      await tx.seatCandidate.create({
        data: {
          tenantId,
          seatId,
          organizationId: candidate.organizationId,
          score: candidate.score,
          breakdown: candidate.breakdown,
          rank: index + 1,
        },
      })
    );
  }
  return created;
}

export async function generateSeatCandidates(
  opportunityId: string,
  seatId: string,
  tenantId: string,
  limit = 5
) {
  return withTenant(tenantId, (tx) =>
    runSeatMatch(tx, { opportunityId, seatId, tenantId, limit })
  );
}
