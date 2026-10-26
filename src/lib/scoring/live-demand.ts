/**
 * Live partner demand for the consortium scorer (FO-63 / PS-K5).
 *
 * Pure functions, no I/O: the signal a candidate earns from open partner-search
 * requests on the same topic. The score itself lives in ./consortium.ts; this
 * file only decides how much a candidate's live demand is worth and what the
 * reason line says.
 *
 * Signal in [0, 1] = 0.4 · topicDemand + 0.4 · ownRequest + 0.2 · freshness
 *   topicDemand  active requests on the topic, saturating at SATURATION_COUNT
 *   ownRequest   1 when the candidate itself has an active request on the topic
 *   freshness    1 within FRESH_DAYS of the candidate's own request, falling
 *                linearly to 0 at STALE_DAYS; 0 without an own request
 */

import type { LiveDemandInput, LiveDemandRequest } from '@/core/contracts/live-demand';

/** Share of the total score the live demand carries by default. */
export const DEFAULT_LIVE_DEMAND_WEIGHT = 0.15;

const SATURATION_COUNT = 5;
const FRESH_DAYS = 14;
const STALE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LiveDemandSignal {
  /** 0–1, see the file header. */
  signal: number;
  /** Whole days since the candidate's own request was published; null without one. */
  ownRequestAgeDays: number | null;
}

/** Days from `publishedAt` to `now`, floored and never negative. */
function ageInDays(publishedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS));
}

/** Freshness of a request of the given age: 1 up to FRESH_DAYS, 0 from STALE_DAYS. */
export function freshnessOf(ageDays: number): number {
  if (ageDays <= FRESH_DAYS) return 1;
  if (ageDays >= STALE_DAYS) return 0;
  return (STALE_DAYS - ageDays) / (STALE_DAYS - FRESH_DAYS);
}

/**
 * The live-demand signal for one candidate organisation. A candidate's own
 * request counts only when it has a PIC and the request names that PIC.
 */
export function liveDemandSignalFor(
  input: LiveDemandInput,
  organizationId: string,
  now: Date,
): LiveDemandSignal {
  const requests: readonly LiveDemandRequest[] = input.requests;
  const topicDemand = Math.min(1, requests.length / SATURATION_COUNT);

  const own = requests
    .filter((r) => r.organizationPic === organizationId)
    .map((r) => (r.publishedAt ? ageInDays(r.publishedAt, now) : null));
  const hasOwn = own.length > 0;
  const freshest = own.reduce<number | null>(
    (best, age) => (age === null ? best : best === null ? age : Math.min(best, age)),
    null,
  );
  const ownRequest = hasOwn ? 1 : 0;
  const freshness = freshest === null ? 0 : freshnessOf(freshest);

  const signal = 0.4 * topicDemand + 0.4 * ownRequest + 0.2 * freshness;
  return { signal, ownRequestAgeDays: freshest };
}

export interface LiveDemandWeights {
  topicExperience: number;
  networkCentrality: number;
  countryDiversity: number;
  smeBonus: number;
  warmthBonus: number;
  liveDemand: number;
}

/** Relative weights of the five existing dimensions; only their ratios matter. */
const BASE_WEIGHTS = {
  topicExperience: 3,
  networkCentrality: 3,
  countryDiversity: 1.5,
  smeBonus: 1,
  warmthBonus: 1.5,
};

/**
 * The per-dimension weights, normalised so they sum to 1. The live-demand
 * weight is read from config and clamped to [0, 1]; the other five keep their
 * relative proportions and share what is left.
 */
export function normalizedWeights(liveDemandWeight: number): LiveDemandWeights {
  const liveWeight = Number.isFinite(liveDemandWeight)
    ? Math.min(1, Math.max(0, liveDemandWeight))
    : DEFAULT_LIVE_DEMAND_WEIGHT;
  const restSum = Object.values(BASE_WEIGHTS).reduce((sum, w) => sum + w, 0);
  const restShare = 1 - liveWeight;
  const scaled = Object.fromEntries(
    Object.entries(BASE_WEIGHTS).map(([key, w]) => [key, (w / restSum) * restShare]),
  ) as Omit<LiveDemandWeights, 'liveDemand'>;
  return { ...scaled, liveDemand: liveWeight };
}

/**
 * The reason line for a candidate, or null when there is nothing to say. The
 * signal is computed whether or not M8 is on; the line is returned only when
 * `visible` (M8 on for the viewer), so a switched-off module never shows it.
 */
export function liveDemandReason(
  ownRequestAgeDays: number | null,
  visible: boolean,
): { days: number } | null {
  if (!visible || ownRequestAgeDays === null) return null;
  return { days: ownRequestAgeDays };
}
