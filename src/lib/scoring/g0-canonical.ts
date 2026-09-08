/**
 * Canonical G0 triage scoring — E11.3 ESR calibration.
 *
 * The binding specification is PROJECT.md:
 *
 *   line 75  | G0 Konu triyajı | uyum ≥ 70/100 **ve** taban oran ≥ %8 **ve** ülke uygun |
 *   line 81  | G0 puanlama ağırlıkları (100): uyum 30, taban oran 15, koordinatör geçmişi 15,
 *            | araştırma+son kullanıcı 12, ağ merkeziliği 10, bütçe/rol ekonomisi 10,
 *            | lump-sum/iki aşamalı 8.
 *
 * Two things are defined there and they are NOT the same thing:
 *   • a weighted 0–100 *composite* score, used to rank opportunities;
 *   • three *hard rules* that decide the gate.
 *
 * `src/lib/gates/evaluate.ts` currently gates on the composite (`DEFAULT_GATE_RULES.G0.minScore`,
 * 70) while the settings screen labels that same number "Minimum AI Alignment Score". Which of the
 * two readings is the real gate is an open decision (docs/ROADMAP.md · Açık kararlar #8) — so both
 * are expressed here as *configurable rules* and the calibration harness measures which one fits
 * the observed ESR outcomes. Nothing is hard-coded that a calibration run cannot move.
 *
 * `./g0.ts` used to hold a second, 4-factor 0–10 model (`calculateG0Score`). It had no callers and
 * scored on a different scale to the 70 threshold, so it was deleted rather than kept as a trap.
 * The features this scorer needs are assembled in ./g0-features.ts and read from the database in
 * ./g0-compute.ts, which is the only place a G0 score is written.
 */

import { DEFAULT_GATE_RULES, DEFAULT_SCORING_WEIGHTS } from './defaults';

/** The seven weighted G0 features, each normalised to 0–100. */
// A type alias rather than an interface on purpose: this payload is written
// verbatim into `TopicMatch.breakdown` and `Evidence.payload`, both JSON
// columns, and only an object literal type (or an alias of one) carries the
// implicit index signature that makes it assignable to a JSON value.
export type G0Features = {
  /** Topic ↔ TenantProfile fit. `TopicMatch.fitScore` (cosine + rule corrections). Weight 30. */
  alignment: number;
  /** Historical success rate for the topic prefix, already normalised — see `baseRateToScore`. Weight 15. */
  baseRate: number;
  /** Prior coordinated projects in the topic family (CORDIS participations). Weight 15. */
  coordinatorHistory: number;
  /** Consortium covers both a research actor and an end user. Weight 12. */
  researchAndEndUser: number;
  /** Position in the CORDIS co-participation graph. Weight 10. */
  networkCentrality: number;
  /** Budget per partner vs. the intended role's realistic share. Weight 10. */
  budgetRoleEconomy: number;
  /** Lump-sum and/or two-stage topics cost less to attempt. Weight 8. */
  lumpSumTwoStage: number;
}

/** Facts the hard rules look at, kept apart from the weighted features on purpose. */
export interface G0HardFacts {
  /** Raw historical success rate as a percentage (e.g. 12.5 for 12.5 %). */
  baseRatePct: number;
  /** Country eligibility for the call (associated/participating country, no exclusion). */
  countryEligible: boolean;
}

export interface G0Rules {
  /** Minimum composite score, 0–100. `null` disables the composite rule entirely. */
  minScore: number | null;
  /** Minimum `alignment` sub-score, 0–100. `null` disables it. */
  minAlignment: number | null;
  /** Minimum raw base rate in percent. */
  minBaseRate: number;
  /** Whether country eligibility is enforced. */
  requireEligibleCountry: boolean;
}

export type G0Decision = 'GO' | 'NO_GO';

export interface G0Result {
  decision: G0Decision;
  /** Composite score, 0–100, rounded to two decimals. */
  score: number;
  /** Per-feature weighted contributions — what the UI shows as the score breakdown. */
  contributions: Record<keyof G0Features, number>;
  /** Human-readable reasons, empty when the decision is GO. */
  reasons: string[];
}

export type G0Weights = typeof DEFAULT_SCORING_WEIGHTS;

/**
 * Base rate reaches full marks at `fullMarksAtPct`. Horizon Europe's overall success rate sits
 * around 16 %, so 20 % is a deliberately demanding ceiling rather than a theoretical 100 %.
 */
export const BASE_RATE_FULL_MARKS_PCT = 20;

export function baseRateToScore(baseRatePct: number, fullMarksAtPct = BASE_RATE_FULL_MARKS_PCT): number {
  if (!Number.isFinite(baseRatePct) || baseRatePct <= 0) return 0;
  return clamp01to100((baseRatePct / fullMarksAtPct) * 100);
}

/** The rule set the gate engine ships with, derived from `DEFAULT_GATE_RULES.G0`. */
export const DEFAULT_G0_RULES: G0Rules = {
  minScore: DEFAULT_GATE_RULES.G0.minScore,
  minAlignment: DEFAULT_GATE_RULES.G0.minScore,
  minBaseRate: DEFAULT_GATE_RULES.G0.minBaseRate,
  requireEligibleCountry: DEFAULT_GATE_RULES.G0.requireEligibleCountry,
};

/**
 * PROJECT.md:75 read literally: the gate is the three hard rules, the composite only ranks.
 * Kept as a named rule set so the calibration harness can score both readings side by side.
 */
export const SPEC_LITERAL_G0_RULES: G0Rules = {
  minScore: null,
  minAlignment: DEFAULT_GATE_RULES.G0.minScore,
  minBaseRate: DEFAULT_GATE_RULES.G0.minBaseRate,
  requireEligibleCountry: DEFAULT_GATE_RULES.G0.requireEligibleCountry,
};

function clamp01to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

const FEATURE_KEYS: (keyof G0Features)[] = [
  'alignment',
  'baseRate',
  'coordinatorHistory',
  'researchAndEndUser',
  'networkCentrality',
  'budgetRoleEconomy',
  'lumpSumTwoStage',
];

export function weightsTotal(weights: G0Weights = DEFAULT_SCORING_WEIGHTS): number {
  return FEATURE_KEYS.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
}

/**
 * Weighted composite, 0–100.
 *
 * The weights are a tenant-editable JSON (`TenantSettings.scoringWeights`), so they can arrive not
 * summing to 100. Rather than silently producing an out-of-range score we normalise by the actual
 * total — a tenant that doubles every weight keeps the same score, which is what an operator who
 * edits one number expects.
 */
export function scoreG0(features: G0Features, weights: G0Weights = DEFAULT_SCORING_WEIGHTS): number {
  const total = weightsTotal(weights);
  if (total <= 0) return 0;
  let sum = 0;
  for (const key of FEATURE_KEYS) {
    sum += clamp01to100(features[key]) * (weights[key] ?? 0);
  }
  return round2(sum / total);
}

export function g0Contributions(
  features: G0Features,
  weights: G0Weights = DEFAULT_SCORING_WEIGHTS,
): Record<keyof G0Features, number> {
  const total = weightsTotal(weights) || 1;
  const out = {} as Record<keyof G0Features, number>;
  for (const key of FEATURE_KEYS) {
    out[key] = round2((clamp01to100(features[key]) * (weights[key] ?? 0)) / total);
  }
  return out;
}

/**
 * Full G0 triage decision: composite score + hard rules.
 *
 * Every failing rule is reported, not just the first — an opportunity that misses on both base rate
 * and eligibility should tell its owner both, otherwise they fix one and re-run for nothing.
 */
export function decideG0(
  features: G0Features,
  facts: G0HardFacts,
  rules: G0Rules = DEFAULT_G0_RULES,
  weights: G0Weights = DEFAULT_SCORING_WEIGHTS,
): G0Result {
  const score = scoreG0(features, weights);
  const reasons: string[] = [];

  if (rules.minScore !== null && score < rules.minScore) {
    reasons.push(`composite score ${score.toFixed(2)} < ${rules.minScore}`);
  }
  if (rules.minAlignment !== null && clamp01to100(features.alignment) < rules.minAlignment) {
    reasons.push(`alignment ${clamp01to100(features.alignment).toFixed(2)} < ${rules.minAlignment}`);
  }
  if (facts.baseRatePct < rules.minBaseRate) {
    reasons.push(`base rate ${facts.baseRatePct}% < ${rules.minBaseRate}%`);
  }
  if (rules.requireEligibleCountry && !facts.countryEligible) {
    reasons.push('country not eligible for this call');
  }

  return {
    decision: reasons.length === 0 ? 'GO' : 'NO_GO',
    score,
    contributions: g0Contributions(features, weights),
    reasons,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export { FEATURE_KEYS as G0_FEATURE_KEYS, DEFAULT_SCORING_WEIGHTS, DEFAULT_GATE_RULES };
