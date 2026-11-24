import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  INVITE_CODE_DEFAULT_VALIDITY_DAYS,
  INVITE_CODE_MAX_USE_LIMIT,
  INVITE_CODE_MIN_USE_LIMIT,
  INVITE_CODE_USE_LIMIT_SPREAD,
  newInviteCodeUseLimit,
} from './invite-policy';

/**
 * FO-392. The numbers are PRODUCT DECISIONS, so they are pinned here by value: changing
 * one means changing this file too, which is the review step that asks for a new decision.
 *   - 500 uses minimum, 90 days: the autopilot default of K-577141 (no owner answer);
 *   - spread 0..24: the owner's K-577268 (hidden per-code limit).
 * The funnel attacker (funnel.attack.test.ts) reads its knowledge of the limit off these
 * exports, so a spread of 0 turns the saturated-cohort gate red there; the pins below catch
 * a changed base or spread on their own.
 */
describe('invite-policy (K-577141, K-577268)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('the decided numbers', () => {
    expect(INVITE_CODE_MIN_USE_LIMIT).toBe(500);
    expect(INVITE_CODE_USE_LIMIT_SPREAD).toBe(24);
    expect(INVITE_CODE_MAX_USE_LIMIT).toBe(524);
    expect(INVITE_CODE_DEFAULT_VALIDITY_DAYS).toBe(90);
  });

  test('every draw is an integer in [500, 524] and the whole window is reached', () => {
    const seen = new Map<number, number>();
    for (let i = 0; i < 5000; i++) {
      const n = newInviteCodeUseLimit();
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(500);
      expect(n).toBeLessThanOrEqual(524);
      seen.set(n, (seen.get(n) ?? 0) + 1);
    }
    expect(seen.size).toBe(25);
    // Uniform: 5000/25 = 200 per value, sd ~ 14; 100..300 is > 7 sd, never flaky.
    for (const c of seen.values()) {
      expect(c).toBeGreaterThan(100);
      expect(c).toBeLessThan(300);
    }
  });

  test('the randomness is the platform CSPRNG, not Math.random', () => {
    const rnd = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not pick a use limit');
    });
    const gv = vi.spyOn(globalThis.crypto, 'getRandomValues');
    for (let i = 0; i < 50; i++) newInviteCodeUseLimit();
    expect(rnd).not.toHaveBeenCalled();
    expect(gv).toHaveBeenCalled();
  });

  test('rejection sampling: a draw in the biased tail of the 32-bit range is thrown away', () => {
    // 2^32 mod 25 = 21: values >= 4294967275 would favour the low residues. Feed one, then 7.
    const feed = [0xffff_fffa, 7];
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: Uint32Array) => {
      a[0] = feed.shift()!;
      return a;
    }) as typeof crypto.getRandomValues);
    expect(newInviteCodeUseLimit()).toBe(500 + (7 % 25));
    expect(feed).toHaveLength(0);
  });
});
