import { describe, test, expect } from 'vitest';
import { UserWindowLimiter } from './user-rate-limit';

describe('UserWindowLimiter', () => {
  test('allows `limit` per user per window, then reports the seconds left', () => {
    const l = new UserWindowLimiter(2, 60_000);
    expect(l.take('a', 1_000)).toBeNull();
    expect(l.take('a', 2_000)).toBeNull();
    expect(l.take('a', 11_000)).toBe(50);
    expect(l.take('b', 11_000)).toBeNull();
  });

  test('a new window starts every user from zero', () => {
    const l = new UserWindowLimiter(1, 60_000);
    expect(l.take('a', 0)).toBeNull();
    expect(l.take('a', 59_999)).toBe(1);
    expect(l.take('a', 60_000)).toBeNull();
  });
});
