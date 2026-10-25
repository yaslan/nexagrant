import { describe, expect, it, vi } from 'vitest';

import { consortiumSeatScore, consortiumWeights } from '@/lib/scoring/consortium';
import { normalizedWeights } from '@/lib/scoring/live-demand';
import { normalizeSeatScore, SEAT_SCORE_MAX } from '@/lib/scoring/seat-score';
import { planSeatRescore, type StoredSeatCandidate } from '@/lib/scoring/seat-rescore';
import {
  MATCH_MAX_TOTAL,
  matchSeatScore,
  scoreCandidate,
  totalScore,
  type CandidateSignals,
} from '@/modules/m8/server/matching';

/**
 * FO-147 — `SeatCandidate.score` is written by two scorers and must be one
 * 0–100 scale. Both go through `normalizeSeatScore`; the rescore re-derives
 * stored rows of all three old scales from their breakdown.
 */

vi.mock('@/lib/env', () => ({ consortiumLiveDemandWeight: undefined }));

const weights = consortiumWeights();

const SIGNALS: CandidateSignals = {
  participationCount: 0,
  coordinatorCount: 0,
  country: 'FR',
  takenCountries: new Set<string>(),
  sharedProjects: 0,
  warmth: null,
  degree: 0,
  isRival: false,
};

const MAX_CONSORTIUM = {
  topicExperience: 3,
  networkCentrality: 3,
  countryDiversity: 1.5,
  smeBonus: 1,
  warmthBonus: 1.5,
};

describe('normalizeSeatScore', () => {
  it('maps a 0–1 fraction to 0–100 with two decimals', () => {
    expect(normalizeSeatScore(0)).toBe(0);
    expect(normalizeSeatScore(1)).toBe(SEAT_SCORE_MAX);
    expect(normalizeSeatScore(45.2 / 90)).toBe(50.22);
  });

  it('clamps below 0 and above 100, and scores a non-finite fraction 0', () => {
    expect(normalizeSeatScore(-0.1)).toBe(0);
    expect(normalizeSeatScore(1.4)).toBe(100);
    expect(normalizeSeatScore(Number.NaN)).toBe(0);
    expect(normalizeSeatScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('both scorers write the same 0–100 scale', () => {
  it('the matcher: full marks is 100, nothing is 0, MATCH_MAX_TOTAL is the real maximum', () => {
    const best = scoreCandidate({
      ...SIGNALS,
      participationCount: 10,
      coordinatorCount: 5,
      sharedProjects: 10,
      warmth: 'hot',
      degree: 1_000,
    });
    expect(totalScore(best)).toBe(MATCH_MAX_TOTAL);
    expect(matchSeatScore(best)).toBe(100);
    expect(matchSeatScore(scoreCandidate({ ...SIGNALS, takenCountries: new Set(['FR']) }))).toBe(0);
  });

  it('the matcher: a rival penalty below 0 is clamped to 0, never negative', () => {
    const rival = scoreCandidate({ ...SIGNALS, takenCountries: new Set(['FR']), isRival: true });
    expect(totalScore(rival)).toBe(-10);
    expect(matchSeatScore(rival)).toBe(0);
  });

  it('the matcher: the 0–100 score keeps the raw order', () => {
    const raws = [0, 5, 20, 45.2, 60, 89.9].map((points) => ({
      ...scoreCandidate({ ...SIGNALS, takenCountries: new Set(['FR']) }),
      topicExperience: points,
    }));
    const scores = raws.map(matchSeatScore);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
    expect(new Set(scores).size).toBe(scores.length);
  });

  it('the consortium builder: 0–100 at every live-demand weight', () => {
    for (const w of [0, 0.15, 0.5, 1]) {
      const ws = normalizedWeights(w);
      expect(consortiumSeatScore(MAX_CONSORTIUM, 1, ws)).toBe(100);
      expect(
        consortiumSeatScore(
          { topicExperience: 0, networkCentrality: 0, countryDiversity: 0, smeBonus: 0, warmthBonus: 0 },
          0,
          ws,
        ),
      ).toBe(0);
    }
  });
});

describe('planSeatRescore', () => {
  const OLD_CONSORTIUM = { ...MAX_CONSORTIUM, smeBonus: 0, total: 9 }; // pre-FO-63 0–10 sum
  const rows: StoredSeatCandidate[] = [
    // Seat A: written by the old consortium builder, 0–10.
    { id: 'a1', seatId: 'A', score: 9, rank: 1, breakdown: OLD_CONSORTIUM },
    {
      id: 'a2',
      seatId: 'A',
      score: 3,
      rank: 2,
      breakdown: { topicExperience: 0, networkCentrality: 3, countryDiversity: 0, smeBonus: 0, warmthBonus: 0, total: 3 },
    },
    // Seat B: written by the matcher, raw points.
    { id: 'b1', seatId: 'B', score: 45.2, rank: 1, breakdown: scoreCandidate({ ...SIGNALS, participationCount: 2, coordinatorCount: 1, sharedProjects: 2, degree: 2 }) },
    { id: 'b2', seatId: 'B', score: -10, rank: 2, breakdown: scoreCandidate({ ...SIGNALS, takenCountries: new Set(['FR']), isRival: true }) },
    // Seat C: a breakdown neither scorer wrote.
    { id: 'c1', seatId: 'C', score: 7, rank: 1, breakdown: { something: 'else' } },
  ];

  it('re-derives every scale onto 0–100 and keeps the matcher order', () => {
    const plan = planSeatRescore(rows, weights);
    const byId = new Map(plan.rows.map((r) => [r.id, r]));

    expect(byId.get('a1')?.after.score).toBe(consortiumSeatScore(OLD_CONSORTIUM, 0, weights));
    expect(byId.get('a1')?.breakdown.total).toBe(byId.get('a1')?.after.score);
    expect(byId.get('b1')?.after).toEqual({ score: 50.22, rank: 1 });
    expect(byId.get('b2')?.after).toEqual({ score: 0, rank: 2 });
    for (const r of plan.rows) {
      expect(r.after.score).toBeGreaterThanOrEqual(0);
      expect(r.after.score).toBeLessThanOrEqual(100);
    }
    expect(plan.skippedSeats).toEqual([{ seatId: 'C', rowIds: ['c1'] }]);
  });

  it('is idempotent: applying the plan and planning again changes nothing', () => {
    const first = planSeatRescore(rows, weights);
    expect(first.rows.filter((r) => r.changed).length).toBe(4);

    const applied: StoredSeatCandidate[] = rows.map((row) => {
      const r = first.rows.find((p) => p.id === row.id);
      return r ? { ...row, score: r.after.score, rank: r.after.rank, breakdown: r.breakdown } : row;
    });
    const second = planSeatRescore(applied, weights);
    expect(second.rows.filter((r) => r.changed)).toEqual([]);
    expect(second.skippedSeats).toEqual(first.skippedSeats);
  });

  it('re-ranks a seat when the new score reorders it', () => {
    // Under the 0–100 weights topic experience (0.255) outweighs SME (0.085) +
    // warmth (0.1275), whatever the old 0–10 sum ranked first.
    const seat: StoredSeatCandidate[] = [
      { id: 'x', seatId: 'S', score: 2.5, rank: 1, breakdown: { topicExperience: 0, networkCentrality: 0, countryDiversity: 0, smeBonus: 1, warmthBonus: 1.5, total: 2.5 } },
      { id: 'y', seatId: 'S', score: 3, rank: 2, breakdown: { topicExperience: 3, networkCentrality: 0, countryDiversity: 0, smeBonus: 0, warmthBonus: 0, total: 3 } },
    ];
    // (y was rank 2 despite the higher sum: an inconsistent old row.)
    const plan = planSeatRescore(seat, weights);
    expect(plan.rows.map((r) => [r.id, r.after.rank])).toEqual([
      ['y', 1],
      ['x', 2],
    ]);
  });
});
