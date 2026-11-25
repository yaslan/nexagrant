import { describe, expect, it } from 'vitest';
import { g1ConsortiumSummary } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/g1-summary';
import { partnerOrgKey, seatStage } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/seat-view';

const decidedAt = new Date('2026-11-24T09:30:00Z');

describe('g1ConsortiumSummary (NG-20)', () => {
  it('no decision on file is null, not "no gaps"', () => {
    expect(g1ConsortiumSummary(null)).toBeNull();
  });

  it('reads the two lists the gate stored, deduplicated, with the decision time', () => {
    const s = g1ConsortiumSummary({
      decidedAt,
      passed: false,
      inputs: {
        unfilledCriticalRoles: ['widening', 'end_user', 'widening'],
        criticalRolesWithoutBackup: ['coordinator'],
        somethingElse: 42,
      },
    });
    expect(s).toEqual({
      decidedAt: '2026-11-24T09:30:00.000Z',
      passed: false,
      unfilledCriticalRoles: ['widening', 'end_user'],
      criticalRolesWithoutBackup: ['coordinator'],
      checkedConsortium: true,
    });
  });

  it('a decision without either list did not check the consortium', () => {
    const s = g1ConsortiumSummary({ decidedAt, passed: true, inputs: { score: 80 } });
    expect(s?.checkedConsortium).toBe(false);
    expect(s?.unfilledCriticalRoles).toEqual([]);
  });

  it('a malformed record is treated as unchecked, never as a clean pass', () => {
    const s = g1ConsortiumSummary({ decidedAt, passed: true, inputs: { unfilledCriticalRoles: 'end_user' } });
    expect(s?.checkedConsortium).toBe(false);
  });

  it('empty lists that were checked are a clean consortium', () => {
    const s = g1ConsortiumSummary({
      decidedAt,
      passed: true,
      inputs: { unfilledCriticalRoles: [], criticalRolesWithoutBackup: [] },
    });
    expect(s?.checkedConsortium).toBe(true);
  });
});

describe('seatStage (NG-20)', () => {
  it('maps SeatStatus onto the three steps', () => {
    expect(seatStage('CONFIRMED', 0)).toEqual({ kind: 'confirmed', step: 3 });
    expect(seatStage('INVITED', 0)).toEqual({ kind: 'invited', step: 2 });
    expect(seatStage('OPEN', 2)).toEqual({ kind: 'candidate', step: 1 });
    expect(seatStage('OPEN', 0)).toEqual({ kind: 'open', step: 0 });
    expect(seatStage('CANDIDATE', 0)).toEqual({ kind: 'candidate', step: 1 });
    expect(seatStage('DECLINED', 3)).toEqual({ kind: 'declined' });
    expect(seatStage('SOMETHING', 0)).toEqual({ kind: 'unknown' });
  });

  it('partner org keys cannot collide with a CORDIS PIC', () => {
    expect(partnerOrgKey('abc')).toBe('partner:abc');
  });
});
