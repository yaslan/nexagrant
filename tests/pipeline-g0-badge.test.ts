import { describe, expect, it, vi } from 'vitest';

/**
 * NG-69 — the board's G0 score badge and its verdict.
 *
 * A refused opportunity kept a green "⭐ 84" on the board while its detail page said GEÇME: the
 * colour was read from the number, the gate read the decision. The badge tone now follows the
 * latest G0 decision on file, and the mapping that picks that decision is pure so it can be
 * pinned here without a database.
 *
 * board.tsx imports the server-action module (next-auth), which does not resolve under vitest,
 * so the action surface is stubbed the same way pipeline-note-input-shape.test.ts does it.
 */
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/actions', () => ({
  moveOpportunityStage: vi.fn(),
  createOpportunity: vi.fn(),
  assignOpportunityOwner: vi.fn(),
  addOpportunityNote: vi.fn(),
  getOpportunityFormMembers: vi.fn(),
  getSuggestedTopics: vi.fn(),
}));

import { g0BadgeTone } from '@/app/[locale]/(app)/[workspace]/pipeline/board';
import { latestG0PassedByOpportunity } from '@/lib/gates/latest-g0-decision';

describe('g0BadgeTone — the colour follows the latest G0 decision, not the number', () => {
  it('is green only when the latest G0 decision passed', () => {
    expect(g0BadgeTone(true)).toBe('ok');
  });

  it('is not green when the latest G0 decision refused, even above the old 80 line', () => {
    expect(g0BadgeTone(false)).toBe('amber');
  });

  it('is not green when no G0 decision is on file', () => {
    expect(g0BadgeTone(null)).toBe('amber');
    expect(g0BadgeTone(undefined)).toBe('amber');
  });
});

describe('latestG0PassedByOpportunity — the newest decision wins', () => {
  it('a fresh refusal outranks an older pass (rows arrive newest first)', () => {
    const map = latestG0PassedByOpportunity([
      { opportunityId: 'opp-1', passed: false },
      { opportunityId: 'opp-1', passed: true },
    ]);
    expect(map.get('opp-1')).toBe(false);
  });

  it('a fresh pass outranks an older refusal', () => {
    const map = latestG0PassedByOpportunity([
      { opportunityId: 'opp-1', passed: true },
      { opportunityId: 'opp-1', passed: false },
    ]);
    expect(map.get('opp-1')).toBe(true);
  });

  it('an opportunity with no decision is absent, not false', () => {
    const map = latestG0PassedByOpportunity([{ opportunityId: 'opp-1', passed: true }]);
    expect(map.has('opp-2')).toBe(false);
    expect(map.get('opp-2')).toBeUndefined();
  });

  it('keeps each opportunity separate', () => {
    const map = latestG0PassedByOpportunity([
      { opportunityId: 'opp-a', passed: false },
      { opportunityId: 'opp-b', passed: true },
    ]);
    expect(map.get('opp-a')).toBe(false);
    expect(map.get('opp-b')).toBe(true);
  });
});
