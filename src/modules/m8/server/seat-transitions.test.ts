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

function fakeTx(breakdown: unknown, seated: string | null = null) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const shareUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    consortiumSeat: { findFirst: vi.fn().mockResolvedValue({ id: 'seat-1', organizationId: seated }), updateMany },
    partnerBudgetShare: { updateMany: shareUpdateMany },
    seatCandidate: { findMany: vi.fn().mockResolvedValue([{ id: 'c-1', breakdown }]) },
  } as unknown as TenantTx;
  return { tx, updateMany, shareUpdateMany };
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

describe('inviteSeatCandidate — the member stage belongs to the organisation (NG-364)', () => {
  const CLEARED = { memberStage: null, memberStageAt: null, loiReceivedAt: null, loiDocumentUrl: null };
  type Call = { where: Record<string, unknown>; data: Record<string, unknown> };
  const written = (updateMany: ReturnType<typeof vi.fn>) => (updateMany.mock.calls[0] as [Call])[0];

  it('another organisation starts with no stage and no letter of intent', async () => {
    const { tx, updateMany } = fakeTx(MATCH, 'org-before');
    expect(await inviteSeatCandidate(tx, args)).toBe(1);
    expect(written(updateMany).data).toEqual({ organizationId: 'org-1', status: 'INVITED', ...CLEARED });
  });

  it('an empty seat is cleared too', async () => {
    const { tx, updateMany } = fakeTx(MATCH, null);
    await inviteSeatCandidate(tx, args);
    expect(written(updateMany).data).toMatchObject(CLEARED);
  });

  // NG-33 B-1: the budget-share agreement belongs to the member who gave it; a new member clears it.
  it('a new member clears the seat budget-share agreement; the same member keeps it', async () => {
    const changed = fakeTx(MATCH, 'org-before');
    await inviteSeatCandidate(changed.tx, args);
    expect(changed.shareUpdateMany).toHaveBeenCalledWith({
      where: { seatId: 'seat-1', tenantId: 'tenant-1' },
      data: { agreedAt: null, agreedById: null },
    });

    const same = fakeTx(MATCH, 'org-1');
    await inviteSeatCandidate(same.tx, args);
    expect(same.shareUpdateMany).not.toHaveBeenCalled();
  });

  it('inviting the same organisation again keeps its stage and letter', async () => {
    const { tx, updateMany } = fakeTx(MATCH, 'org-1');
    await inviteSeatCandidate(tx, args);
    expect(written(updateMany).data).toEqual({ organizationId: 'org-1', status: 'INVITED' });
  });

  it('the organisation read is in the WHERE clause, so a seat changed in between is not written', async () => {
    const { tx, updateMany } = fakeTx(MATCH, 'org-before');
    await inviteSeatCandidate(tx, args);
    expect(written(updateMany).where).toMatchObject({ id: 'seat-1', tenantId: 'tenant-1', organizationId: 'org-before' });
  });
});
