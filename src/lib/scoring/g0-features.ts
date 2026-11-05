/**
 * G0 feature extraction — the missing half of the canonical scorer.
 *
 * `g0-canonical.ts` answers "given seven features, what is the score". Nothing answered "where do
 * the seven features come from", so in practice nothing ever called it: `Opportunity.g0Score` was
 * written from a seed literal or from `Math.random() * 15 + 80`, and `gates/evaluate.ts` gated on
 * that invented number. CLAUDE.md §7 forbids showing a user a figure that is not backed by a
 * stored record; this module is what makes the figure derivable.
 *
 * Everything here is **pure**: it takes a plain snapshot of already-fetched rows and returns
 * features, hard facts and a source trail. The Prisma reads live in `g0-compute.ts`, so the maths
 * can be unit tested without a database and the same code produces the number the UI shows and the
 * number a test asserts.
 *
 * Two rules the extraction follows throughout:
 *
 *   1. **A missing source scores 0, it is never guessed.** An opportunity we know nothing about
 *      must not score like an average one. Every feature reports whether it was `measured` or
 *      `missing`, and the caller can see, per feature, what evidence produced the number.
 *   2. **Nothing is random and nothing depends on the clock.** The same snapshot always yields the
 *      same score; that is what makes a stored score auditable after the fact.
 */

import type { G0Features, G0HardFacts } from './g0-canonical';
import { baseRateToScore } from './g0-canonical';
import { DEFAULT_SCORING_WEIGHTS } from './defaults';

// ───────────────────────── snapshot shape ─────────────────────────

export interface G0TenantSnapshot {
  /** ISO-3166-1 alpha-2, from `Tenant.country`. Drives country eligibility. */
  country: string | null;
  /** `Tenant.pic` — the EU Participant Identification Code, which is also the CORDIS org id. */
  pic: string | null;
}

export interface G0ProfileSnapshot {
  /** `TenantProfile.keywords`. Used only as the documented fallback when no TopicMatch exists. */
  keywords: string[];
}

export interface G0TopicSnapshot {
  /** `Topic.id` — the resolved primary key, which is what evidence rows must be filed under. */
  id: string;
  /** `Topic.identifier`, e.g. HORIZON-CL5-2026-09-D4-01. */
  identifier: string;
  keywords: string[];
  isLumpSum: boolean;
  isTwoStage: boolean;
  /** `Topic.budgetPerProjectCents`, minor units (CLAUDE.md §9). `null` when the call omits it. */
  budgetPerProjectCents: number | null;
  /** `Topic.eligibility` JSON: `{ restricted, countriesExcluded }`. */
  eligibility: {
    restricted?: string | null;
    countriesExcluded?: string[] | null;
  } | null;
}

export interface G0SeatSnapshot {
  roleKey: string;
  status: string;
}

export interface G0CordisSnapshot {
  /** Coordinated CORDIS projects whose master call sits in the same topic family. */
  coordinationsInTopicFamily: number;
  /** Coordinated CORDIS projects anywhere. */
  coordinationsOverall: number;
  /** Distinct organisations the tenant has ever shared a project with. */
  distinctCollaborators: number;
  /**
   * CORDIS participations of any role. `0` means the PIC has no CORDIS record at all, which is a
   * measured fact ("no history"), not missing data. Missing data is `G0CordisSnapshot = null`.
   */
  participationsOverall: number;
}

/**
 * Seat statuses that count as FILLED: a named candidate, invitee or confirmed organisation sits on
 * the seat. `OPEN` (nobody yet) and `DECLINED` (left) are not filled. This is the one place the set
 * is written down; the scorer and the no-history gate both derive from it.
 */
export const FILLED_SEAT_STATUSES = ['CANDIDATE', 'INVITED', 'CONFIRMED'] as const;
const FILLED_SEAT_STATUS_SET: ReadonlySet<string> = new Set<string>(FILLED_SEAT_STATUSES);

/** True when a seat has a named organisation on it (see `FILLED_SEAT_STATUSES`). */
export function isFilledSeat(seat: { status: string }): boolean {
  return FILLED_SEAT_STATUS_SET.has(seat.status.trim().toUpperCase());
}

/**
 * Features dropped from the denominator when a partner has no CORDIS history at all (FO-382,
 * patron decision K-576759 = A). Both depend only on CORDIS participation, so with no history they
 * can never be earned by the organisation; leaving them in the denominator would make every new
 * partner fail the threshold for a reason it cannot change.
 */
export const NO_HISTORY_EXCLUDED_FEATURES = ['coordinatorHistory', 'networkCentrality'] as const;

export interface G0Snapshot {
  tenant: G0TenantSnapshot;
  profile: G0ProfileSnapshot | null;
  topic: G0TopicSnapshot | null;
  /** `TopicMatch.fitScore` for (tenant, topic) — the K1 cosine + rule-correction match, 0–100. */
  topicFitScore: number | null;
  /** `TopicStat.successRate` for the topic (or its prefix), as a percentage. */
  baseRatePct: number | null;
  /** `Opportunity.intendedRole` — 'coordinator' | 'partner' | anything else. */
  intendedRole: string | null;
  seats: G0SeatSnapshot[];
  cordis: G0CordisSnapshot | null;
}

// ───────────────────────── source trail ─────────────────────────

export type G0SourceStatus = 'measured' | 'missing';

/** @see G0Features — a type alias, so the source trail stays JSON-assignable. */
export type G0Source = {
  feature: keyof G0Features | 'baseRatePct' | 'countryEligible';
  /** The table/column the value came from, or the one that was absent. */
  source: string;
  status: G0SourceStatus;
  /** What the feature scored, 0–100 (or the raw fact for the two hard facts). */
  value: number | boolean;
  /** Short, non-localised explanation — the audit trail, not UI copy. */
  note: string;
}

export interface G0Extraction {
  features: G0Features;
  facts: G0HardFacts;
  sources: G0Source[];
  /**
   * Share of the total feature weight that came from a real record, 0–1.
   *
   * `0` means the snapshot carried no evidence at all. A score computed from nothing is exactly
   * the fabricated number this task exists to remove, so callers must refuse to store one.
   */
  coverage: number;
  /**
   * Features left out of the denominator because the rule for "no CORDIS history on a partner"
   * applies. Empty on the standard path.
   */
  excludedFeatures: (keyof G0Features)[];
  /**
   * `standard` — the seven-feature composite as before. `no_history_evidence` — a partner with no
   * CORDIS record, scored without the two CORDIS-only features. Stored with the score so a reader
   * can tell which denominator produced it.
   */
  scoringBasis: 'standard' | 'no_history_evidence';
  /** Seats with a named organisation (see `FILLED_SEAT_STATUSES`); the no-history gate reads it. */
  filledSeats: number;
}

// ───────────────────────── helpers ─────────────────────────

function clamp0to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Saturating ramp: `at or below min` → 0, `at or above full` → 100, linear between.
 * Used wherever "more is better up to a point that is good enough".
 */
function ramp(value: number, min: number, full: number): number {
  if (!Number.isFinite(value) || full <= min) return 0;
  return clamp0to100(((value - min) / (full - min)) * 100);
}

/**
 * Topic family prefix: the identifier without its trailing topic number.
 * `HORIZON-CL5-2026-09-D4-01` → `HORIZON-CL5-2026-09-D4`, which is the shape `TopicStat.topicPrefix`
 * and `CordisProject.masterCall` are recorded in.
 */
export function topicPrefixOf(identifier: string): string {
  const parts = identifier.trim().split('-');
  return parts.length <= 1 ? identifier.trim() : parts.slice(0, -1).join('-');
}

function normaliseKeywords(list: readonly string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of list ?? []) {
    const k = raw.trim().toLowerCase();
    if (k) out.add(k);
  }
  return out;
}

/**
 * How much of what the topic asks for the tenant claims to have.
 *
 * Deliberately asymmetric (topic keywords in the denominator, not the union): a tenant with a broad
 * capability list should not be penalised for also doing things this call does not need, but a
 * tenant that covers two of the call's eight keywords is a 25 % fit and must read as one.
 */
export function keywordCoverageScore(
  profileKeywords: readonly string[] | null | undefined,
  topicKeywords: readonly string[] | null | undefined,
): number | null {
  const topic = normaliseKeywords(topicKeywords);
  const profile = normaliseKeywords(profileKeywords);
  if (topic.size === 0 || profile.size === 0) return null;
  let hits = 0;
  for (const k of topic) if (profile.has(k)) hits++;
  return round2((hits / topic.size) * 100);
}

/**
 * EU / EEA / Switzerland, for the `restricted: "EU_EEA_CH_ONLY"` eligibility flag.
 * Turkey is an *associated* country and deliberately absent: a Turkish tenant is not eligible for
 * a call restricted to this list, and the gate has to say so rather than wave it through.
 */
const EU_EEA_CH = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'IS', 'LI', 'NO',
  'CH',
]);

export function isCountryEligible(
  country: string | null | undefined,
  eligibility: G0TopicSnapshot['eligibility'],
): { eligible: boolean; note: string } {
  const code = (country ?? '').trim().toUpperCase();
  if (!code) return { eligible: false, note: 'tenant has no country on file' };

  const excluded = (eligibility?.countriesExcluded ?? []).map((c) => String(c).trim().toUpperCase());
  if (excluded.includes(code)) return { eligible: false, note: `${code} is on the call exclusion list` };

  const restricted = (eligibility?.restricted ?? '').toString().trim().toUpperCase();
  if (restricted === 'EU_EEA_CH_ONLY' && !EU_EEA_CH.has(code)) {
    return { eligible: false, note: `call is EU/EEA/CH only, tenant is ${code}` };
  }
  return { eligible: true, note: restricted ? `${code} passes restriction ${restricted}` : `${code}, no restriction on the call` };
}

/** Coordinator's realistic share of a project budget, by intended role. */
function roleBudgetBand(intendedRole: string | null): { share: number; minCents: number; fullCents: number; label: string } {
  const role = (intendedRole ?? '').trim().toLowerCase();
  if (role === 'coordinator') {
    // A coordinator carries the management work package; below ~€400k the overhead eats the grant,
    // and ~€1.2m is a comfortable coordinating share of a typical RIA.
    return { share: 0.2, minCents: 400_000_00, fullCents: 1_200_000_00, label: 'coordinator (20% share)' };
  }
  return { share: 0.1, minCents: 150_000_00, fullCents: 450_000_00, label: 'partner (10% share)' };
}

// ───────────────────────── extraction ─────────────────────────

const FEATURE_KEYS: (keyof G0Features)[] = [
  'alignment',
  'baseRate',
  'coordinatorHistory',
  'researchAndEndUser',
  'networkCentrality',
  'budgetRoleEconomy',
  'lumpSumTwoStage',
];

/**
 * Turn a snapshot of stored rows into the seven canonical features plus the two hard facts.
 *
 * Every branch records a {@link G0Source}, including the ones that find nothing: "alignment 0
 * because this tenant has no TopicMatch and no profile keywords" is a reviewable statement, while a
 * bare 0 is not.
 */
export function extractG0Features(snapshot: G0Snapshot): G0Extraction {
  const sources: G0Source[] = [];
  const measured = new Set<keyof G0Features>();

  const record = (
    feature: G0Source['feature'],
    source: string,
    status: G0SourceStatus,
    value: number | boolean,
    note: string,
  ): void => {
    sources.push({ feature, source, status, value, note });
    if (status === 'measured' && (FEATURE_KEYS as string[]).includes(feature as string)) {
      measured.add(feature as keyof G0Features);
    }
  };

  // 1 — alignment (weight 30). TopicMatch is the real signal; profile ∩ topic keywords is the
  // documented fallback so a tenant that has not run K1 matching yet is not scored as a zero fit.
  let alignment = 0;
  if (snapshot.topicFitScore !== null && Number.isFinite(snapshot.topicFitScore)) {
    alignment = clamp0to100(snapshot.topicFitScore);
    record('alignment', 'TopicMatch.fitScore', 'measured', round2(alignment), 'K1 topic match');
  } else {
    const overlap = keywordCoverageScore(snapshot.profile?.keywords, snapshot.topic?.keywords);
    if (overlap === null) {
      record('alignment', 'TopicMatch.fitScore', 'missing', 0, 'no topic match and no keywords to compare');
    } else {
      alignment = clamp0to100(overlap);
      record('alignment', 'TenantProfile.keywords ∩ Topic.keywords', 'measured', round2(alignment), 'keyword coverage fallback, no TopicMatch row');
    }
  }

  // 2 — base rate (weight 15) and the matching hard fact.
  let baseRate = 0;
  const baseRatePct = snapshot.baseRatePct !== null && Number.isFinite(snapshot.baseRatePct)
    ? Math.max(0, snapshot.baseRatePct)
    : null;
  if (baseRatePct === null) {
    record('baseRate', 'TopicStat.successRate', 'missing', 0, 'no imported success rate for this topic or its prefix');
    record('baseRatePct', 'TopicStat.successRate', 'missing', 0, 'base rate unknown; the hard rule cannot be satisfied on evidence');
  } else {
    baseRate = baseRateToScore(baseRatePct);
    record('baseRate', 'TopicStat.successRate', 'measured', round2(baseRate), `${baseRatePct}% historical success rate`);
    record('baseRatePct', 'TopicStat.successRate', 'measured', baseRatePct, `${baseRatePct}% historical success rate`);
  }

  // A partner with no CORDIS record at all: the two CORDIS-only features leave the denominator
  // (see NO_HISTORY_EXCLUDED_FEATURES). Only a measured "no history" qualifies; missing CORDIS data
  // (`cordis === null`) keeps the standard scoring, so an outage cannot silently change the basis.
  const excludedFeatures: (keyof G0Features)[] = isNoHistoryPartner(snapshot)
    ? [...NO_HISTORY_EXCLUDED_FEATURES]
    : [];
  const excluded = (feature: keyof G0Features): boolean => excludedFeatures.includes(feature);

  // 3 — coordinator history (weight 15). A coordination inside the same call family is the strong
  // signal; coordinating anything at all is worth at most half marks.
  let coordinatorHistory = 0;
  if (snapshot.cordis === null) {
    record('coordinatorHistory', 'CordisParticipation', 'missing', 0, 'tenant has no PIC, or CORDIS is not imported');
  } else if (excluded('coordinatorHistory')) {
    record('coordinatorHistory', 'CordisParticipation', 'measured', 0, 'partner with no CORDIS record: feature excluded from the denominator');
  } else {
    const inFamily = ramp(snapshot.cordis.coordinationsInTopicFamily, 0, 3);
    const overall = ramp(snapshot.cordis.coordinationsOverall, 0, 6) * 0.5;
    coordinatorHistory = clamp0to100(Math.max(inFamily, overall));
    record(
      'coordinatorHistory',
      'CordisParticipation.role=coordinator',
      'measured',
      round2(coordinatorHistory),
      `${snapshot.cordis.coordinationsInTopicFamily} in this topic family, ${snapshot.cordis.coordinationsOverall} overall`,
    );
  }

  // 4 — research + end user (weight 12). Read off the consortium seats that have a named
  // organisation on them. An OPEN seat has no partner yet and a DECLINED one has left; neither
  // scores (FO-382: an open seat used to earn the full 12 points).
  let researchAndEndUser = 0;
  if (snapshot.seats.length === 0) {
    record('researchAndEndUser', 'ConsortiumSeat.roleKey', 'missing', 0, 'no consortium seats defined yet');
  } else {
    const scoring = snapshot.seats.filter(isFilledSeat);
    const roles = new Set(scoring.map((s) => s.roleKey.trim().toLowerCase()));
    const hasResearch = roles.has('research');
    const hasEndUser = roles.has('end_user');
    researchAndEndUser = (hasResearch ? 50 : 0) + (hasEndUser ? 50 : 0);
    record(
      'researchAndEndUser',
      'ConsortiumSeat.roleKey (status not OPEN/DECLINED)',
      'measured',
      researchAndEndUser,
      `research seat: ${hasResearch}, end-user seat: ${hasEndUser}`,
    );
  }

  // 5 — network centrality (weight 10). Distinct co-participants, full marks at 25 — beyond that
  // the marginal partner tells us nothing new about reach.
  let networkCentrality = 0;
  if (snapshot.cordis === null) {
    record('networkCentrality', 'CordisParticipation', 'missing', 0, 'tenant has no PIC, or CORDIS is not imported');
  } else if (excluded('networkCentrality')) {
    record('networkCentrality', 'CordisParticipation co-participants', 'measured', 0, 'partner with no CORDIS record: feature excluded from the denominator');
  } else {
    networkCentrality = ramp(snapshot.cordis.distinctCollaborators, 0, 25);
    record(
      'networkCentrality',
      'CordisParticipation co-participants',
      'measured',
      round2(networkCentrality),
      `${snapshot.cordis.distinctCollaborators} distinct collaborating organisations`,
    );
  }

  // 6 — budget/role economy (weight 10). Is the slice this role would take large enough to be
  // worth eight weeks of writing?
  let budgetRoleEconomy = 0;
  const budget = snapshot.topic?.budgetPerProjectCents ?? null;
  if (budget === null || !Number.isFinite(budget) || budget <= 0) {
    record('budgetRoleEconomy', 'Topic.budgetPerProjectCents', 'missing', 0, 'call publishes no per-project budget');
  } else {
    const band = roleBudgetBand(snapshot.intendedRole);
    const sliceCents = budget * band.share;
    budgetRoleEconomy = ramp(sliceCents, band.minCents, band.fullCents);
    record(
      'budgetRoleEconomy',
      'Topic.budgetPerProjectCents × role share',
      'measured',
      round2(budgetRoleEconomy),
      `${band.label}: ${Math.round(sliceCents / 100)} of ${Math.round(budget / 100)} per project`,
    );
  }

  // 7 — lump sum / two stage (weight 8). Both flags are stored booleans, so "neither" is a real 0
  // rather than an absence — only a missing topic is missing evidence.
  let lumpSumTwoStage = 0;
  if (!snapshot.topic) {
    record('lumpSumTwoStage', 'Topic.isLumpSum / isTwoStage', 'missing', 0, 'opportunity is not linked to a topic');
  } else {
    lumpSumTwoStage = (snapshot.topic.isLumpSum ? 50 : 0) + (snapshot.topic.isTwoStage ? 50 : 0);
    record(
      'lumpSumTwoStage',
      'Topic.isLumpSum / isTwoStage',
      'measured',
      lumpSumTwoStage,
      `lump sum: ${snapshot.topic.isLumpSum}, two stage: ${snapshot.topic.isTwoStage}`,
    );
  }

  // Hard fact — country eligibility.
  const eligibility = isCountryEligible(snapshot.tenant.country, snapshot.topic?.eligibility ?? null);
  record(
    'countryEligible',
    'Tenant.country vs Topic.eligibility',
    snapshot.tenant.country ? 'measured' : 'missing',
    eligibility.eligible,
    eligibility.note,
  );

  const features: G0Features = {
    alignment,
    baseRate,
    coordinatorHistory,
    researchAndEndUser,
    networkCentrality,
    budgetRoleEconomy,
    lumpSumTwoStage,
  };

  // Coverage is over the features that are actually scored: an excluded feature is neither
  // measured nor missing, it is not part of the question.
  const scoredKeys = FEATURE_KEYS.filter((key) => !excluded(key));
  const totalWeight = scoredKeys.reduce((sum, key) => sum + (DEFAULT_SCORING_WEIGHTS[key] ?? 0), 0);
  const measuredWeight = [...measured]
    .filter((key) => !excluded(key))
    .reduce((sum, key) => sum + (DEFAULT_SCORING_WEIGHTS[key] ?? 0), 0);

  // Hard rule (FO-382, patron): a partner with no CORDIS history must have at least one FILLED seat.
  // Only the no-history basis triggers it; the standard and coordinator paths never see it.
  const filledSeats = snapshot.seats.filter(isFilledSeat).length;
  const scoringBasis: G0Extraction['scoringBasis'] = excludedFeatures.length > 0 ? 'no_history_evidence' : 'standard';

  return {
    features,
    facts: {
      baseRatePct: baseRatePct ?? 0,
      countryEligible: eligibility.eligible,
      noHistoryWithoutFilledSeat: scoringBasis === 'no_history_evidence' && filledSeats === 0,
    },
    sources,
    coverage: totalWeight > 0 ? round2(measuredWeight / totalWeight) : 0,
    excludedFeatures,
    scoringBasis,
    filledSeats,
  };
}

/**
 * The rule's condition, kept apart so it can be read and tested on its own: the intended role is
 * "partner" (`ortak`), the snapshot came from a real CORDIS lookup, and that lookup found no
 * participation of any role. An unset role (`null`) and the coordinator role never qualify.
 */
export function isNoHistoryPartner(snapshot: Pick<G0Snapshot, 'intendedRole' | 'cordis'>): boolean {
  const role = (snapshot.intendedRole ?? '').trim().toLowerCase();
  return role === 'partner' && snapshot.cordis !== null && snapshot.cordis.participationsOverall === 0;
}
