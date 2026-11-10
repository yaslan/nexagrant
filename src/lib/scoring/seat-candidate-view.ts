/**
 * NG-100 / K-579560=A — which stored `SeatCandidate` rows a reader may use.
 *
 * The one visibility rule, shared by every reader: the consortium and M8 "Aday Bul"
 * screens, the G1 backup check (src/lib/gates/evaluate.ts), the invite
 * (src/modules/m8/server/seat-transitions.ts) and the exports. Only rows the current
 * M8 matcher wrote (src/modules/m8/server/matching.ts) count. Rows left by the retired
 * consortium scorer (src/lib/scoring/consortium.ts) and by the pre-K-578751 matcher stay
 * in the table until their seat is matched again, but nobody shows or uses them: their
 * dimensions are not this rule's dimensions, so they would read as a different ranking.
 * Pure function, so the readers and a test share it.
 */

import { seatBreakdownWriter } from '@/lib/scoring/seat-dimension-scale';

export function visibleSeatCandidates<T extends { breakdown?: unknown }>(rows: readonly T[]): T[] {
  return rows.filter((row) => seatBreakdownWriter(row.breakdown) === 'match');
}
