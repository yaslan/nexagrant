/**
 * G0 scoring, wired to the database — the call site the canonical scorer never had.
 *
 * `g0-canonical.ts` (the maths) and `g0-features.ts` (the evidence → features mapping) are both
 * pure. This module is the only place that reads Prisma and the only place that writes a G0 score,
 * so there is exactly one answer to "where did this number come from".
 *
 * What it guarantees:
 *   • the score is derived, never invented — if the snapshot carries no evidence at all
 *     (`coverage === 0`) the score is `null`; no 0 is ever written, because a stored 0 would be
 *     just as fabricated as the `Math.random()` it replaces. The gate path leaves an earlier value
 *     alone, the rescore path replaces it with null (`clearStoredG0`, FO-384);
 *   • every stored score comes with its breakdown: `TopicMatch.breakdown` keeps the per-feature
 *     contributions and the source trail, which is the record CLAUDE.md §7 requires behind any
 *     figure shown to a user;
 *   • every read is tenant-scoped (CLAUDE.md §1).
 *
 * The score is an *internal pre-assessment* ("iç ön değerlendirme"), never an official evaluation;
 * the labelling of that on screen is the UI's job, this module only produces the number and the
 * evidence for it.
 */

import type { JsonObject } from '@/types/json';
import type { TenantTx } from '../db';
import { withTenant } from '../db';
import { isPresentId } from '../required-id';
import { decideG0, weightsTotal, type G0Decision, type G0Features, type G0Result } from './g0-canonical';
import { DEFAULT_SCORING_WEIGHTS } from './defaults';
import type { GateReason } from '../gates/reasons';
import {
  extractG0Features,
  topicPrefixOf,
  type G0CordisSnapshot,
  type G0SeatSnapshot,
  type G0Snapshot,
  type G0Source,
  type G0TenantSnapshot,
  type G0TopicSnapshot,
} from './g0-features';

/** Bumped whenever the feature mapping changes, so a stored breakdown says which rules produced it. */
export const G0_SCORING_VERSION = '2.3';

export interface G0Computation {
  tenantId: string;
  opportunityId: string | null;
  topicId: string | null;
  /** `null` when no evidence was available — deliberately not 0. */
  score: number | null;
  decision: G0Decision | null;
  features: G0Features;
  contributions: Record<keyof G0Features, number> | null;
  reasons: string[];
  reasonDetails: GateReason[];
  sources: G0Source[];
  coverage: number;
  scoringVersion: string;
  /** Which denominator produced `score` — see `G0Extraction.scoringBasis`. */
  scoringBasis: 'standard' | 'no_history_evidence';
  /** Features left out of the denominator (empty on the standard path). */
  excludedFeatures: (keyof G0Features)[];
  /** Sum of the weights actually scored; `score` is normalised by this. */
  denominator: number;
  /** Seats whose status is a filled one (FILLED_SEAT_STATUSES); only the status is read, not the organisation column. The no-history rule needs at least one. */
  filledSeats: number;
}

/**
 * The weights the composite is computed with: the tenant's (or default) weights with the excluded
 * features set to 0. `scoreG0` and `g0Contributions` already normalise by the weight total, so the
 * formula itself is unchanged — only the denominator moves.
 */
export function effectiveWeights(
  weights: typeof DEFAULT_SCORING_WEIGHTS,
  excluded: readonly (keyof G0Features)[],
): typeof DEFAULT_SCORING_WEIGHTS {
  if (excluded.length === 0) return weights;
  const out = { ...weights };
  for (const key of excluded) out[key] = 0;
  return out;
}

/** What the score is computed *about* — an existing opportunity or one about to be created. */
export interface G0Subject {
  opportunityId: string | null;
  topicId: string | null;
  intendedRole: string | null;
  seats: G0SeatSnapshot[];
}

// ───────────────────────── snapshot loading ─────────────────────────

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Tenant weights come from `Tenant.settings.scoringWeights` and are operator-editable, so they are
 * validated key by key: one bad entry falls back to the default for that key rather than throwing
 * away the whole tenant configuration or, worse, producing NaN.
 */
export function resolveWeights(settings: unknown): typeof DEFAULT_SCORING_WEIGHTS {
  const raw =
    settings && typeof settings === 'object' && 'scoringWeights' in (settings as Record<string, unknown>)
      ? (settings as Record<string, unknown>).scoringWeights
      : null;
  if (!raw || typeof raw !== 'object') return DEFAULT_SCORING_WEIGHTS;
  const source = raw as Record<string, unknown>;
  const out = { ...DEFAULT_SCORING_WEIGHTS };
  for (const key of Object.keys(DEFAULT_SCORING_WEIGHTS) as (keyof typeof DEFAULT_SCORING_WEIGHTS)[]) {
    const n = Number(source[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

/** FO-396. A stored value outside the three known answers reads as never checked (no grant). */
function toRegistryStatus(value: string | null): G0TenantSnapshot['picRegistryStatus'] {
  return value === 'FOUND' || value === 'NOT_FOUND' || value === 'UNKNOWN' ? value : null;
}

/** Success rate for the topic, preferring a row measured for the tenant's own country. */
function pickBaseRatePct(
  stats: { country: string | null; successRate: number | null; topicId: string | null }[],
  tenantCountry: string | null,
  topicId: string | null,
): number | null {
  const usable = stats.filter((s) => s.successRate !== null && Number.isFinite(Number(s.successRate)));
  if (usable.length === 0) return null;
  const country = (tenantCountry ?? '').toUpperCase();
  const order = [
    (s: (typeof usable)[number]) => s.topicId === topicId && (s.country ?? '').toUpperCase() === country && country !== '',
    (s: (typeof usable)[number]) => s.topicId === topicId && s.country === null,
    (s: (typeof usable)[number]) => (s.country ?? '').toUpperCase() === country && country !== '',
    (s: (typeof usable)[number]) => s.country === null,
  ];
  for (const matches of order) {
    const hit = usable.find(matches);
    if (hit) return Number(hit.successRate);
  }
  return Number(usable[0]?.successRate ?? 0);
}

async function loadCordisSnapshot(
  client: TenantTx,
  pic: string | null,
  topicIdentifier: string | null,
): Promise<G0CordisSnapshot | null> {
  // "No record" = a PIC was entered and no CORDIS row exists for it (FO-382, patron 05.11: "PIC
  // boşsa kolaylık yok"). It is only a fact about the organisation when CORDIS itself is loaded. An
  // empty table (not imported yet) is missing data, not a history of zero, so it stays null and the
  // scorer keeps the standard basis. No PIC also gives `null`, and so does an empty table: in both
  // cases the scorer keeps the standard basis (FO-382 review B4: `null` does not mean "no PIC" only).
  // The partner-only rule is applied in the scorer (`isNoHistoryPartner`), not here.
  const noRecord = async (): Promise<G0CordisSnapshot | null> => {
    const anyRow: { projectId: string } | null = await client.cordisParticipation.findFirst({
      select: { projectId: true },
    });
    if (!anyRow) return null;
    return {
      coordinationsInTopicFamily: 0,
      coordinationsOverall: 0,
      distinctCollaborators: 0,
      participationsOverall: 0,
    };
  };

  if (!pic) return null;

  const participations: { role: string; projectId: string; project: { masterCall: string | null } | null }[] =
    await client.cordisParticipation.findMany({
      where: { organisationId: pic },
      select: { role: true, projectId: true, project: { select: { masterCall: true } } },
      take: 500,
    });
  if (participations.length === 0) return noRecord();

  const family = topicIdentifier ? topicPrefixOf(topicIdentifier) : null;
  const coordinations = participations.filter((p) => p.role.trim().toLowerCase() === 'coordinator');
  const coordinationsInTopicFamily = family
    ? coordinations.filter((p) => (p.project?.masterCall ?? '').startsWith(family)).length
    : 0;

  const projectIds = participations.map((p) => p.projectId).slice(0, 200);
  const collaborators: { organisationId: string }[] = await client.cordisParticipation.findMany({
    where: { projectId: { in: projectIds }, organisationId: { not: pic } },
    select: { organisationId: true },
    distinct: ['organisationId'],
    take: 500,
  });

  return {
    coordinationsInTopicFamily,
    coordinationsOverall: coordinations.length,
    distinctCollaborators: collaborators.length,
    participationsOverall: participations.length,
  };
}

/**
 * Reads every row the score depends on, tenant-scoped.
 *
 * Absent rows are not an error: they become `null` in the snapshot and the extraction reports them
 * as `missing` sources. A tenant that has not imported CORDIS still gets a score, it is simply a
 * score that says so.
 */
export async function loadG0Snapshot(
  client: TenantTx,
  tenantId: string,
  subject: G0Subject,
): Promise<G0Snapshot> {
  const tenant: {
    country: string | null;
    pic: string | null;
    picRegistryStatus: string | null;
    settings: unknown;
  } | null = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { country: true, pic: true, picRegistryStatus: true, settings: true },
  });

  const profile: { keywords: unknown } | null = await client.tenantProfile.findUnique({
    where: { tenantId },
    select: { keywords: true },
  });

  let topic: G0TopicSnapshot | null = null;
  let topicFitScore: number | null = null;
  let baseRatePct: number | null = null;
  let resolvedTopicId: string | null = null;

  if (subject.topicId) {
    // `Opportunity.topicId` is a `Topic.id` when the row was seeded and a portal identifier
    // ("HORIZON-CL5-2026-D4-01") when it came from the pipeline form, which accepts the code a user
    // copies out of the portal. Resolving both keeps the score from silently losing its topic.
    const topicSelect = {
      id: true,
      identifier: true,
      keywords: true,
      isLumpSum: true,
      isTwoStage: true,
      budgetPerProjectCents: true,
      eligibility: true,
    };
    const row =
      (await client.topic.findUnique({ where: { id: subject.topicId }, select: topicSelect })) ??
      (await client.topic.findUnique({ where: { identifier: subject.topicId }, select: topicSelect }));
    if (row) {
      resolvedTopicId = String(row.id);
      topic = {
        id: resolvedTopicId,
        identifier: String(row.identifier),
        keywords: toStringArray(row.keywords),
        isLumpSum: row.isLumpSum === true,
        isTwoStage: row.isTwoStage === true,
        budgetPerProjectCents: toNumberOrNull(row.budgetPerProjectCents),
        eligibility:
          row.eligibility && typeof row.eligibility === 'object'
            ? (row.eligibility as G0TopicSnapshot['eligibility'])
            : null,
      };

      // The K1 match is the row with **no** opportunity on it: `fitScore` is a property of the
      // tenant × topic pair, while `g0Score` belongs to one opportunity (see the model comment in
      // prisma/schema.prisma). Prisma cannot put `null` in a compound-unique `where`, so this is a
      // findFirst — the database still allows only one such row (`NULLS NOT DISTINCT`).
      const match: { fitScore: number | null; breakdown: unknown } | null =
        await client.topicMatch.findFirst({
          where: { tenantId, topicId: resolvedTopicId, opportunityId: null },
          select: { fitScore: true, breakdown: true },
        });
      // A row this scorer created carries a placeholder fit score, not a K1 match — reading it back
      // as alignment would turn "we never matched this topic" into "we matched it and scored 0".
      topicFitScore = match && !isPlaceholderFitScore(match.breakdown) ? toNumberOrNull(match.fitScore) : null;

      const prefix = topicPrefixOf(topic.identifier);
      const stats: { country: string | null; successRate: number | null; topicId: string | null }[] =
        await client.topicStat.findMany({
          where: { OR: [{ topicId: resolvedTopicId }, { topicPrefix: prefix }] },
          select: { country: true, successRate: true, topicId: true },
          take: 100,
        });
      baseRatePct = pickBaseRatePct(stats, tenant?.country ?? null, resolvedTopicId);
    }
  }

  const cordis = await loadCordisSnapshot(client, tenant?.pic ?? null, topic?.identifier ?? null);

  return {
    tenant: {
      country: tenant?.country ?? null,
      pic: tenant?.pic ?? null,
      picRegistryStatus: toRegistryStatus(tenant?.picRegistryStatus ?? null),
    },
    profile: profile ? { keywords: toStringArray(profile.keywords) } : null,
    topic,
    topicFitScore,
    baseRatePct,
    intendedRole: subject.intendedRole,
    seats: subject.seats,
    cordis,
  };
}

// ───────────────────────── computation ─────────────────────────

/**
 * Pure half of the pipeline, exported so a caller that already has a snapshot (a test, a batch job)
 * can score without touching the database.
 */
export function computeG0FromSnapshot(
  tenantId: string,
  subject: Pick<G0Subject, 'opportunityId' | 'topicId'>,
  snapshot: G0Snapshot,
  weights: typeof DEFAULT_SCORING_WEIGHTS = DEFAULT_SCORING_WEIGHTS,
): G0Computation {
  const { features, facts, sources, coverage, excludedFeatures, scoringBasis, filledSeats } = extractG0Features(snapshot);
  const scoredWeights = effectiveWeights(weights, excludedFeatures);
  const denominator = weightsTotal(scoredWeights);

  // No evidence at all → no score. Storing a 0 here would be a fabricated figure wearing a
  // different mask, and `gates/evaluate.ts` already has an honest branch for "not scored yet".
  if (coverage === 0) {
    return {
      tenantId,
      opportunityId: subject.opportunityId,
      topicId: subject.topicId,
      score: null,
      decision: null,
      features,
      contributions: null,
      reasons: ['no scoring evidence available for this opportunity'],
      reasonDetails: [{ code: 'G0_NO_EVIDENCE' }],
      sources,
      coverage,
      scoringVersion: G0_SCORING_VERSION,
      scoringBasis,
      excludedFeatures,
      denominator,
      filledSeats,
    };
  }

  const result: G0Result = decideG0(features, facts, undefined, scoredWeights);
  return {
    tenantId,
    opportunityId: subject.opportunityId,
    topicId: subject.topicId,
    score: result.score,
    decision: result.decision,
    features,
    contributions: result.contributions,
    reasons: result.reasons,
    reasonDetails: result.reasonDetails,
    sources,
    coverage,
    scoringVersion: G0_SCORING_VERSION,
    scoringBasis,
    excludedFeatures,
    denominator,
    filledSeats,
  };
}

/** Load + score, without writing anything. */
export async function computeG0(
  client: TenantTx,
  tenantId: string,
  subject: G0Subject,
): Promise<G0Computation> {
  const tenant: { settings: unknown } | null = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const snapshot = await loadG0Snapshot(client, tenantId, subject);
  // The evidence row is filed under the resolved `Topic.id`, never under whatever string the
  // caller happened to hold — a portal identifier would break the TopicMatch foreign key.
  return computeG0FromSnapshot(
    tenantId,
    { opportunityId: subject.opportunityId, topicId: snapshot.topic?.id ?? null },
    snapshot,
    resolveWeights(tenant?.settings),
  );
}

/** Load + score an opportunity that already exists. `null` when it is not this tenant's. */
export async function computeG0ForOpportunity(
  client: TenantTx,
  tenantId: string,
  opportunityId: string,
  options: { scope?: G0RescopeFilter } = {},
): Promise<G0Computation | null> {
  const opp: { id: string; topicId: string | null; intendedRole: string | null } | null =
    await client.opportunity.findFirst({
      // Archived opportunities are not scored: `deletedAt` means the row is out of the product,
      // and a score computed for it would still be read by anything that re-renders the id.
      where: { id: opportunityId, tenantId, deletedAt: null, ...(options.scope ?? {}) },
      select: { id: true, topicId: true, intendedRole: true },
    });
  if (!opp) return null;

  const seats: G0SeatSnapshot[] = await client.consortiumSeat.findMany({
    where: { opportunityId, tenantId },
    select: { roleKey: true, status: true },
    take: 200,
  });

  return computeG0(client, tenantId, {
    opportunityId: opp.id,
    topicId: opp.topicId,
    intendedRole: opp.intendedRole,
    seats,
  });
}

// ───────────────────────── persistence (the evidence record) ─────────────────────────

/**
 * Marks a `TopicMatch` row this module created rather than K1.
 *
 * `TopicMatch.fitScore` is non-nullable and means "the K1 cosine match", so a row created here to
 * hold the breakdown has to put *something* in it. Writing the alignment we used — which, on a
 * create, is by definition not a K1 match — and then reading it back on the next run would launder
 * an absent signal into a measured one and quietly inflate the evidence coverage. The flag lets
 * `loadG0Snapshot` tell the two apart.
 */
export const G0_FIT_SCORE_PLACEHOLDER = 'g0ScorerPlaceholderFitScore';

/**
 * Did the alignment feature come from a real K1 match on this topic?
 *
 * Read off the computation's own source trail rather than re-querying: if the answer is no, then
 * whatever `TopicMatch.fitScore` is on file is not a K1 match either, and the row must stay
 * flagged — including when it already exists, or the next write silently promotes a placeholder
 * back into evidence.
 */
function alignmentCameFromTopicMatch(computation: G0Computation): boolean {
  return computation.sources.some(
    (s) => s.feature === 'alignment' && s.status === 'measured' && s.source === 'TopicMatch.fitScore',
  );
}

function isPlaceholderFitScore(breakdown: unknown): boolean {
  return (
    !!breakdown &&
    typeof breakdown === 'object' &&
    (breakdown as Record<string, unknown>)[G0_FIT_SCORE_PLACEHOLDER] === true
  );
}

/** The JSON stored in `TopicMatch.breakdown` and echoed into `GateDecision.inputs`. */
export function g0EvidencePayload(computation: G0Computation): JsonObject {
  return {
    scoringVersion: computation.scoringVersion,
    score: computation.score,
    decision: computation.decision,
    coverage: computation.coverage,
    scoringBasis: computation.scoringBasis,
    excludedFeatures: computation.excludedFeatures,
    denominator: computation.denominator,
    filledSeats: computation.filledSeats,
    noHistoryWithoutFilledSeat: computation.reasonDetails.some((r) => r.code === 'G0_NO_HISTORY_NO_FILLED_SEAT'),
    features: computation.features,
    contributions: computation.contributions,
    reasons: computation.reasons,
    sources: computation.sources,
    assessment: 'internal-pre-assessment',
  };
}

/** Options for the stores below. The default is the gate path; a rescore passes `keepUpdatedAt`. */
export interface G0StoreOptions {
  /**
   * A PIC change re-derives scores but does not edit the opportunity, so the board's "recently
   * touched" order must not move (FO-384 B1). With this set, the opportunity keeps its `updatedAt`
   * and a score that is already stored is not written at all.
   */
  keepUpdatedAt?: boolean;
  /**
   * A rescore writes only an opportunity that is still in {@link G0_RESCORE_SCOPE}. One that left it
   * between the read and the write is not written, its TopicMatch included, and
   * {@link G0LeftScopeError} is thrown (K-577267).
   */
  rescope?: boolean;
}

/**
 * Which opportunities a PIC rescore may write (K-577267, option A): still in stage G0, `status`
 * ACTIVE and not soft-deleted. The other statuses (WITHDRAWN, SUBMITTED, FUNDED, REJECTED,
 * ABOVE_THRESHOLD) and the later stages (G1 to G4) keep their stored score and `updatedAt`. The
 * listing, the paged continuation, the queued job and the write all use this one filter.
 */
export const G0_RESCORE_SCOPE = { stage: 'G0', status: 'ACTIVE', deletedAt: null } as const;
export type G0RescopeFilter = typeof G0_RESCORE_SCOPE;

/**
 * Longest wait for a row lock during a rescore that a PIC change started (FO-384 Y2). A blocked
 * write otherwise holds the request for as long as the other transaction holds the row, past the
 * time budget. Set per transaction, so no other caller of the scorer waits any differently.
 */
export const G0_RESCORE_LOCK_TIMEOUT_MS = 2_000;

/** Ends a wait for a row lock after `ms`, inside this transaction only (`set_config(..., true)`). */
export async function limitLockWait(client: TenantTx, ms: number): Promise<void> {
  await client.$executeRaw`SELECT set_config('lock_timeout', ${String(ms)}, true)`;
}

/** The opportunity changed between this rescore's read and its write; the edit is kept (FO-384 O3). */
export class G0ConcurrentEditError extends Error {
  constructor() {
    super('G0 rescore: the opportunity changed during the rescore');
    this.name = 'G0ConcurrentEditError';
  }
}

/**
 * The opportunity left {@link G0_RESCORE_SCOPE} (archived, moved past G0, not ACTIVE) between the
 * rescore's read and its write. Not a failure: nothing was written for it (K-577267).
 */
export class G0LeftScopeError extends Error {
  constructor() {
    super('G0 rescore: the opportunity is no longer a G0 active opportunity');
    this.name = 'G0LeftScopeError';
  }
}

/** Writes `g0Score` on the opportunity; with `keepUpdatedAt` an unchanged value is not written. */
async function writeOpportunityScore(
  client: TenantTx,
  ids: { opportunityId: string; tenantId: string },
  value: number | null,
  options: G0StoreOptions,
): Promise<void> {
  if (!isPresentId(ids.opportunityId) || !isPresentId(ids.tenantId)) return;
  const where = { id: ids.opportunityId, tenantId: ids.tenantId };
  if (!options.keepUpdatedAt) {
    await client.opportunity.updateMany({ where, data: { g0Score: value } });
    return;
  }
  const scope = options.rescope ? G0_RESCORE_SCOPE : {};
  const current = await client.opportunity.findFirst({
    where: { ...where, ...scope },
    select: { g0Score: true, updatedAt: true },
  });
  if (!current) {
    if (options.rescope) throw new G0LeftScopeError();
    return;
  }
  if (current.g0Score === value) return;
  // Guarded on the `updatedAt` just read. An edit that landed after the read matches nothing, so it
  // is not overwritten with the stale `title`/`updatedAt` (O3): the rescore fails and is alerted instead.
  const written = await client.opportunity.updateMany({
    where: { ...where, ...scope, updatedAt: current.updatedAt },
    // An explicit `updatedAt` overrides Prisma's `@updatedAt`, so the last human edit stays the last.
    data: { g0Score: value, updatedAt: current.updatedAt },
  });
  if (written.count === 0) {
    // A stage change also moves `updatedAt`, so it looks like an edit here. Ask the scope first:
    // a row that left G0 is not a concurrent edit and must not raise an error alert (K-577267).
    if (options.rescope && !(await client.opportunity.findFirst({ where: { ...where, ...G0_RESCORE_SCOPE }, select: { id: true } }))) {
      throw new G0LeftScopeError();
    }
    throw new G0ConcurrentEditError();
  }
}

/**
 * Writes the score onto the opportunity and its provenance onto `TopicMatch`.
 *
 * `TopicMatch.g0Score` ("weighted total") and `TopicMatch.breakdown` ("per-criterion") are exactly
 * what the schema reserves for this, so the breakdown a user sees and the number the gate reads
 * come out of the same write. The row is keyed by `opportunityId`, which is what makes it *this*
 * opportunity's record rather than the topic's. A computation with no score writes nothing.
 *
 * The TopicMatch evidence is refreshed on every call; only the opportunity's own score and
 * `updatedAt` follow {@link G0StoreOptions}.
 */
export async function persistG0(
  client: TenantTx,
  computation: G0Computation,
  options: G0StoreOptions = {},
): Promise<boolean> {
  if (computation.score === null || !isPresentId(computation.opportunityId) || !isPresentId(computation.tenantId)) return false;

  await writeOpportunityScore(client, { opportunityId: computation.opportunityId, tenantId: computation.tenantId }, computation.score, options);

  if (computation.topicId) {
    const evidence = g0EvidencePayload(computation);
    const breakdown = alignmentCameFromTopicMatch(computation)
      ? evidence
      : { ...evidence, [G0_FIT_SCORE_PLACEHOLDER]: true };
    // Keyed by the opportunity, not by the topic. `Opportunity.topicId` is not unique and the
    // score is opportunity-specific (`intendedRole`, `ConsortiumSeat`), so a topic-keyed row made
    // the second opportunity on a topic overwrite the first — and the board, which reads this
    // record, then drew one opportunity's score on the other one's card (TASK-MTQ63RR8Z0G8E).
    await client.topicMatch.upsert({
      where: {
        tenantId_topicId_opportunityId: {
          tenantId: computation.tenantId,
          topicId: computation.topicId,
          opportunityId: computation.opportunityId,
        },
      },
      // `fitScore` on an evidence row is never a K1 match — the K1 match lives on the row with no
      // opportunity — so it stays 0 and the breakdown carries the placeholder flag.
      update: { g0Score: computation.score, breakdown },
      create: {
        tenantId: computation.tenantId,
        topicId: computation.topicId,
        opportunityId: computation.opportunityId,
        fitScore: 0,
        g0Score: computation.score,
        breakdown,
      },
    });
  }

  return true;
}

/**
 * Replaces a stored score with "no score" when the scorer can no longer compute one (FO-384).
 *
 * `persistG0` writes nothing for a null score, so without this a PIC change that removes the last
 * evidence would leave the previous number on the opportunity and on its TopicMatch. The breakdown
 * keeps the evidence record (`coverage: 0`) and the placeholder flag, so the row says why it is empty.
 */
export async function clearStoredG0(
  client: TenantTx,
  computation: G0Computation,
  options: G0StoreOptions = {},
): Promise<boolean> {
  if (computation.score !== null || !isPresentId(computation.opportunityId) || !isPresentId(computation.tenantId)) return false;

  await writeOpportunityScore(client, { opportunityId: computation.opportunityId, tenantId: computation.tenantId }, null, options);

  if (computation.topicId) {
    const evidence = g0EvidencePayload(computation);
    const breakdown = alignmentCameFromTopicMatch(computation)
      ? evidence
      : { ...evidence, [G0_FIT_SCORE_PLACEHOLDER]: true };
    // Only a row that already exists is cleared. An opportunity that was never scored has no
    // per-opportunity TopicMatch row, and creating one here would add a placeholder record
    // (fitScore 0) whose only content is "no score" (NG-59, PR #325 review).
    const existing: { id: string } | null = await client.topicMatch.findFirst({
      where: { tenantId: computation.tenantId, topicId: computation.topicId, opportunityId: computation.opportunityId },
      select: { id: true },
    });
    if (existing) {
      // updateMany, scoped by tenant: the row can vanish between the lookup and this write, and a
      // by-id update would throw P2025 and turn a gate click into an error. 0 rows matched is fine.
      await client.topicMatch.updateMany({ where: { id: existing.id, tenantId: computation.tenantId }, data: { g0Score: null, breakdown } });
    }
  }

  return true;
}

/**
 * Score an existing opportunity and store the result, inside the tenant's RLS context.
 * Returns `null` when the opportunity does not belong to the tenant, or is no longer in
 * {@link G0_RESCORE_SCOPE} (archived, moved past G0, not ACTIVE); nothing is written for it then.
 * A computation with no score replaces the stored one with null (see {@link clearStoredG0}).
 */
export async function rescoreOpportunityG0(
  tenantId: string,
  opportunityId: string,
  rescoreOptions: { lockTimeoutMs?: number } = {},
): Promise<G0Computation | null> {
  return withTenant(tenantId, async (tx) => {
    if (rescoreOptions.lockTimeoutMs !== undefined) await limitLockWait(tx, rescoreOptions.lockTimeoutMs);
    const computation = await computeG0ForOpportunity(tx, tenantId, opportunityId, { scope: G0_RESCORE_SCOPE });
    if (!computation) return null;
    // A rescore is not an edit of the opportunity: keep its `updatedAt` (FO-384 B1). It writes only
    // what is still in scope (K-577267).
    const options: G0StoreOptions = { keepUpdatedAt: true, rescope: true };
    try {
      if (computation.score === null) await clearStoredG0(tx, computation, options);
      else await persistG0(tx, computation, options);
    } catch (error) {
      if (error instanceof G0LeftScopeError) return null;
      throw error;
    }
    return computation;
  });
}
