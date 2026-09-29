import { describe, expect, test } from 'vitest';
import { shownUsedCount, USED_COUNT_THRESHOLD } from './codes';

/** K-1 (TASK-MULZATEX4G92H): a code's use count is a count of organisations, masked like one. */
describe('shownUsedCount', () => {
  test('under 5 is "<5" (null), 0 included; 5 and more is the number', () => {
    expect(USED_COUNT_THRESHOLD).toBe(5);
    expect([0, 1, 4].map(shownUsedCount)).toEqual([null, null, null]);
    expect([5, 6, 250].map(shownUsedCount)).toEqual([5, 6, 250]);
  });
});
