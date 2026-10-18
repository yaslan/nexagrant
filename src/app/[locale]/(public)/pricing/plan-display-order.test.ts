import { describe, it, expect } from 'vitest';
import { PLAN_DISPLAY_ORDER, sortForDisplay } from './plan-display-order';

/**
 * The pricing page's card order (TASK-MVDWBVWOAU34T). The input orders below
 * are the ones the database actually returned: heap order, which moved Pro
 * ahead of Basic on the shared dev database.
 */
describe('sortForDisplay', () => {
  const ids = (plans: Array<{ planId: string }>) => plans.map((plan) => plan.planId);
  const byId = (plan: { planId: string }) => plan.planId;

  it('draws Basic, then Pro, then Ultra', () => {
    expect(PLAN_DISPLAY_ORDER).toEqual(['basic', 'pro', 'ultra']);
  });

  it('puts Basic before Pro whatever order the rows arrived in', () => {
    const rows = [{ planId: 'pro' }, { planId: 'basic' }, { planId: 'ultra' }];
    expect(ids(sortForDisplay(rows, byId))).toEqual(['basic', 'pro', 'ultra']);
    expect(ids(sortForDisplay([...rows].reverse(), byId))).toEqual(['basic', 'pro', 'ultra']);
  });

  it('keeps a plan it does not name, after the named ones and in arrival order', () => {
    const rows = [
      { planId: 'pro' },
      { planId: 'studio-b' },
      { planId: 'basic' },
      { planId: 'studio-a' },
      { planId: 'ultra' },
    ];
    expect(ids(sortForDisplay(rows, byId))).toEqual(['basic', 'pro', 'ultra', 'studio-b', 'studio-a']);
  });

  it('adds nothing and drops nothing when a named plan is not on offer', () => {
    // A private Basic hidden from this visitor: the order stays, the card stays gone.
    expect(ids(sortForDisplay([{ planId: 'ultra' }, { planId: 'pro' }], byId))).toEqual(['pro', 'ultra']);
  });

  it('does not reorder the array it was given', () => {
    const rows = [{ planId: 'pro' }, { planId: 'basic' }];
    sortForDisplay(rows, byId);
    expect(ids(rows)).toEqual(['pro', 'basic']);
  });
});
