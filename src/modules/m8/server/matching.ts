import { withTenant, type TenantTx } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { SeatNotFoundError } from './errors';

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
 *   degree         → CordisCoParticipation   the number of edges the org sits on.
 *
 * The CORDIS tables are platform-shared reference data (scripts/rls-models.ts
 * lists them as SYSTEM_WIDE), so no new table, migration or RLS policy is
 * needed. Everything still runs inside `withTenant`, so the tenant-scoped reads
 * and the writes below are covered by the `tenant_isolation` policy.
 */

/**
 * Why a candidate scored what it did: one entry per scoring dimension, summing
 * to `MatchCandidate.score`. Persisted to `SeatCandidate.breakdown` (Json), so
 * the UI can show the reasoning rather than a bare number.
 */
/** Written verbatim into `SeatCandidate.breakdown`, a JSON column — a type alias, not an interface, so it stays assignable to a JSON value. */
export type MatchBreakdown = {
  topicExperience: number;
  geographicBalance: number;
  collabHistory: number;
  relationshipWarmth: number;
  centrality: number;
  rivalRisk: number;
}

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
  /** `Relationship.warmth` for this org in the current tenant, if any. */
  warmth: string | null;
  /** Co-participation edges the org sits on — its degree in the partner graph. */
  degree: number;
  /** The org is seated on another live opportunity under the same call. */
  isRival: boolean;
}

/**
 * The scoring rule, as a pure function so it can be tested without a database.
 * Weights are unchanged from the original implementation.
 */
export function scoreCandidate(signals: CandidateSignals): MatchBreakdown {
  const warmthScore =
    signals.warmth === 'active' || signals.warmth === 'hot'
      ? 15
      : signals.warmth === 'warm'
        ? 10
        : signals.warmth === 'cold'
          ? 5
          : 0;

  return {
    // 1. Topic experience (35 max)
    topicExperience: Math.min(35, signals.participationCount * 5 + signals.coordinatorCount * 10),
    // 2. Geographic balance (15 max) — a country already on the consortium adds none.
    geographicBalance: signals.country && signals.takenCountries.has(signals.country) ? 0 : 15,
    // 3. Collaboration history with the confirmed partners (15 max)
    collabHistory: Math.min(15, signals.sharedProjects * 5),
    // 4. Relationship warmth (15 max)
    relationshipWarmth: warmthScore,
    // 5. Centrality in the co-participation graph (10 max)
    centrality: Math.min(10, signals.degree / 10),
    // 6. Rival risk (-10)
    rivalRisk: signals.isRival ? -10 : 0,
  };
}

export function totalScore(breakdown: MatchBreakdown): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
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
      seats: { select: { status: true, organizationId: true } },
    },
  });
  if (!opp) throw new SeatNotFoundError(`Opportunity ${opportunityId} not found in this workspace.`);

  const seat = await tx.consortiumSeat.findFirst({
    where: { id: seatId, opportunityId, tenantId },
    select: { id: true, roleKey: true },
  });
  if (!seat) throw new SeatNotFoundError(`Seat ${seatId} not found in this workspace.`);

  // `Opportunity` has no `topic` relation and no `callId` column, so the topic is
  // resolved by its id rather than included.
  const topic = opp.topicId
    ? await tx.topic.findUnique({
        where: { id: opp.topicId },
        select: { identifier: true, callId: true },
      })
    : null;

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
  const pool = [...experience.entries()]
    // Already on the consortium — not a candidate for another seat.
    .filter(([orgId]) => !confirmed.has(orgId))
    // A coordinator seat needs someone who has coordinated before.
    .filter(([, e]) => seat.roleKey !== 'coordinator' || e.coordinatorCount >= 1)
    .sort((a, b) => b[1].participationCount - a[1].participationCount)
    .slice(0, CANDIDATE_POOL);
  const poolIds = pool.map(([orgId]) => orgId);
  const poolSet = new Set(poolIds);

  // ── Countries, for geographic balance.
  const poolOrgs: { organisationId: string; country: string | null }[] = poolIds.length
    ? await tx.cordisOrganization.findMany({
        where: { organisationId: { in: poolIds } },
        select: { organisationId: true, country: true },
      })
    : [];
  const countryOf = new Map(poolOrgs.map((o) => [o.organisationId, o.country]));

  const confirmedOrgs: { country: string | null }[] = confirmedOrgIds.length
    ? await tx.cordisOrganization.findMany({
        where: { organisationId: { in: confirmedOrgIds } },
        select: { country: true },
      })
    : [];
  const takenCountries = new Set(
    confirmedOrgs.map((o) => o.country).filter((c): c is string => Boolean(c))
  );

  // ── Co-participation edges, in one query, for both collaboration history and
  // degree. The importer stores each edge once under `orgA < orgB`
  // (src/lib/k2-cordis/partnerProfileJob.ts), so both sides have to be examined.
  const edges: { orgA: string; orgB: string; sharedProjectCount: number }[] = poolIds.length
    ? await tx.cordisCoParticipation.findMany({
        where: { OR: [{ orgA: { in: poolIds } }, { orgB: { in: poolIds } }] },
        select: { orgA: true, orgB: true, sharedProjectCount: true },
        take: EDGE_LIMIT,
      })
    : [];

  const degreeOf = new Map<string, number>();
  const sharedProjectsOf = new Map<string, number>();
  for (const edge of edges) {
    for (const [side, other] of [
      [edge.orgA, edge.orgB],
      [edge.orgB, edge.orgA],
    ] as const) {
      if (!poolSet.has(side)) continue;
      degreeOf.set(side, (degreeOf.get(side) ?? 0) + 1);
      if (confirmed.has(other)) {
        sharedProjectsOf.set(side, (sharedProjectsOf.get(side) ?? 0) + edge.sharedProjectCount);
      }
    }
  }

  // ── Relationship warmth, from this tenant's own CRM.
  const relationships: { organizationId: string | null; warmth: string }[] =
    await tx.relationship.findMany({
      where: { tenantId },
      select: { organizationId: true, warmth: true },
    });
  const warmthOf = new Map(
    relationships
      .filter((r) => r.organizationId)
      .map((r) => [r.organizationId as string, r.warmth])
  );

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
      warmth: warmthOf.get(organizationId) ?? null,
      degree: degreeOf.get(organizationId) ?? 0,
      isRival: rivals.has(organizationId),
    });
    return { organizationId, score: totalScore(breakdown), breakdown };
  });

  const sorted = scored.sort((a, b) => b.score - a.score).slice(0, limit);

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
