/**
 * NG-100 / K-579560=A — which stored `SeatCandidate` rows a screen shows.
 *
 * Both "Aday Bul" buttons write the M8 matcher's rows (src/modules/m8/server/matching.ts).
 * Rows written by the retired consortium scorer (src/lib/scoring/consortium.ts, before
 * K-579560) stay in the table until their seat is matched again, but they are not
 * shown: their dimensions are not the rule's dimensions, so they would read as a
 * different ranking. Pure function, so the consortium page and a test share it.
 */

import { seatBreakdownWriter } from '@/lib/scoring/seat-dimension-scale';

export function visibleSeatCandidates<T extends { breakdown?: unknown }>(rows: readonly T[]): T[] {
  return rows.filter((row) => {
    const writer = seatBreakdownWriter(row.breakdown);
    return writer === 'match' || writer === 'match-legacy';
  });
}
