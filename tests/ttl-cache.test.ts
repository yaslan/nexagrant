/**
 * FO-204 — the TTL cache behind GET /api/cagrilar. An entry is served until its
 * time-to-live runs out, and the oldest key goes first once the size cap is hit.
 */
import { describe, expect, test } from 'vitest';
import { TtlCache } from '@/lib/ttl-cache';

describe('TtlCache', () => {
  test('returns a stored value until its ttl has passed', () => {
    const cache = new TtlCache<string>(1_000, 10);
    cache.set('k', 'v', 0);
    expect(cache.get('k', 999)).toBe('v');
    expect(cache.get('k', 1_000)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  test('misses on an unknown key', () => {
    const cache = new TtlCache<string>(1_000, 10);
    expect(cache.get('nope', 0)).toBeUndefined();
  });

  test('evicts the oldest key when full, and a rewrite refreshes the ttl', () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.set('a', 11, 5_000); // rewrite moves 'a' to the back
    cache.set('c', 3, 5_000); // evicts 'b', the oldest now
    expect(cache.get('b', 5_000)).toBeUndefined();
    expect(cache.get('a', 5_000)).toBe(11);
    expect(cache.get('a', 14_999)).toBe(11);
    expect(cache.get('c', 5_000)).toBe(3);
    expect(cache.size).toBe(2);
  });
});
