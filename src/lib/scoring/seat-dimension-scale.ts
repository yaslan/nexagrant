/**
 * M8 — the range each `SeatCandidate.breakdown` dimension is scored in (FO-155).
 *
 * The stored total is on the 0–100 seat scale (src/lib/scoring/seat-score.ts), but
 * the breakdown keeps each scorer's raw points: the matcher's topic experience is
 * 0–34, the consortium builder's is 0–3. The UI shows every dimension against its
 * own range, read from here, so a "3" is never taken for 3 out of 100.
 *
 * No server imports: the consortium builder is a client component. The consortium
 * scorer reads its maxima from {@link CONSORTIUM_DIMENSION_MAX}, the matcher
 * (`scoreCandidate`) from {@link MATCH_DIMENSION_SCALE}.
 */

/** Which scorer wrote a breakdown. */
export type SeatScoreWriter = 'match' | 'match-legacy' | 'consortium';

/** Lowest and highest raw points a dimension can take. */
export interface DimensionScale {
  min: number;
  max: number;
}

/** The seat matcher (src/modules/m8/server/matching.ts `scoreCandidate`). Rival risk is a penalty. */
export const MATCH_DIMENSION_SCALE = {
  topicExperience: { min: 0, max: 34 },
  geographicBalance: { min: 0, max: 33 },
  collabHistory: { min: 0, max: 33 },
  rivalRisk: { min: -10, max: 0 },
} as const satisfies Record<string, DimensionScale>;

/**
 * The matcher before K-578751. Stored rows keep these raw points until their seat
 * is matched again, so each has to be read against the ranges it was scored on.
 */
export const MATCH_LEGACY_DIMENSION_SCALE = {
  topicExperience: { min: 0, max: 35 },
  geographicBalance: { min: 0, max: 15 },
  collabHistory: { min: 0, max: 15 },
  relationshipWarmth: { min: 0, max: 15 },
  centrality: { min: 0, max: 10 },
  rivalRisk: { min: -10, max: 0 },
} as const satisfies Record<string, DimensionScale>;

/** The consortium builder's raw dimension maxima (src/lib/scoring/consortium.ts). */
export const CONSORTIUM_DIMENSION_MAX = {
  topicExperience: 3.0,
  networkCentrality: 3.0,
  countryDiversity: 1.5,
  smeBonus: 1.0,
  warmthBonus: 1.5,
} as const;

/** The consortium breakdown, with the live-demand signal (0–1) next to the raw dimensions. */
const CONSORTIUM_DIMENSION_SCALE: Record<string, DimensionScale> = {
  ...Object.fromEntries(Object.entries(CONSORTIUM_DIMENSION_MAX).map(([k, max]) => [k, { min: 0, max }])),
  liveDemandSignal: { min: 0, max: 1 },
};

const SCALES: Record<SeatScoreWriter, Record<string, DimensionScale>> = {
  match: MATCH_DIMENSION_SCALE,
  'match-legacy': MATCH_LEGACY_DIMENSION_SCALE,
  consortium: CONSORTIUM_DIMENSION_SCALE,
};

/** The range of one dimension of a writer's breakdown; null for a key that writer does not score. */
export function seatScoreDimensionScale(writer: SeatScoreWriter, key: string): DimensionScale | null {
  return Object.hasOwn(SCALES[writer], key) ? (SCALES[writer][key] ?? null) : null;
}

function hasNumbers(b: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((k) => typeof b[k] === 'number' && Number.isFinite(b[k]));
}

/**
 * The scorer a stored breakdown came from, by its keys — the same test the
 * rescore applies (src/lib/scoring/seat-rescore.ts). The matcher is checked first:
 * `topicExperience` is shared, the rest is not. The old matcher's six keys contain
 * the current four, so it is checked before the current one, and a breakdown with
 * only one of the two dropped keys is neither. Null when no scorer wrote it.
 */
export function seatBreakdownWriter(breakdown: unknown): SeatScoreWriter | null {
  if (typeof breakdown !== 'object' || breakdown === null || Array.isArray(breakdown)) return null;
  const b = breakdown as Record<string, unknown>;
  if (hasNumbers(b, Object.keys(MATCH_LEGACY_DIMENSION_SCALE))) return 'match-legacy';
  const hasDroppedKey = Object.hasOwn(b, 'relationshipWarmth') || Object.hasOwn(b, 'centrality');
  if (!hasDroppedKey && hasNumbers(b, Object.keys(MATCH_DIMENSION_SCALE))) return 'match';
  if (hasNumbers(b, Object.keys(CONSORTIUM_DIMENSION_MAX))) return 'consortium';
  return null;
}
