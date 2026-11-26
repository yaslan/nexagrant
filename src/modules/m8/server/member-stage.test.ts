import { describe, expect, it, vi } from 'vitest';

import type { TenantTx } from '@/lib/db';
import { planMemberStageChange, setMemberStage, type MemberStageSeat } from './member-stage';

/**
 * NG-364 — the member-stage transition (K-586296 = B). Pure rules first, then the write that
 * carries them, so a seat changed between the read and the write is not overwritten.
 * The real-database twin is tests/member-stage.live.test.ts.
 */

const NOW = new Date('2026-11-25T10:00:00.000Z');
const EARLIER = new Date('2026-11-20T00:00:00.000Z');

const seat = (over: Partial<MemberStageSeat> = {}): MemberStageSeat => ({
  status: 'INVITED',
  organizationId: 'org-1',
  partnerOrgId: null,
  memberStage: null,
  memberStageAt: null,
  loiReceivedAt: null,
  loiDocumentUrl: null,
  ...over,
});

describe('planMemberStageChange — order', () => {
  it.each([
    [null, 'INTERESTED'],
    [null, 'MET'],
    ['INTERESTED', 'MET'],
    ['MET', 'LOI'],
    // A stage may be skipped: a member can send its letter at the first meeting.
    ['INTERESTED', 'LOI'],
  ] as const)('%s → %s is allowed and stamps the time', (from, to) => {
    const plan = planMemberStageChange(seat({ memberStage: from }), { to }, NOW);
    expect(plan).toMatchObject({ ok: true, data: { memberStage: to, memberStageAt: NOW } });
  });

  it.each([
    ['MET', 'INTERESTED'],
    ['LOI', 'MET'],
    ['LOI', 'INTERESTED'],
  ] as const)('going back %s → %s is allowed while the seat is not confirmed, and keeps the letter for the record', (from, to) => {
    const plan = planMemberStageChange(
      seat({ memberStage: from, loiReceivedAt: EARLIER, loiDocumentUrl: 'https://docs.example/loi.pdf' }),
      { to },
      NOW,
    );
    expect(plan).toEqual({
      ok: true,
      data: { memberStage: to, memberStageAt: NOW, loiReceivedAt: EARLIER, loiDocumentUrl: 'https://docs.example/loi.pdf' },
    });
  });

  it('the same stage with nothing new is refused', () => {
    expect(planMemberStageChange(seat({ memberStage: 'MET' }), { to: 'MET' }, NOW)).toEqual({ ok: false, code: 'SAME_STAGE' });
  });
});

describe('planMemberStageChange — CONFIRMED follows SeatStatus', () => {
  it('CONFIRMED on a seat that is not CONFIRMED is refused', () => {
    expect(planMemberStageChange(seat({ memberStage: 'LOI' }), { to: 'CONFIRMED' }, NOW)).toEqual({
      ok: false,
      code: 'SEAT_NOT_CONFIRMED',
    });
  });

  it('CONFIRMED on a CONFIRMED seat is allowed and does not invent a letter', () => {
    const plan = planMemberStageChange(seat({ status: 'CONFIRMED', memberStage: 'MET' }), { to: 'CONFIRMED' }, NOW);
    expect(plan).toEqual({
      ok: true,
      data: { memberStage: 'CONFIRMED', memberStageAt: NOW, loiReceivedAt: null, loiDocumentUrl: null },
    });
  });

  it.each(['INTERESTED', 'MET', 'LOI'] as const)('a CONFIRMED seat cannot be moved back to %s', (to) => {
    expect(planMemberStageChange(seat({ status: 'CONFIRMED', memberStage: 'CONFIRMED' }), { to }, NOW)).toEqual({
      ok: false,
      code: 'SEAT_IS_CONFIRMED',
    });
  });
});

describe('planMemberStageChange — the seat must have a member', () => {
  it('a seat that names nobody has no member to stage', () => {
    expect(planMemberStageChange(seat({ status: 'OPEN', organizationId: null }), { to: 'INTERESTED' }, NOW)).toEqual({
      ok: false,
      code: 'NO_MEMBER',
    });
  });

  it('a tenant-private partner is a member', () => {
    const plan = planMemberStageChange(seat({ organizationId: null, partnerOrgId: 'p-1' }), { to: 'MET' }, NOW);
    expect(plan.ok).toBe(true);
  });

  it('a DECLINED seat is refused: re-opening goes through the invite', () => {
    expect(planMemberStageChange(seat({ status: 'DECLINED' }), { to: 'MET' }, NOW)).toEqual({ ok: false, code: 'SEAT_DECLINED' });
  });
});

describe('planMemberStageChange — letter of intent', () => {
  it('LOI with no date records today', () => {
    const plan = planMemberStageChange(seat({ memberStage: 'MET' }), { to: 'LOI' }, NOW);
    expect(plan).toEqual({ ok: true, data: { memberStage: 'LOI', memberStageAt: NOW, loiReceivedAt: NOW, loiDocumentUrl: null } });
  });

  it('LOI with a date and a document records both', () => {
    const plan = planMemberStageChange(
      seat({ memberStage: 'MET' }),
      { to: 'LOI', loiReceivedAt: EARLIER, loiDocumentUrl: 'https://docs.example/loi.pdf' },
      NOW,
    );
    expect(plan).toEqual({
      ok: true,
      data: { memberStage: 'LOI', memberStageAt: NOW, loiReceivedAt: EARLIER, loiDocumentUrl: 'https://docs.example/loi.pdf' },
    });
  });

  it('a letter dated in the future is refused', () => {
    const tomorrow = new Date(NOW.getTime() + 24 * 3600 * 1000);
    expect(planMemberStageChange(seat({ memberStage: 'MET' }), { to: 'LOI', loiReceivedAt: tomorrow }, NOW)).toEqual({
      ok: false,
      code: 'LOI_IN_FUTURE',
    });
  });

  it.each(['INTERESTED', 'MET'] as const)('letter fields with stage %s are refused', (to) => {
    expect(planMemberStageChange(seat(), { to, loiDocumentUrl: 'https://docs.example/loi.pdf' }, NOW)).toEqual({
      ok: false,
      code: 'LOI_BEFORE_STAGE',
    });
  });

  it('at LOI already, a new document updates the letter and keeps the stage time', () => {
    const plan = planMemberStageChange(
      seat({ memberStage: 'LOI', memberStageAt: EARLIER, loiReceivedAt: EARLIER }),
      { to: 'LOI', loiDocumentUrl: 'https://docs.example/v2.pdf' },
      NOW,
    );
    expect(plan).toEqual({
      ok: true,
      data: { memberStage: 'LOI', memberStageAt: EARLIER, loiReceivedAt: EARLIER, loiDocumentUrl: 'https://docs.example/v2.pdf' },
    });
  });
});

describe('setMemberStage — the write', () => {
  function fakeTx(row: (MemberStageSeat & { id: string }) | null, count = 1) {
    const findFirst = vi.fn().mockResolvedValue(row);
    const updateMany = vi.fn().mockResolvedValue({ count });
    const tx = { consortiumSeat: { findFirst, updateMany } } as unknown as TenantTx;
    return { tx, findFirst, updateMany };
  }
  const args = { tenantId: 't-1', opportunityId: 'o-1', seatId: 's-1', request: { to: 'MET' as const }, now: NOW };

  it('reads and writes inside the tenant and the opportunity, guarded on what it read', async () => {
    const { tx, findFirst, updateMany } = fakeTx({ id: 's-1', ...seat({ memberStage: 'INTERESTED' }) });

    expect(await setMemberStage(tx, args)).toMatchObject({ ok: true, data: { memberStage: 'MET' } });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's-1', tenantId: 't-1', opportunityId: 'o-1' } }));
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 's-1',
        tenantId: 't-1',
        opportunityId: 'o-1',
        status: 'INVITED',
        organizationId: 'org-1',
        partnerOrgId: null,
        memberStage: 'INTERESTED',
        loiReceivedAt: null,
        loiDocumentUrl: null,
      },
      data: { memberStage: 'MET', memberStageAt: NOW, loiReceivedAt: null, loiDocumentUrl: null },
    });
  });

  it('a seat outside the tenant or opportunity is not found and nothing is written', async () => {
    const { tx, updateMany } = fakeTx(null);
    expect(await setMemberStage(tx, args)).toEqual({ ok: false, code: 'SEAT_NOT_FOUND' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('a refused plan writes nothing', async () => {
    const { tx, updateMany } = fakeTx({ id: 's-1', ...seat({ organizationId: null }) });
    expect(await setMemberStage(tx, args)).toEqual({ ok: false, code: 'NO_MEMBER' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('a seat changed between read and write is reported, not overwritten', async () => {
    const { tx } = fakeTx({ id: 's-1', ...seat() }, 0);
    expect(await setMemberStage(tx, args)).toEqual({ ok: false, code: 'SEAT_CHANGED' });
  });

  it('a missing id never reaches the query', async () => {
    const { tx, findFirst } = fakeTx({ id: 's-1', ...seat() });
    expect(await setMemberStage(tx, { ...args, seatId: '' })).toEqual({ ok: false, code: 'SEAT_NOT_FOUND' });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
