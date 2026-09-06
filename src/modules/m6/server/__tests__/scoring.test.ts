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
    expect(result.consensusOutcome).toBe('solid');
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
  it('should throw error on empty reviewer list', () => {
    const reviewers: ReviewerScores[] = [];

    expect(() => calculatePanelScore(reviewers, standardWeights)).toThrow(
      'No reviewer scores',
    );
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
});
