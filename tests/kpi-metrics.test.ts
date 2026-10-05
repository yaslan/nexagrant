import { describe, test, expect } from 'vitest';
import { thresholdRate, NOT_MEASURED, measured } from '../src/modules/m5/server/metrics';

describe('KPI metrics', () => {
  describe('thresholdRate', () => {
    test('calculates percentage of above-threshold proposals', () => {
      expect(thresholdRate(10, 20)).toEqual(measured(50.0));
      expect(thresholdRate(5, 20)).toEqual(measured(25.0));
      expect(thresholdRate(20, 20)).toEqual(measured(100.0));
    });

    test('handles zero above-threshold as a real measurement', () => {
      expect(thresholdRate(0, 10)).toEqual(measured(0.0));
    });

    test('returns unmeasured when no proposals submitted', () => {
      expect(thresholdRate(0, 0)).toEqual(NOT_MEASURED);
    });

    test('returns unmeasured when denominator is zero', () => {
      expect(thresholdRate(5, 0)).toEqual(NOT_MEASURED);
    });

    test('returns unmeasured when denominator is negative', () => {
      expect(thresholdRate(5, -1)).toEqual(NOT_MEASURED);
    });

    test('rounds to two decimal places', () => {
      // 1/3 * 100 = 33.333... → 33.33
      expect(thresholdRate(1, 3)).toEqual(measured(33.33));
      // 2/7 * 100 = 28.571... → 28.57
      expect(thresholdRate(2, 7)).toEqual(measured(28.57));
    });
  });
});
