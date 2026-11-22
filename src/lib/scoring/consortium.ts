/**
 * The retired consortium scorer's pure parts (the "Aday Bul" button on
 * /[workspace]/pipeline/[id]/consortium).
 *
 * K-579560=A (NG-100): the button now runs the M8 matcher
 * (src/modules/m8/server/matching.ts `runSeatMatch`), one rule for both screens. The
 * database scorer that used to live here (`scoreCandidatesForSeat`) is gone, and so
 * are its live-demand slot and pool rules: the live-demand signal is no longer part
 * of the score.
 *
 * What stays:
 *  - `consortiumSeatScore` / `consortiumWeights`: re-derive a score from a breakdown
 *    the old scorer stored. `seat-rescore.ts` needs them to rewrite those rows, so
 *    stored rows keep an honest 0–100 score until their seat is matched again.
 *  - `detectConflicts`: unrelated to scoring.
 */

import { withTenant } from '@/lib/db';
import { consortiumLiveDemandWeight } from '@/lib/env';
import { normalizedWeights, DEFAULT_LIVE_DEMAND_WEIGHT, type LiveDemandWeights } from '@/lib/scoring/live-demand';
import { normalizeSeatScore } from '@/lib/scoring/seat-score';
import { CONSORTIUM_DIMENSION_MAX } from '@/lib/scoring/seat-dimension-scale';

/** The breakdown the retired consortium scorer wrote into `SeatCandidate.breakdown`. */
export interface ScoringBreakdown {
  topicExperience: number;
  networkCentrality: number;
  countryDiversity: number;
  smeBonus: number;
  warmthBonus: number;
  /** 0–1, live partner demand on the topic. Stored by the old scorer only. */
  liveDemandSignal: number;
  /** Stored by the old scorer only. */
  liveDemandReason: { days: number } | null;
  /** Weighted, normalised total on a 0–100 scale. */
  total: number;
}

/** Each raw dimension's maximum, so every component can be scaled to 0–1. */
const DIMENSION_MAX = CONSORTIUM_DIMENSION_MAX;

/** The raw dimensions a consortium breakdown stores, each in 0…its DIMENSION_MAX. */
export type ConsortiumDimensions = Pick<
  ScoringBreakdown,
  'topicExperience' | 'networkCentrality' | 'countryDiversity' | 'smeBonus' | 'warmthBonus'
>;

/**
 * The consortium score of one stored candidate on the 0–100 seat scale. Every component
 * is scaled to 0–1 and the weights sum to 1, so whatever the config weight is,
 * the fraction handed to {@link normalizeSeatScore} is 0–1. Used by the SeatCandidate
 * rescore (src/lib/scoring/seat-rescore.ts) on stored breakdowns only.
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

/** The weights used to re-derive stored consortium rows: option, then CONSORTIUM_LIVE_DEMAND_WEIGHT, then 15 %. */
export function consortiumWeights(liveDemandWeight?: number): LiveDemandWeights {
  return normalizedWeights(liveDemandWeight ?? consortiumLiveDemandWeight ?? DEFAULT_LIVE_DEMAND_WEIGHT);
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
