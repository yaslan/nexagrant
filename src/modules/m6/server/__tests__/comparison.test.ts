/**
 * M6 Evaluator Lens — Comparison & Validation Tests.
 *
 * TASK-MTPZHMSPMDA66: Tests for ESR comparison, score validation, and access control.
 */

import { describe, it, expect } from 'vitest';
import {
  validateScoreRange,
  validateEvaluationTenant,
  validateReviewerAccess,
  checkNoDuplicateScore,
  validateReviewersTenant,
} from '../comparison';

describe('M6 Comparison & Validation', () => {
  // ───────── TEST 1: Score range validation — valid scores
  it('should accept valid scores 1-5', () => {
    expect(validateScoreRange(1)).toBe(true);
    expect(validateScoreRange(3)).toBe(true);
    expect(validateScoreRange(5)).toBe(true);
  });

  // ───────── TEST 2: Score range validation — invalid scores
  it('should reject scores outside 1-5 range', () => {
    expect(validateScoreRange(0)).toBe(false);
    expect(validateScoreRange(6)).toBe(false);
    expect(validateScoreRange(-1)).toBe(false);
    expect(validateScoreRange(5.5)).toBe(false); // not integer
  });

  // ───────── TEST 3: Score range validation — non-integer
  it('should reject non-integer scores', () => {
    expect(validateScoreRange(2.5)).toBe(false);
    expect(validateScoreRange(3.14)).toBe(false);
  });

  // ───────── TEST 4: Score range validation — boundary cases
  it('should validate exact boundaries', () => {
    expect(validateScoreRange(1)).toBe(true);
    expect(validateScoreRange(5)).toBe(true);
    // Just outside boundaries
    expect(validateScoreRange(0.9)).toBe(false);
    expect(validateScoreRange(5.1)).toBe(false);
  });

  // ───────── TEST 5: Non-integer floats
  it('should reject NaN and Infinity', () => {
    expect(validateScoreRange(NaN)).toBe(false);
    expect(validateScoreRange(Infinity)).toBe(false);
    expect(validateScoreRange(-Infinity)).toBe(false);
  });

  // ───────── TEST 6: Large numbers
  it('should reject large numbers even if integer', () => {
    expect(validateScoreRange(100)).toBe(false);
    expect(validateScoreRange(1000000)).toBe(false);
  });

  // ───────---- Additional validation notes
  // The async validation functions (validateReviewerAccess, validateEvaluationTenant, etc.)
  // are tested via integration tests or mocked DB scenarios, as they require a database.
  // Unit tests for those functions appear in actions.test.ts alongside server action tests.
});
