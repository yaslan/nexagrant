/**
 * NG-100 / K-579560=A — the consortium "Aday Bul" button and the M8 "Aday Bul" button
 * are one rule: the M8 matcher (src/modules/m8/server/matching.ts). The consortium
 * scorer (src/lib/scoring/consortium.ts scoreCandidatesForSeat) is no longer called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  generateSeatCandidates: vi.fn(),
  scoreCandidatesForSeat: vi.fn(),
  tx: {
    consortiumSeat: { findFirst: vi.fn() },
    opportunity: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({
  withTenant: async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(h.tx),
}));
vi.mock('@/lib/tenant', () => ({
  ForbiddenRoleError: class extends Error {},
  requireTenantAction: async () => ({ tenantId: 't1', role: 'owner' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/modules/access', () => ({ checkModuleAccess: async () => ({ allowed: true }) }));
vi.mock('@/lib/scoring/consortium', () => ({
  detectConflicts: async () => [],
  scoreCandidatesForSeat: (...args: unknown[]) => h.scoreCandidatesForSeat(...args),
}));
vi.mock('@/modules/m8/server/matching', () => ({
  generateSeatCandidates: (...args: unknown[]) => h.generateSeatCandidates(...args),
}));
vi.mock('@/modules/m8/server/seat-transitions', () => ({
  CONFIRM_SEAT_PERMISSION: 'confirm',
  canConfirmSeat: () => true,
  inviteSeatCandidate: async () => 0,
}));
vi.mock('@/modules/m8/server/actions', () => ({ confirmSeatAssignment: async () => undefined }));
vi.mock('@/modules/m8/server/errors', () => ({
  SEAT_CONFIRM_CONFLICT_CODE: 'c',
  SEAT_NOT_CONFIRMABLE_CODE: 'n',
  SeatConfirmConflictError: class extends Error {},
  SeatNotConfirmableError: class extends Error {},
}));

beforeEach(() => {
  h.generateSeatCandidates.mockReset();
  h.scoreCandidatesForSeat.mockReset();
  h.tx.consortiumSeat.findFirst.mockReset().mockResolvedValue({ id: 'seat1', opportunityId: 'opp1' });
  h.tx.opportunity.findFirst.mockReset().mockResolvedValue({ topicId: 'topic1' });
});

describe('consortium Aday Bul = M8 Aday Bul (K-579560=A)', () => {
  it('findCandidates runs the M8 matcher for the same seat and returns its persisted rows', async () => {
    h.generateSeatCandidates.mockResolvedValue([
      {
        id: 'r1',
        seatId: 'seat1',
        organizationId: 'org-a',
        score: 80,
        rank: 1,
        breakdown: { topicExperience: 25, geographicBalance: 33, collabHistory: 22, rivalRisk: 0 },
      },
    ]);

    const { findCandidates } = await import(
      '../src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions'
    );
    const rows = await findCandidates('seat1');

    expect(h.generateSeatCandidates).toHaveBeenCalledWith('opp1', 'seat1', 't1', 5);
    expect(h.scoreCandidatesForSeat).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organizationId: 'org-a', rank: 1, score: 80 });
  });
});

describe('the consortium page shows only matcher rows (stale consortium rows stay in the table, unshown)', () => {
  it('drops rows written by the retired consortium scorer and keeps matcher rows, legacy included', async () => {
    const { visibleSeatCandidates } = await import('@/lib/scoring/seat-candidate-view');
    const rows = [
      { id: 'm', breakdown: { topicExperience: 25, geographicBalance: 33, collabHistory: 22, rivalRisk: 0 } },
      {
        id: 'legacy',
        breakdown: {
          topicExperience: 10,
          geographicBalance: 15,
          collabHistory: 0,
          relationshipWarmth: 0,
          centrality: 5,
          rivalRisk: 0,
        },
      },
      { id: 'consortium', breakdown: { topicExperience: 3, networkCentrality: 2, countryDiversity: 1.5, smeBonus: 1, warmthBonus: 0, liveDemandSignal: 0.4 } },
    ];
    expect(visibleSeatCandidates(rows).map((r) => r.id)).toEqual(['m', 'legacy']);
  });
});
