import { describe, it, expect } from 'vitest';
import {
  scoreG0,
  decideG0,
  g0Contributions,
  baseRateToScore,
  DEFAULT_G0_RULES,
  SPEC_LITERAL_G0_RULES,
  DEFAULT_SCORING_WEIGHTS,
  type G0Features,
  type G0HardFacts,
  type G0Weights,
} from '../src/lib/scoring/g0-canonical';

describe('G0 Scoring — Canonical', () => {
  describe('baseRateToScore()', () => {
    it('maps 0% → 0', () => {
      expect(baseRateToScore(0)).toBe(0);
    });

    it('maps 20% → 100 (full marks)', () => {
      expect(baseRateToScore(20)).toBe(100);
    });

    it('maps 10% → 50', () => {
      expect(baseRateToScore(10)).toBe(50);
    });

    it('clamps > 100%', () => {
      expect(baseRateToScore(150)).toBe(100);
    });

    it('clamps negative', () => {
      expect(baseRateToScore(-5)).toBe(0);
    });
  });

  describe('scoreG0()', () => {
    const alignedFeatures: G0Features = {
      alignment: 85,
      baseRate: 75,
      coordinatorHistory: 90,
      researchAndEndUser: 80,
      networkCentrality: 70,
      budgetRoleEconomy: 85,
      lumpSumTwoStage: 60,
    };

    const poorFeatures: G0Features = {
      alignment: 30,
      baseRate: 20,
      coordinatorHistory: 25,
      researchAndEndUser: 40,
      networkCentrality: 15,
      budgetRoleEconomy: 35,
      lumpSumTwoStage: 10,
    };

    const zeroFeatures: G0Features = {
      alignment: 0,
      baseRate: 0,
      coordinatorHistory: 0,
      researchAndEndUser: 0,
      networkCentrality: 0,
      budgetRoleEconomy: 0,
      lumpSumTwoStage: 0,
    };

    const maxFeatures: G0Features = {
      alignment: 100,
      baseRate: 100,
      coordinatorHistory: 100,
      researchAndEndUser: 100,
      networkCentrality: 100,
      budgetRoleEconomy: 100,
      lumpSumTwoStage: 100,
    };

    it('calculates weighted composite score', () => {
      const score = scoreG0(alignedFeatures);
      expect(score).toBeGreaterThan(70); // Well-aligned should pass default threshold
      expect(score).toBeLessThanOrEqual(100);
    });

    it('returns 0–100 range', () => {
      expect(scoreG0(poorFeatures)).toBeGreaterThanOrEqual(0);
      expect(scoreG0(poorFeatures)).toBeLessThanOrEqual(100);
    });

    it('handles zero features', () => {
      expect(scoreG0(zeroFeatures)).toBe(0);
    });

    it('handles max features', () => {
      expect(scoreG0(maxFeatures)).toBe(100);
    });

    it('clamps individual features to [0, 100]', () => {
      const overflowFeatures: G0Features = {
        ...alignedFeatures,
        alignment: 150,
        baseRate: -50,
      };
      const score = scoreG0(overflowFeatures);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('normalizes weights that do not sum to 100', () => {
      const doubledWeights: G0Weights = {
        ...DEFAULT_SCORING_WEIGHTS,
        alignment: 60,
        baseRate: 30,
        coordinatorHistory: 30,
        researchAndEndUser: 24,
        networkCentrality: 20,
        budgetRoleEconomy: 20,
        lumpSumTwoStage: 16,
      };
      const scoreNormal = scoreG0(alignedFeatures, DEFAULT_SCORING_WEIGHTS);
      const scoreDoubled = scoreG0(alignedFeatures, doubledWeights);
      // Scores should be equal because weights are normalized by their total
      expect(scoreDoubled).toBe(scoreNormal);
    });

    it('returns score rounded to 2 decimals', () => {
      const score = scoreG0(alignedFeatures);
      const decimalPlaces = (score.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('alignment has weight 30 (highest impact)', () => {
      const base: G0Features = {
        alignment: 0,
        baseRate: 50,
        coordinatorHistory: 50,
        researchAndEndUser: 50,
        networkCentrality: 50,
        budgetRoleEconomy: 50,
        lumpSumTwoStage: 50,
      };
      const boosted: G0Features = { ...base, alignment: 100 };
      const scoreDiff = scoreG0(boosted) - scoreG0(base);
      // Alignment at 0→100 contributes (100 * 0.30 / sum) ≈ 25 points (before others)
      expect(scoreDiff).toBeGreaterThan(15);
    });
  });

  describe('g0Contributions()', () => {
    it('sums to composite score', () => {
      const features: G0Features = {
        alignment: 85,
        baseRate: 75,
        coordinatorHistory: 90,
        researchAndEndUser: 80,
        networkCentrality: 70,
        budgetRoleEconomy: 85,
        lumpSumTwoStage: 60,
      };
      const contributions = g0Contributions(features);
      const sum = Object.values(contributions).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(scoreG0(features), 1);
    });

    it('returns non-negative contributions', () => {
      const features: G0Features = {
        alignment: 50,
        baseRate: 50,
        coordinatorHistory: 50,
        researchAndEndUser: 50,
        networkCentrality: 50,
        budgetRoleEconomy: 50,
        lumpSumTwoStage: 50,
      };
      const contributions = g0Contributions(features);
      Object.values(contributions).forEach((c) => {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('decideG0() — hard rules', () => {
    const passingFeatures: G0Features = {
      alignment: 75,
      baseRate: 70,
      coordinatorHistory: 80,
      researchAndEndUser: 75,
      networkCentrality: 75,
      budgetRoleEconomy: 75,
      lumpSumTwoStage: 75,
    };

    const passingFacts: G0HardFacts = {
      baseRatePct: 12,
      countryEligible: true,
    };

    it('returns GO when all rules pass (composite ≥ 70)', () => {
      const result = decideG0(passingFeatures, passingFacts);
      expect(result.decision).toBe('GO');
      expect(result.reasons).toHaveLength(0);
    });

    it('returns NO_GO when composite score < 70 (DEFAULT rules)', () => {
      const poorFeatures: G0Features = {
        alignment: 40,
        baseRate: 30,
        coordinatorHistory: 30,
        researchAndEndUser: 30,
        networkCentrality: 30,
        budgetRoleEconomy: 30,
        lumpSumTwoStage: 30,
      };
      const result = decideG0(poorFeatures, passingFacts, DEFAULT_G0_RULES);
      expect(result.decision).toBe('NO_GO');
      expect(result.reasons.some((r) => r.includes('composite score'))).toBe(true);
    });

    it('returns NO_GO when alignment < 70', () => {
      const lowAlign: G0Features = { ...passingFeatures, alignment: 65 };
      const result = decideG0(lowAlign, passingFacts, DEFAULT_G0_RULES);
      expect(result.decision).toBe('NO_GO');
      expect(result.reasons.some((r) => r.includes('alignment'))).toBe(true);
    });

    it('returns NO_GO when baseRate < 8%', () => {
      const lowBaseRateFacts: G0HardFacts = {
        baseRatePct: 7,
        countryEligible: true,
      };
      const result = decideG0(passingFeatures, lowBaseRateFacts, DEFAULT_G0_RULES);
      expect(result.decision).toBe('NO_GO');
      expect(result.reasons.some((r) => r.includes('base rate'))).toBe(true);
    });

    it('returns NO_GO when country not eligible', () => {
      const ineligibleFacts: G0HardFacts = {
        baseRatePct: 12,
        countryEligible: false,
      };
      const result = decideG0(passingFeatures, ineligibleFacts, DEFAULT_G0_RULES);
      expect(result.decision).toBe('NO_GO');
      expect(result.reasons.some((r) => r.includes('country'))).toBe(true);
    });

    it('reports all failing rules, not just the first', () => {
      const poorFacts: G0HardFacts = {
        baseRatePct: 2,
        countryEligible: false,
      };
      const poorFeatures: G0Features = {
        alignment: 40,
        baseRate: 20,
        coordinatorHistory: 30,
        researchAndEndUser: 30,
        networkCentrality: 30,
        budgetRoleEconomy: 30,
        lumpSumTwoStage: 30,
      };
      const result = decideG0(poorFeatures, poorFacts, DEFAULT_G0_RULES);
      expect(result.decision).toBe('NO_GO');
      expect(result.reasons.length).toBeGreaterThanOrEqual(2); // At least base rate + country
    });

    it('SPEC_LITERAL rules ignore composite score', () => {
      const poorScore: G0Features = {
        alignment: 70,
        baseRate: 20,
        coordinatorHistory: 20,
        researchAndEndUser: 20,
        networkCentrality: 20,
        budgetRoleEconomy: 20,
        lumpSumTwoStage: 20,
      };
      const result = decideG0(poorScore, passingFacts, SPEC_LITERAL_G0_RULES);
      // Composite would fail, but SPEC_LITERAL doesn't check it
      expect(result.reasons.some((r) => r.includes('composite'))).toBe(false);
    });

    it('score property is set', () => {
      const result = decideG0(passingFeatures, passingFacts);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('contributions property is set', () => {
      const result = decideG0(passingFeatures, passingFacts);
      expect(result.contributions).toBeDefined();
      expect(result.contributions.alignment).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge cases & boundaries', () => {
    it('score exactly at 70 threshold passes', () => {
      // Craft features to score exactly 70
      const features: G0Features = {
        alignment: 70,
        baseRate: 70,
        coordinatorHistory: 70,
        researchAndEndUser: 70,
        networkCentrality: 70,
        budgetRoleEconomy: 70,
        lumpSumTwoStage: 70,
      };
      const facts: G0HardFacts = {
        baseRatePct: 10,
        countryEligible: true,
      };
      const result = decideG0(features, facts);
      // Score should be ≥ 70
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('base rate exactly at 8% passes hard rule', () => {
      const features: G0Features = {
        alignment: 80,
        baseRate: 80,
        coordinatorHistory: 80,
        researchAndEndUser: 80,
        networkCentrality: 80,
        budgetRoleEconomy: 80,
        lumpSumTwoStage: 80,
      };
      const facts: G0HardFacts = {
        baseRatePct: 8,
        countryEligible: true,
      };
      const result = decideG0(features, facts);
      expect(result.reasons.some((r) => r.includes('base rate'))).toBe(false);
    });

    it('handles NaN features gracefully', () => {
      // NaN is a number as far as the type is concerned; the point of the test
      // is that the scorer does not propagate it.
      const badFeatures: G0Features = {
        alignment: NaN,
        baseRate: 50,
        coordinatorHistory: 50,
        researchAndEndUser: 50,
        networkCentrality: 50,
        budgetRoleEconomy: 50,
        lumpSumTwoStage: 50,
      };
      const score = scoreG0(badFeatures);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});
