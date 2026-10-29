/**
 * FO-147 — re-derive stored `SeatCandidate` scores on the one 0–100 seat scale.
 *
 * Rows already in the table carry three scales: the consortium builder's
 * pre-FO-63 0–10 sum, its 0–100 weighted total, and the seat matcher's raw
 * −10…90 points. Every row keeps the per-dimension breakdown it was scored from,
 * so the score is recomputed from that breakdown through the scorer that wrote
 * it — not rescaled by a factor guessed here:
 *
 *   matcher breakdown    (geographicBalance, collabHistory, …) → matchSeatScore
 *   consortium breakdown (networkCentrality, countryDiversity, …) → consortiumSeatScore,
 *                        liveDemandSignal 0 when the row predates it
 *
 * The result is a pure function of the stored breakdown (and the configured
 * consortium weights), so a second run changes nothing. Ranks are re-derived per
 * seat from the new scores, ties kept in their old order. A seat holding a row
 * whose breakdown neither scorer wrote is left untouched and reported.
 */

import type { Prisma } from '@prisma/client';

import { consortiumSeatScore, type ConsortiumDimensions } from '@/lib/scoring/consortium';
import type { LiveDemandWeights } from '@/lib/scoring/live-demand';
import { seatBreakdownWriter } from '@/lib/scoring/seat-dimension-scale';
import { matchSeatScore, type MatchBreakdown } from '@/modules/m8/server/matching';

export interface StoredSeatCandidate {
  id: string;
  seatId: string;
  score: number;
  rank: number;
  breakdown: unknown;
}

export interface SeatCandidateRescore {
  id: string;
  seatId: string;
  before: { score: number; rank: number };
  after: { score: number; rank: number };
  /** The breakdown to store; differs from the old one only in a consortium row's `total`. */
  breakdown: Prisma.InputJsonObject;
  changed: boolean;
}

export interface SeatRescorePlan {
  rows: SeatCandidateRescore[];
  /** Seats left as they are because a row's breakdown matched neither scorer. */
  skippedSeats: { seatId: string; rowIds: string[] }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The 0–100 score of one stored breakdown, or null when neither scorer wrote it. */
export function rescoreBreakdown(
  breakdown: unknown,
  weights: LiveDemandWeights
): { score: number; breakdown: Prisma.InputJsonObject } | null {
  if (!isRecord(breakdown)) return null;
  // Read back from the `breakdown` JSON column, so every value in it is JSON.
  const stored = breakdown as Prisma.InputJsonObject;
  // The one place that tells the writers apart (seat-dimension-scale.ts), shared with the UI.
  const writer = seatBreakdownWriter(breakdown);
  if (writer === 'match') {
    return { score: matchSeatScore(breakdown as MatchBreakdown), breakdown: stored };
  }
  if (writer === 'consortium') {
    const signal = typeof breakdown.liveDemandSignal === 'number' ? breakdown.liveDemandSignal : 0;
    const score = consortiumSeatScore(breakdown as unknown as ConsortiumDimensions, signal, weights);
    return { score, breakdown: { ...stored, total: score } };
  }
  return null;
}

export function planSeatRescore(
  rows: readonly StoredSeatCandidate[],
  weights: LiveDemandWeights
): SeatRescorePlan {
  const bySeat = new Map<string, StoredSeatCandidate[]>();
  for (const row of rows) bySeat.set(row.seatId, [...(bySeat.get(row.seatId) ?? []), row]);

  const plan: SeatRescorePlan = { rows: [], skippedSeats: [] };
  for (const [seatId, seatRows] of bySeat) {
    const scored = seatRows.map((row) => ({ row, result: rescoreBreakdown(row.breakdown, weights) }));
    const scorable = scored.flatMap(({ row, result }) => (result ? [{ row, result }] : []));
    if (scorable.length < scored.length) {
      plan.skippedSeats.push({
        seatId,
        rowIds: scored.filter((s) => s.result === null).map((s) => s.row.id),
      });
      continue;
    }

    scorable.sort((a, b) => b.result.score - a.result.score || a.row.rank - b.row.rank);
    scorable.forEach(({ row, result }, index) => {
      const after = { score: result.score, rank: index + 1 };
      const oldTotal = isRecord(row.breakdown) ? row.breakdown.total : undefined;
      const changed =
        after.score !== row.score ||
        after.rank !== row.rank ||
        ('total' in result.breakdown && oldTotal !== after.score);
      plan.rows.push({
        id: row.id,
        seatId,
        before: { score: row.score, rank: row.rank },
        after,
        breakdown: result.breakdown,
        changed,
      });
    });
  }
  return plan;
}
