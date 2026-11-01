/**
 * M8 — the one scale `SeatCandidate.score` is written on (FO-147).
 *
 * Two scorers write that column: the consortium builder's "Aday Bul"
 * (src/lib/scoring/consortium.ts) and the seat matcher
 * (src/modules/m8/server/matching.ts). They weigh different dimensions, but the
 * number they store has to be comparable in the same candidate table, so both
 * hand their result to {@link normalizeSeatScore} as a 0–1 fraction of their own
 * maximum and store what comes back. There is no second place a score is scaled.
 */

/** Upper bound of `SeatCandidate.score`. */
export const SEAT_SCORE_MAX = 100;

/**
 * A scorer's fraction of its own maximum → the stored 0–100 score, two decimals.
 * Clamped: a penalty (the matcher's rival risk) cannot push a score below 0, and
 * nothing goes above 100. A non-finite fraction scores 0.
 */
export function normalizeSeatScore(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(clamped * SEAT_SCORE_MAX * 100) / 100;
}
