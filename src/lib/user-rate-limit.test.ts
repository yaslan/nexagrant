import { describe, test, expect } from 'vitest';
import { UserWindowLimiter } from './user-rate-limit';

describe('UserWindowLimiter', () => {
  test('allows `limit` per user per window, then reports the seconds left', () => {
    const l = new UserWindowLimiter(2, 60_000);
    expect(l.take('a', 1_000)).toBeNull();
    expect(l.take('a', 2_000)).toBeNull();
    // the oldest counted request (t=1000) leaves the window at 61_000
    expect(l.take('a', 11_000)).toBe(50);
    expect(l.take('b', 11_000)).toBeNull();
  });

  test('the allowance returns as the oldest requests leave the window', () => {
    const l = new UserWindowLimiter(1, 60_000);
    expect(l.take('a', 0)).toBeNull();
    expect(l.take('a', 59_999)).toBe(1);
    expect(l.take('a', 60_000)).toBeNull();
  });

  // FO-386 finding 2: with a fixed window this let 2 * limit through within one second.
  test('no moment lets through more than `limit`: the window edge is not a second allowance', () => {
    const l = new UserWindowLimiter(20, 3_600_000);
    // another user opens "the" window at t=0; with a shared fixed window that reset everyone together
    expect(l.take('other', 0)).toBeNull();
    let passed = 0;
    for (let i = 0; i < 20; i++) if (l.take('a', 3_599_000) === null) passed++;
    for (let i = 0; i < 20; i++) if (l.take('a', 3_600_000) === null) passed++;
    expect(passed).toBe(20);
  });

  test('a refused request is not counted, so a loop does not push its own release out', () => {
    const l = new UserWindowLimiter(1, 60_000);
    expect(l.take('a', 0)).toBeNull();
    for (let t = 1_000; t < 60_000; t += 1_000) expect(l.take('a', t)).not.toBeNull();
    expect(l.take('a', 60_000)).toBeNull();
  });

  test('users who left the window are forgotten, so the map does not grow without bound', () => {
    const l = new UserWindowLimiter(1, 60_000);
    for (let i = 0; i < 1_000; i++) l.take(`u${i}`, 0);
    l.take('late', 120_000);
    expect((l as unknown as { hits: Map<string, number[]> }).hits.size).toBe(1);
  });

  // FO-389: a request that failed on our side gives its slot back.
  test('refund gives back exactly the request it names, and only that user\'s', () => {
    const l = new UserWindowLimiter(2, 60_000);
    expect(l.take('a', 1_000)).toBeNull();
    expect(l.take('a', 2_000)).toBeNull();
    expect(l.take('b', 2_000)).toBeNull();
    expect(l.take('a', 3_000)).not.toBeNull();
    l.refund('a', 2_000);
    expect(l.take('a', 3_000)).toBeNull(); // the slot is back...
    expect(l.take('a', 3_500)).not.toBeNull(); // ...once
    // 'b' keeps its own request, and a refund for a time nobody took changes nothing.
    l.refund('b', 9_999);
    l.refund('nobody', 1_000);
    expect(l.take('b', 2_500)).toBeNull();
    expect(l.take('b', 2_600)).not.toBeNull();
  });
});
