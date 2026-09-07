import { describe, it, expect } from 'vitest';
import {
  scoreG0,
  decideG0,
  g0Contributions,
  baseRateToScore,
  DEFAULT_SCORING_WEIGHTS,
  type G0Features,
  type G0HardFacts,
} from './g0-canonical';

describe('G0 Scoring', () => {
  it('scoreG0: all features zero should give 0', () => {
    const features: G0Features = {
      alignment: 0,
      baseRate: 0,
      coordinatorHistory: 0,
      researchAndEndUser: 0,
      networkCentrality: 0,
      budgetRoleEconomy: 0,
      lumpSumTwoStage: 0,
    };
    const score = scoreG0(features, DEFAULT_SCORING_WEIGHTS);
    expect(score).toBe(0);
  });

  it('scoreG0: all features 100 should give 100', () => {
    const features: G0Features = {
      alignment: 100,
      baseRate: 100,
      coordinatorHistory: 100,
      researchAndEndUser: 100,
      networkCentrality: 100,
      budgetRoleEconomy: 100,
      lumpSumTwoStage: 100,
    };
    const score = scoreG0(features, DEFAULT_SCORING_WEIGHTS);
    expect(score).toBe(100);
  });

  it('scoreG0: negative features clamped to 0', () => {
    const features: G0Features = {
      alignment: -10,
      baseRate: -5,
      coordinatorHistory: 0,
      researchAndEndUser: 0,
      networkCentrality: 0,
      budgetRoleEconomy: 0,
      lumpSumTwoStage: 0,
    };
    const score = scoreG0(features, DEFAULT_SCORING_WEIGHTS);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('scoreG0: over-100 features clamped to 100', () => {
    const features: G0Features = {
      alignment: 150,
      baseRate: 150,
      coordinatorHistory: 150,
      researchAndEndUser: 150,
      networkCentrality: 150,
      budgetRoleEconomy: 150,
      lumpSumTwoStage: 150,
    };
    const score = scoreG0(features, DEFAULT_SCORING_WEIGHTS);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scoreG0: alignment weight (30%) applied correctly', () => {
    const features: G0Features = {
      alignment: 100,
      baseRate: 0,
      coordinatorHistory: 0,
      researchAndEndUser: 0,
      networkCentrality: 0,
      budgetRoleEconomy: 0,
      lumpSumTwoStage: 0,
    };
    const score = scoreG0(features, DEFAULT_SCORING_WEIGHTS);
    expect(score).toBe(30);
  });

  it('scoreG0: all features 50 should give 50', () => {
    const features: G0Features = {
      alignment: 50,
      baseRate: 50,
      coordinatorHistory: 50,
      researchAndEndUser: 50,
      networkCentrality: 50,
      budgetRoleEconomy: 50,
      lumpSumTwoStage: 50,
    };
    const score = scoreG0(features, DEFAULT_SCORING_WEIGHTS);
    expect(score).toBe(50);
  });

  it('decideG0: low scores result in NO_GO', () => {
    const features: G0Features = {
      alignment: 10,
      baseRate: 10,
      coordinatorHistory: 10,
      researchAndEndUser: 10,
      networkCentrality: 10,
      budgetRoleEconomy: 10,
      lumpSumTwoStage: 10,
    };
    const facts: G0HardFacts = {
      baseRatePct: 10,
      countryEligible: true,
    };
    const result = decideG0(features, facts, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(result.decision).toBe('NO_GO');
  });

  it('decideG0: high scores result in GO', () => {
    const features: G0Features = {
      alignment: 100,
      baseRate: 100,
      coordinatorHistory: 100,
      researchAndEndUser: 100,
      networkCentrality: 100,
      budgetRoleEconomy: 100,
      lumpSumTwoStage: 100,
    };
    const facts: G0HardFacts = {
      baseRatePct: 10,
      countryEligible: true,
    };
    const result = decideG0(features, facts, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(result.decision).toBe('GO');
  });

  it('decideG0: alignment 0 triggers hard rule failure', () => {
    const features: G0Features = {
      alignment: 0,
      baseRate: 100,
      coordinatorHistory: 100,
      researchAndEndUser: 100,
      networkCentrality: 100,
      budgetRoleEconomy: 100,
      lumpSumTwoStage: 100,
    };
    const facts: G0HardFacts = {
      baseRatePct: 10,
      countryEligible: true,
    };
    const result = decideG0(features, facts, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(result.decision).toBe('NO_GO');
  });

  it('decideG0: high alignment with other features gives GO', () => {
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
      baseRatePct: 10,
      countryEligible: true,
    };
    const result = decideG0(features, facts, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.decision).toBe('GO');
  });

  it('g0Contributions: breakdown sums to score', () => {
    const features: G0Features = {
      alignment: 100,
      baseRate: 50,
      coordinatorHistory: 30,
      researchAndEndUser: 20,
      networkCentrality: 10,
      budgetRoleEconomy: 0,
      lumpSumTwoStage: 0,
    };
    const contrib = g0Contributions(features, DEFAULT_SCORING_WEIGHTS);
    expect(contrib.alignment).toBe(30);
    expect(contrib.baseRate).toBe(7.5);
    expect(contrib.coordinatorHistory).toBe(4.5);
  });

  it('g0Contributions: all 100 gives sum of 100', () => {
    const features: G0Features = {
      alignment: 100,
      baseRate: 100,
      coordinatorHistory: 100,
      researchAndEndUser: 100,
      networkCentrality: 100,
      budgetRoleEconomy: 100,
      lumpSumTwoStage: 100,
    };
    const contrib = g0Contributions(features, DEFAULT_SCORING_WEIGHTS);
    const sum =
      contrib.alignment +
      contrib.baseRate +
      contrib.coordinatorHistory +
      contrib.researchAndEndUser +
      contrib.networkCentrality +
      contrib.budgetRoleEconomy +
      contrib.lumpSumTwoStage;
    expect(sum).toBe(100);
  });

  it('baseRateToScore: 0% gives 0', () => {
    const score = baseRateToScore(0);
    expect(score).toBe(0);
  });

  it('baseRateToScore: 100% gives 100 (clamped)', () => {
    const score = baseRateToScore(100);
    expect(score).toBe(100);
  });

  it('baseRateToScore: 8% gives 40 (8/20 * 100)', () => {
    const score = baseRateToScore(8);
    expect(score).toBe(40);
  });

  it('baseRateToScore: 20% gives 100 (fullMarks)', () => {
    const score = baseRateToScore(20);
    expect(score).toBe(100);
  });

  it('baseRateToScore: 5.5% gives 27.5', () => {
    const score = baseRateToScore(5.5);
    expect(score).toBeCloseTo(27.5, 1);
  });

  it('decideG0: country ineligible fails gate', () => {
    const features: G0Features = {
      alignment: 100,
      baseRate: 100,
      coordinatorHistory: 100,
      researchAndEndUser: 100,
      networkCentrality: 100,
      budgetRoleEconomy: 100,
      lumpSumTwoStage: 0,
    };
    const factsIneligible: G0HardFacts = {
      baseRatePct: 10,
      countryEligible: false,
    };
    const result = decideG0(features, factsIneligible, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(result.decision).toBe('NO_GO');
  });

  it('decideG0: low baseRate fails gate', () => {
    const features: G0Features = {
      alignment: 100,
      baseRate: 100,
      coordinatorHistory: 100,
      researchAndEndUser: 100,
      networkCentrality: 100,
      budgetRoleEconomy: 100,
      lumpSumTwoStage: 100,
    };
    const factsLowBaseRate: G0HardFacts = {
      baseRatePct: 4,
      countryEligible: true,
    };
    const result = decideG0(features, factsLowBaseRate, undefined, DEFAULT_SCORING_WEIGHTS);
    expect(result.decision).toBe('NO_GO');
  });
});
