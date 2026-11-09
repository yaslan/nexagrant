import { describe, expect, it } from 'vitest';

import { g0BoxMode, g0ReasonsVisible } from '@/lib/gates/latest-g0-decision';

/**
 * NG-69 (K-579051) — the detail page's G0 box after the opportunity has left G0.
 *
 * At G0 the box is a live computation. From G1 on, the live number and "GEÇME" can contradict
 * the stored decision the gate actually acted on, so the box shows the saved latest G0 decision
 * with its date instead. The mapping is pure so it is pinned here without a database.
 */
describe('g0BoxMode — what the G0 box shows', () => {
  const passed = { passed: true, decidedAt: new Date('2026-11-01T10:00:00Z') };
  const refused = { passed: false, decidedAt: new Date('2026-11-02T10:00:00Z') };

  it('stays live while the opportunity is still at G0', () => {
    expect(g0BoxMode('G0', null)).toEqual({ kind: 'live' });
    expect(g0BoxMode('G0', refused)).toEqual({ kind: 'live' });
  });

  it('shows the saved pass after G1 when the latest G0 decision passed', () => {
    expect(g0BoxMode('G1', passed)).toEqual({ kind: 'saved', passed: true, decidedAt: passed.decidedAt });
  });

  it('shows the saved refusal after G1 when the latest G0 decision refused (no live GEÇME)', () => {
    expect(g0BoxMode('G1', refused)).toEqual({
      kind: 'saved',
      passed: false,
      decidedAt: refused.decidedAt,
    });
  });

  it('shows an explicit empty state after G1 when no G0 decision is on file', () => {
    expect(g0BoxMode('G1', null)).toEqual({ kind: 'none' });
    expect(g0BoxMode('G2', null)).toEqual({ kind: 'none' });
  });

  it('shows the live reasons list only while the opportunity is at G0 (no live reasons after G1)', () => {
    expect(g0ReasonsVisible(g0BoxMode('G0', null))).toBe(true);
    expect(g0ReasonsVisible(g0BoxMode('G1', passed))).toBe(false);
    expect(g0ReasonsVisible(g0BoxMode('G1', refused))).toBe(false);
    expect(g0ReasonsVisible(g0BoxMode('G2', null))).toBe(false);
  });
});
