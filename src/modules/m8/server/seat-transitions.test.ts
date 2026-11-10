import { describe, expect, it, vi } from 'vitest';

import { inviteSeatCandidate } from './seat-transitions';
import type { TenantTx } from '@/lib/db';

/**
 * NG-100 / K-580035=A — an old-scored row is ignored everywhere, the invite included.
 * Only a SeatCandidate row the current M8 matcher wrote (seat-candidate-view.ts) can be
 * offered; a row the pre-K-578751 matcher or the retired consortium scorer left behind
 * writes nothing. The real-database twin is tests/g1-gate.live.test.ts.
 */

const MATCH = { topicExperience: 20, geographicBalance: 15, collabHistory: 10, rivalRisk: 0 };
const LEGACY_MATCH = { topicExperience: 20, geographicBalance: 10, collabHistory: 10, relationshipWarmth: 5, centrality: 5, rivalRisk: 0 };
const CONSORTIUM = { topicExperience: 3, networkCentrality: 2, countryDiversity: 1.5, smeBonus: 1, warmthBonus: 0, liveDemandSignal: 0 };

function fakeTx(breakdown: unknown) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    consortiumSeat: { findFirst: vi.fn().mockResolvedValue({ id: 'seat-1' }), updateMany },
    seatCandidate: { findMany: vi.fn().mockResolvedValue([{ id: 'c-1', breakdown }]) },
  } as unknown as TenantTx;
  return { tx, updateMany };
}

const args = { tenantId: 'tenant-1', seatId: 'seat-1', organizationId: 'org-1', opportunityId: 'opp-1' };

describe('inviteSeatCandidate — only the current matcher’s rows (K-580035=A)', () => {
  it('a matcher row is invited', async () => {
    const { tx, updateMany } = fakeTx(MATCH);
    expect(await inviteSeatCandidate(tx, args)).toBe(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pre-K-578751 matcher', LEGACY_MATCH],
    ['retired consortium scorer', CONSORTIUM],
    ['no breakdown', {}],
  ])('a %s row is not invited and nothing is written', async (_label, breakdown) => {
    const { tx, updateMany } = fakeTx(breakdown);
    expect(await inviteSeatCandidate(tx, args)).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
