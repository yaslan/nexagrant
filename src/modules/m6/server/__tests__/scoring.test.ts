/**
 * M6 Evaluator Lens — Scoring logic tests.
 *
 * TASK-MTQ2L2XN88AJN: Comprehensive unit tests for panel scoring,
 * consensus detection, and ESR comparison.
 * 10+ test cases covering consensus rules, divergence, and calibration.
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePanelScore,
  calculateConsensusOutcome,
  compareWithEsr,
  storedPanelAverage,
  PANEL_SCALE_MIN,
  ReviewerScores,
} from '../scoring';

describe('M6 Scoring Logic', () => {
  // ───────── Helper: standard criterion weights (4 criteria)
  const standardWeights = {
    crit1: 0.3, // Innovation
    crit2: 0.2, // Feasibility
    crit3: 0.3, // Impact
    crit4: 0.2, // Communication
  };

  // ───────── TEST 1: Basic panel average calculation
  it('should calculate weighted panel average correctly', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 5, crit2: 5, crit3: 5, crit4: 5 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    // Expected: unweighted avg is 4.5, but let's verify weighted
    // Innovation: (5+4)/2 = 4.5 * 0.3 = 1.35
    // Feasibility: (5+4)/2 = 4.5 * 0.2 = 0.9
    // Impact: (5+4)/2 = 4.5 * 0.3 = 1.35
    // Communication: (5+4)/2 = 4.5 * 0.2 = 0.9
    // Total: 4.5
    expect(result.panelAverage).toBeCloseTo(4.5, 1);
    expect(result.reviewerCount).toBe(2);
    expect(result.criterionAverages.crit1).toBeCloseTo(4.5, 1);
  });

  // ───────── TEST 2: Low scores panel average
  it('should handle low scores correctly', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 1, crit2: 1, crit3: 1, crit4: 1 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 2, crit2: 1, crit3: 2, crit4: 1 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.panelAverage).toBeGreaterThan(1);
    expect(result.panelAverage).toBeLessThan(2);
    expect(result.reviewerCount).toBe(2);
  });

  // ───────── TEST 3: Single reviewer (edge case)
  it('should handle single reviewer', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 3, crit2: 4, crit3: 3, crit4: 2 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    // Weighted: 3*0.3 + 4*0.2 + 3*0.3 + 2*0.2 = 0.9 + 0.8 + 0.9 + 0.4 = 3.0
    expect(result.panelAverage).toBeCloseTo(3.0, 1);
    // One reviewer produces a score but not a consensus: there is no second opinion to
    // agree with. This asserted 'solid' before, which reported unanimous agreement on
    // a panel of one.
    expect(result.consensusOutcome).toBe('not-measured');
    expect(result.agreementPercentage).toBeNull();
  });

  // ───────── TEST 4: High consensus (all reviewers similar)
  it('should detect solid consensus when reviewers agree', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 4, crit2: 5, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r3',
        scores: { crit1: 5, crit2: 4, crit3: 5, crit4: 4 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.consensusOutcome).toBe('solid');
    expect(result.agreementPercentage).toBeGreaterThanOrEqual(70);
  });

  // ───────── TEST 5: Low consensus (divergent reviewers)
  it('should detect divergent consensus when reviewers disagree', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 5, crit2: 5, crit3: 5, crit4: 5 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 1, crit2: 1, crit3: 1, crit4: 1 },
      },
      {
        reviewerId: 'r3',
        scores: { crit1: 5, crit2: 1, crit3: 5, crit4: 1 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.consensusOutcome).toBe('divergent');
    expect(result.agreementPercentage).toBeLessThan(70);
  });

  // ───────── TEST 6: Consensus boundary (≈70%)
  it('should classify consensus at 70% boundary', () => {
    // 3 reviewers: 1 pair within 1 point (1 out of 3 pairs = 33%, divergent)
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 3, crit2: 3, crit3: 3, crit4: 3 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 3, crit2: 3, crit3: 3, crit4: 3 },
      },
      {
        reviewerId: 'r3',
        scores: { crit1: 1, crit2: 1, crit3: 1, crit4: 1 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.consensusOutcome).toBe('divergent');
  });

  // ───────── TEST 7: Consensus with 70%+ agreement
  it('should classify solid at 70%+ agreement', () => {
    // 4 reviewers, all within 1 point of each other: 6 pairs all agree = 100%
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r3',
        scores: { crit1: 4, crit2: 5, crit3: 4, crit4: 5 },
      },
      {
        reviewerId: 'r4',
        scores: { crit1: 3, crit2: 4, crit3: 3, crit4: 4 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.consensusOutcome).toBe('solid');
    expect(result.agreementPercentage).toBeGreaterThanOrEqual(70);
  });

  // ───────── TEST 8: ESR comparison — panel higher than ESR
  it('should compare panel score higher than ESR', () => {
    const panelScore = 4.5;
    const esrScores = { total: 10, threshold: 12, outcome: 'not_recommended' };

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.panelScore).toBe(4.5);
    expect(result.esrScore).toBeDefined();
    expect(result.esrScoreHigher).toBe(false); // Panel is higher
    expect(result.deltaAbsolute).toBeLessThan(0);
  });

  // ───────── TEST 9: ESR comparison — ESR higher than panel
  it('should compare ESR score higher than panel', () => {
    const panelScore = 2.0;
    const esrScores = { total: 14, threshold: 12, outcome: 'recommended' };

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.panelScore).toBe(2.0);
    expect(result.esrScore).toBeDefined();
    expect(result.esrScoreHigher).toBe(true); // ESR is higher
    expect(result.deltaAbsolute).toBeGreaterThan(0);
  });

  // ───────── TEST 10: ESR comparison — agreement within 0.5
  it('should mark agreement when delta ≤ 0.5', () => {
    const panelScore = 4.0;
    const esrScores = { total: 15, threshold: 12, outcome: 'recommended' };
    // ESR normalized: (15/15)*4 + 1 = 5
    // Panel: 4
    // Delta: 5 - 4 = 1 (not within 0.5, so no agreement)

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.agreement).toBe(false);
  });

  // ───────── TEST 11: ESR comparison — agreement achieved
  it('should mark agreement when delta within threshold', () => {
    const panelScore = 4.75;
    const esrScores = { total: 14.25, threshold: 12, outcome: 'recommended' };
    // ESR normalized: (14.25/15)*4 + 1 ≈ 4.8
    // Panel: 4.75
    // Delta: 0.05 (within 0.5, agreement = true)

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.agreement).toBe(true);
  });

  // ───────── TEST 12: ESR null handling
  it('should handle null ESR scores gracefully', () => {
    const panelScore = 3.5;
    const esrScores = null;

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.panelScore).toBe(3.5);
    expect(result.esrScore).toBeNull();
    expect(result.agreement).toBe(false);
  });

  // ───────── TEST 13: Empty reviewer scores error
  it('should report an empty reviewer list as unmeasured, not as a score', () => {
    const reviewers: ReviewerScores[] = [];

    // This used to throw. A panel nobody has scored is an ordinary state of the board,
    // so it is returned as one; the caller must not be able to mistake it for a number.
    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.panelAverage).toBeNull();
    expect(result.panelAverage).not.toBe(0);
    expect(result.unmeasuredReason).toBe('no-submitted-marks');
    expect(result.consensusOutcome).toBe('not-measured');
    expect(result.reviewerCount).toBe(0);
  });

  // ───────── TEST 14: Criterion weight variations
  it('should apply criterion weights correctly in weighted average', () => {
    // All reviewers give same score per criterion
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 5, crit2: 1, crit3: 5, crit4: 1 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    // Weighted: 5*0.3 + 1*0.2 + 5*0.3 + 1*0.2 = 1.5 + 0.2 + 1.5 + 0.2 = 3.4
    expect(result.panelAverage).toBeCloseTo(3.4, 1);
  });

  // ───────── TEST 15: Multiple reviewers with partial submissions
  it('should handle reviewers with varying scores across criteria', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 5, crit2: 4, crit3: 5, crit4: 3 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 4, crit2: 5, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r3',
        scores: { crit1: 5, crit2: 4, crit3: 5, crit4: 4 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.panelAverage).toBeGreaterThan(4);
    expect(result.panelAverage).toBeLessThanOrEqual(5);
    expect(result.reviewerCount).toBe(3);
    expect(Object.keys(result.criterionAverages).length).toBe(4);
  });

  // ───────---- TEST 16: Direct consensus outcome function
  it('should calculate consensus outcome directly', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 5, crit2: 5, crit3: 5, crit4: 5 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
    ];

    const outcome = calculateConsensusOutcome(reviewers);

    expect(outcome.outcome).toBe('solid');
    expect(outcome.agreementPercentage).toBeGreaterThanOrEqual(70);
  });

  // ───────── TEST 17: ESR delta percentage calculation
  it('should calculate ESR delta percentage', () => {
    const panelScore = 3.0;
    const esrScores = { total: 12, threshold: 12, outcome: 'not_recommended' };
    // ESR normalized: (12/15)*4 + 1 = 4.2
    // Delta: 4.2 - 3.0 = 1.2
    // Percent: (1.2 / 4.2) * 100 ≈ 28.6%

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.deltaPercent).toBeDefined();
    expect(result.deltaPercent).toBeGreaterThan(0);
    expect(result.deltaPercent).toBeLessThan(50);
  });

  // ───────── TEST 18: Panel average with unequal weights
  it('should respect custom criterion weights', () => {
    const customWeights = {
      crit1: 0.5, // double weight
      crit2: 0.2,
      crit3: 0.2,
      crit4: 0.1,
    };

    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 5, crit2: 1, crit3: 1, crit4: 1 },
      },
    ];

    const result = calculatePanelScore(reviewers, customWeights);

    // Weighted: 5*0.5 + 1*0.2 + 1*0.2 + 1*0.1 = 2.5 + 0.2 + 0.2 + 0.1 = 3.0
    expect(result.panelAverage).toBeCloseTo(3.0, 1);
  });

  // ───────── TEST 19: ESR score zero edge case
  it('should handle ESR score of zero', () => {
    const panelScore = 3.0;
    const esrScores = { total: 0, threshold: 12, outcome: 'not_recommended' };

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.esrScore).toBeCloseTo(1, 1); // (0/15)*4 + 1 = 1
    expect(result.deltaPercent).not.toBeNull();
  });

  // ───────── TEST 20: Malformed ESR JSON handling
  it('should handle malformed ESR JSON gracefully', () => {
    const panelScore = 3.5;
    const esrScores = { invalid: 'data' } as unknown as Record<string, unknown>;

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.esrScore).toBeNull();
    expect(result.panelScore).toBe(3.5);
  });

  // ───────── TEST 21: Score distribution edge case (all same score)
  it('should track score distribution with all same scores', () => {
    // This test verifies the logic without DB; in production the DB query
    // would return multiple Score rows with the same value
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r3',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    // All reviewers gave 4 across all criteria
    expect(result.panelAverage).toBeCloseTo(4.0, 1);
    expect(result.criterionAverages.crit1).toBe(4);
    expect(result.consensusOutcome).toBe('solid');
  });

  // ───────── TEST 22: Consensus with 2 reviewers
  it('should classify consensus correctly with 2 reviewers', () => {
    const reviewers: ReviewerScores[] = [
      {
        reviewerId: 'r1',
        scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 },
      },
      {
        reviewerId: 'r2',
        scores: { crit1: 5, crit2: 5, crit3: 5, crit4: 5 },
      },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    // 2 reviewers, 1 pair: within 1 point = 100% agreement
    expect(result.consensusOutcome).toBe('solid');
    expect(result.agreementPercentage).toBe(100);
  });

  // ───────── TEST 23: ESR range edge case (minimum score)
  it('should handle minimum ESR score', () => {
    const panelScore = 1.5;
    const esrScores = { total: 0.5, threshold: 12, outcome: 'not_recommended' };

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.esrScore).toBeDefined();
    expect(result.esrScore).toBeGreaterThanOrEqual(1); // Clamped to min
  });

  // ───────── TEST 24: ESR range edge case (maximum score)
  it('should handle maximum ESR score', () => {
    const panelScore = 5.0;
    const esrScores = { total: 15, threshold: 12, outcome: 'recommended' };

    const result = compareWithEsr(panelScore, esrScores);

    expect(result.esrScore).toBeDefined();
    expect(result.esrScore).toBeLessThanOrEqual(5); // Clamped to max
    expect(result.agreement).toBe(true); // 5.0 and 5.0 agree
  });
});

/**
 * The rule these pin: a panel score that could not be computed is absent, never 0.
 *
 * A panel is marked 1..5, so 0 is off the scale entirely — but it is also what a
 * `?? 0` or a `: 0` fallback produces, and once it reaches `Evaluation.avgScore` the
 * dashboard renders "0.00" beside a red delta and the proposal reads as the worst-
 * scored one in the workspace. Nobody scored it at all. Every case below is one route
 * by which that zero used to be manufactured (CLAUDE.md §7).
 */
describe('M6 Scoring — the not-measured contract', () => {
  const standardWeights = {
    crit1: 0.3,
    crit2: 0.2,
    crit3: 0.3,
    crit4: 0.2,
  };

  it('returns no score when the marks land on no weighted criterion', () => {
    // The reviewer scored axes that carry no weight in this evaluation — a real shape,
    // since an evaluation's criteria are rows in `Criterion` and may be re-cut while a
    // review is open. There is nothing to average, so there is no average.
    const reviewers: ReviewerScores[] = [
      { reviewerId: 'r1', scores: { unknownAxis: 5 } },
      { reviewerId: 'r2', scores: { unknownAxis: 4 } },
    ];

    const result = calculatePanelScore(reviewers, standardWeights);

    expect(result.panelAverage).toBeNull();
    expect(result.panelAverage).not.toBe(0);
    expect(result.unmeasuredReason).toBe('no-weighted-criterion');
  });

  it('returns no score when every weight is zero', () => {
    const reviewers: ReviewerScores[] = [
      { reviewerId: 'r1', scores: { crit1: 5, crit2: 5 } },
      { reviewerId: 'r2', scores: { crit1: 5, crit2: 5 } },
    ];

    const result = calculatePanelScore(reviewers, { crit1: 0, crit2: 0 });

    // Two reviewers both scoring 5 must never come out as 0.
    expect(result.panelAverage).toBeNull();
    expect(result.unmeasuredReason).toBe('no-weighted-criterion');
  });

  it('sets unmeasuredReason exactly when the average is missing', () => {
    const scored = calculatePanelScore(
      [
        { reviewerId: 'r1', scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 } },
        { reviewerId: 'r2', scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 } },
      ],
      standardWeights,
    );

    expect(scored.panelAverage).toBeCloseTo(4.0, 5);
    expect(scored.unmeasuredReason).toBeNull();
  });

  it('reports one reviewer as no consensus rather than as unanimity', () => {
    const outcome = calculateConsensusOutcome([
      { reviewerId: 'r1', scores: { crit1: 5, crit2: 5, crit3: 5, crit4: 5 } },
    ]);

    expect(outcome.outcome).toBe('not-measured');
    expect(outcome.agreementPercentage).toBeNull();
  });

  it('reports zero reviewers as no consensus', () => {
    const outcome = calculateConsensusOutcome([]);

    expect(outcome.outcome).toBe('not-measured');
    expect(outcome.agreementPercentage).toBeNull();
  });

  it('still measures consensus from two reviewers upward', () => {
    const outcome = calculateConsensusOutcome([
      { reviewerId: 'r1', scores: { crit1: 2 } },
      { reviewerId: 'r2', scores: { crit1: 5 } },
    ]);

    // 3 points apart: the one pair disagrees, so 0% and divergent — a measured verdict,
    // which is the point. `not-measured` is only for the absence of any pair.
    expect(outcome.outcome).toBe('divergent');
    expect(outcome.agreementPercentage).toBe(0);
  });

  it('rejects a stored average that is off the panel scale', () => {
    // Rows written before the `: 0` fallback was removed still hold 0. A weighted mean
    // of marks that are each ≥ 1 cannot be below 1, so such a row was never computed
    // from anybody's marks and must not be shown as a score.
    expect(storedPanelAverage(0)).toBeNull();
    expect(storedPanelAverage(0.4)).toBeNull();
    expect(storedPanelAverage(null)).toBeNull();
    expect(storedPanelAverage(undefined)).toBeNull();
    expect(storedPanelAverage(Number.NaN)).toBeNull();
  });

  it('keeps a genuinely low stored average', () => {
    // The guard must not swallow a real bad score: a panel that everyone marked 1 is a
    // measured 1.0 and has to keep saying so.
    expect(storedPanelAverage(PANEL_SCALE_MIN)).toBe(1);
    expect(storedPanelAverage(1.25)).toBe(1.25);
    expect(storedPanelAverage(4.75)).toBe(4.75);
  });
});

/**
 * The pair denominator in `calculateConsensusOutcome`.
 *
 * Consensus is counted over every unordered pair of reviewer averages in a bounded
 * nested loop. Under `noUncheckedIndexedAccess` both index reads are `number | undefined`,
 * and a guard placed one line too early — skipping the iteration before `totalPairs++`
 * rather than after — silently shrinks the denominator and turns a divergent panel into a
 * solid one. Two reviewers give one pair, which the cases above already cover; only three
 * or more make the denominator visible, so these pin it.
 */
describe('M6 Scoring — consensus counts every reviewer pair', () => {
  it('counts all three pairs of a three-reviewer panel', () => {
    // Averages 2, 3, 5. Pairs: (2,3) agree, (2,5) no, (3,5) no → 1/3 = 33.33%.
    const outcome = calculateConsensusOutcome([
      { reviewerId: 'r1', scores: { crit1: 2 } },
      { reviewerId: 'r2', scores: { crit1: 3 } },
      { reviewerId: 'r3', scores: { crit1: 5 } },
    ]);

    expect(outcome.outcome).toBe('divergent');
    expect(outcome.agreementPercentage).toBeCloseTo(100 / 3, 5);
    // A denominator of 1 or 2 instead of 3 would read 100% or 50% here.
    expect(outcome.agreementPercentage).not.toBeCloseTo(50, 5);
    expect(outcome.agreementPercentage).not.toBe(100);
  });

  it('counts all six pairs of a four-reviewer panel', () => {
    // Averages 4, 4, 4, 1. Pairs: three among the 4s agree, three against the 1 do not
    // → 3/6 = 50%, below the 70% bar.
    const outcome = calculateConsensusOutcome([
      { reviewerId: 'r1', scores: { crit1: 4 } },
      { reviewerId: 'r2', scores: { crit1: 4 } },
      { reviewerId: 'r3', scores: { crit1: 4 } },
      { reviewerId: 'r4', scores: { crit1: 1 } },
    ]);

    expect(outcome.agreementPercentage).toBeCloseTo(50, 5);
    expect(outcome.outcome).toBe('divergent');
  });

  it('reports a unanimous three-reviewer panel as solid at exactly 100%', () => {
    const outcome = calculateConsensusOutcome([
      { reviewerId: 'r1', scores: { crit1: 4 } },
      { reviewerId: 'r2', scores: { crit1: 4 } },
      { reviewerId: 'r3', scores: { crit1: 4 } },
    ]);

    expect(outcome.outcome).toBe('solid');
    expect(outcome.agreementPercentage).toBe(100);
    // Never NaN: a dropped pair with a kept denominator, or an undefined average
    // reaching Math.abs, both surface here.
    expect(Number.isNaN(outcome.agreementPercentage ?? Number.NaN)).toBe(false);
  });
});

/**
 * A reviewer who has submitted no marks is not a dissenting reviewer.
 *
 * `Object.values({}).reduce(sum) / 0` is `NaN`, and `NaN` never reaches a screen —
 * `Math.abs(NaN - x) <= 1` is simply `false`, so the empty reviewer is silently
 * counted as a person who agrees with nobody. The output is not a visible `NaN` but a
 * plausible wrong number: a unanimous panel is reported at 33.33% and `divergent`, and
 * a panel where exactly one person voted is reported as a disagreement between two.
 * That is the same fabrication the `not-measured` outcome was introduced to stop, one
 * layer down (CLAUDE.md §7: no ratio without a record, and an empty `scores` object is
 * the absence of a record).
 *
 * Excluded rather than counted as 0: a mark is 1..5, so 0 is off the scale, and
 * `getPanelScoresForProposal` already drops these reviewers before calling in — the
 * rule exists, it just lived in one caller's memory instead of in the function.
 */
describe('M6 Scoring — a reviewer with no marks is not seated', () => {
  const standardWeights = { crit1: 0.3, crit2: 0.2, crit3: 0.3, crit4: 0.2 };
  const five = (id: string): ReviewerScores => ({
    reviewerId: id,
    scores: { crit1: 5, crit2: 5, crit3: 5, crit4: 5 },
  });

  it('does not let an unmarked reviewer turn a unanimous panel divergent', () => {
    const outcome = calculateConsensusOutcome([five('r1'), five('r2'), { reviewerId: 'r3', scores: {} }]);

    // Two people voted, identically. The verdict is about those two.
    expect(outcome.outcome).toBe('solid');
    expect(outcome.agreementPercentage).toBe(100);
  });

  it('reports one real reviewer plus an unmarked one as not measured', () => {
    // Only r1 voted. Calling this `divergent` asserts two people disagreed.
    const outcome = calculateConsensusOutcome([
      { reviewerId: 'r1', scores: { crit1: 4, crit2: 4, crit3: 4, crit4: 4 } },
      { reviewerId: 'r2', scores: {} },
    ]);

    expect(outcome.outcome).toBe('not-measured');
    expect(outcome.agreementPercentage).toBeNull();
  });

  it('reports a panel where nobody has marked anything as no-submitted-marks', () => {
    // The dashboard names which absence it is looking at. `no-weighted-criterion`
    // tells the owner "marks exist but land off the weighted axes" — here no mark exists.
    const result = calculatePanelScore(
      [
        { reviewerId: 'r1', scores: {} },
        { reviewerId: 'r2', scores: {} },
      ],
      standardWeights,
    );

    expect(result.panelAverage).toBeNull();
    expect(result.unmeasuredReason).toBe('no-submitted-marks');
    expect(result.consensusOutcome).toBe('not-measured');
    expect(result.agreementPercentage).toBeNull();
    expect(result.reviewerCount).toBe(0);
  });

  it('keeps the score of the reviewers who did mark, and counts only them', () => {
    const result = calculatePanelScore([five('r1'), five('r2'), { reviewerId: 'r3', scores: {} }], standardWeights);

    expect(result.panelAverage).toBeCloseTo(5, 5);
    expect(result.reviewerCount).toBe(2);
    expect(result.consensusOutcome).toBe('solid');
    expect(result.agreementPercentage).toBe(100);
  });

  it('never produces NaN from an unmarked reviewer', () => {
    for (const roster of [
      [{ reviewerId: 'r1', scores: {} }],
      [
        { reviewerId: 'r1', scores: {} },
        { reviewerId: 'r2', scores: {} },
      ],
      [five('r1'), { reviewerId: 'r2', scores: {} }],
    ] as ReviewerScores[][]) {
      const { agreementPercentage } = calculateConsensusOutcome(roster);
      expect(Number.isNaN(agreementPercentage ?? 0)).toBe(false);
      const panel = calculatePanelScore(roster, standardWeights);
      expect(Number.isNaN(panel.panelAverage ?? 0)).toBe(false);
      expect(Number.isNaN(panel.agreementPercentage ?? 0)).toBe(false);
    }
  });
});
