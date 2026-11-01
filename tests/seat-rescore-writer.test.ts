import { describe, expect, it } from 'vitest';

import { consortiumWeights } from '@/lib/scoring/consortium';
import { CONSORTIUM_DIMENSION_MAX, MATCH_DIMENSION_SCALE, seatBreakdownWriter } from '@/lib/scoring/seat-dimension-scale';
import { rescoreBreakdown } from '@/lib/scoring/seat-rescore';

/**
 * FO-158 — the rescore takes "which scorer wrote this breakdown" from `seatBreakdownWriter`
 * (the UI's single source). The old rescore-side rule is kept here as the reference, so a
 * change in either place shows up as a disagreement across every key combination.
 */

const OLD_MATCH_KEYS = [
  'topicExperience',
  'geographicBalance',
  'collabHistory',
  'relationshipWarmth',
  'centrality',
  'rivalRisk',
];
const OLD_CONSORTIUM_KEYS = ['topicExperience', 'networkCentrality', 'countryDiversity', 'smeBonus', 'warmthBonus'];

function oldHasNumbers(b: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((k) => typeof b[k] === 'number' && Number.isFinite(b[k]));
}

/** The pre-FO-158 rule, verbatim: matcher keys first, then consortium keys. */
function oldWriter(breakdown: unknown): 'match' | 'consortium' | null {
  if (typeof breakdown !== 'object' || breakdown === null || Array.isArray(breakdown)) return null;
  const b = breakdown as Record<string, unknown>;
  if (oldHasNumbers(b, OLD_MATCH_KEYS)) return 'match';
  if (oldHasNumbers(b, OLD_CONSORTIUM_KEYS)) return 'consortium';
  return null;
}

const ALL_KEYS = [...new Set([...OLD_MATCH_KEYS, ...OLD_CONSORTIUM_KEYS])];

describe('seatBreakdownWriter is the rescore rule (FO-158 equality table)', () => {
  it('the scale key sets are the rule key sets', () => {
    expect(Object.keys(MATCH_DIMENSION_SCALE).sort()).toEqual([...OLD_MATCH_KEYS].sort());
    expect(Object.keys(CONSORTIUM_DIMENSION_MAX).sort()).toEqual([...OLD_CONSORTIUM_KEYS].sort());
  });

  it('agrees with the old rule on every subset of the dimension keys, numbers and non-numbers', () => {
    const cases = 1 << ALL_KEYS.length;
    for (let mask = 0; mask < cases; mask++) {
      const present = ALL_KEYS.filter((_, i) => mask & (1 << i));
      for (const bad of [null, 'x', Number.NaN, Number.POSITIVE_INFINITY]) {
        const numbers: Record<string, unknown> = Object.fromEntries(present.map((k) => [k, 1.5]));
        expect(seatBreakdownWriter(numbers), `keys ${present.join(',')}`).toBe(oldWriter(numbers));

        if (present.length > 0) {
          const withBad = { ...numbers, [present[0] as string]: bad };
          expect(seatBreakdownWriter(withBad), `keys ${present.join(',')} with ${String(bad)}`).toBe(
            oldWriter(withBad)
          );
        }
      }
    }
  });

  it('agrees on empty, non-object and array input', () => {
    for (const input of [undefined, null, 0, 'breakdown', [], [1, 2], {}, { total: 5 }]) {
      expect(seatBreakdownWriter(input)).toBe(oldWriter(input));
    }
  });
});

describe('rescoreBreakdown leaves a breakdown no scorer wrote alone', () => {
  const weights = consortiumWeights();

  it('returns null for an unknown breakdown', () => {
    expect(rescoreBreakdown({ total: 5 }, weights)).toBeNull();
    expect(rescoreBreakdown(null, weights)).toBeNull();
    expect(rescoreBreakdown([1], weights)).toBeNull();
  });

  it('scores a matcher breakdown to its exact 0–100 score, without touching its breakdown', () => {
    const matcher = { topicExperience: 35, geographicBalance: 15, collabHistory: 15, relationshipWarmth: 15, centrality: 10, rivalRisk: -10 };
    const result = rescoreBreakdown(matcher, weights);
    expect(result?.score).toBe(88.89);
    expect(result?.breakdown).toEqual(matcher);
  });

  it('a breakdown with both scorers\' keys is a matcher, so it is not given a consortium total', () => {
    const both = {
      topicExperience: 10,
      geographicBalance: 5,
      collabHistory: 0,
      relationshipWarmth: 0,
      centrality: 0,
      rivalRisk: 0,
      networkCentrality: 1,
      countryDiversity: 1,
      smeBonus: 0,
      warmthBonus: 0,
    };
    const result = rescoreBreakdown(both, weights);
    expect(result?.breakdown).toEqual(both);
    // The matcher sums every value it finds (totalScore): 10 + 5 + 1 + 1 = 17 of 90.
    expect(result?.score).toBe(18.89);
  });

  it('adds the recomputed total to a consortium breakdown', () => {
    const consortium = { topicExperience: 1, networkCentrality: 1, countryDiversity: 1, smeBonus: 0, warmthBonus: 0 };
    const result = rescoreBreakdown(consortium, weights);
    expect(result?.breakdown).toEqual({ ...consortium, total: result?.score });
  });
});
