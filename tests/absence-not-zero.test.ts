import { describe, test, expect } from 'vitest';

import {
  averageG0ToG2Days,
  averageLensScore,
  hitRate,
  personDaysPerProposal,
  NOT_MEASURED,
} from '../src/modules/m5/server/metrics';
import {
  averageLensTotal,
  lensMarks,
  lensTotal,
  readerTypeOf,
} from '../src/modules/m6/lens-scores';

/**
 * TASK-MTQWBAJ2T5XSV — "absence is not zero".
 *
 * The dashboard told a workspace with no opportunities that its hit rate was 0.0 %,
 * and the Evaluator Lens gave an unfilled evaluation a verdict of "0.0 / 15.0 (below
 * threshold)". Both are statements about work nobody has done.
 *
 * These tests pin the two halves of the rule, because only pinning one is how the bug
 * comes back: absence must not render as zero, AND a real zero must still render as
 * zero. The second half is the one a careless fix breaks.
 */

const day = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

describe('M5 KPI — absence vs. measured zero', () => {
  describe('hitRate', () => {
    test('is unmeasured when nothing has cleared G0 scoring', () => {
      expect(hitRate(0, 0)).toEqual(NOT_MEASURED);
    });

    test('is a measured 0 when opportunities were scored but none was submitted', () => {
      // The distinction the fix exists for: this workspace HAS done the work and the
      // honest answer is zero.
      expect(hitRate(0, 5)).toEqual({ measured: true, value: 0 });
    });

    test('reports the ratio as a percentage rounded to two places', () => {
      expect(hitRate(1, 3)).toEqual({ measured: true, value: 33.33 });
      expect(hitRate(3, 4)).toEqual({ measured: true, value: 75 });
    });
  });

  describe('averageLensScore', () => {
    test('is unmeasured when no reader has scored', () => {
      expect(averageLensScore([])).toEqual(NOT_MEASURED);
    });

    test('is a measured 0 when a reader really scored 0/0/0', () => {
      expect(averageLensScore([{ excellence: 0, impact: 0, implementation: 0 }])).toEqual({
        measured: true,
        value: 0,
      });
    });

    test('averages the mean of the three criteria across readers', () => {
      expect(
        averageLensScore([
          { excellence: 4, impact: 5, implementation: 3 }, // 4
          { excellence: 2, impact: 2, implementation: 2 }, // 2
        ]),
      ).toEqual({ measured: true, value: 3 });
    });
  });

  describe('personDaysPerProposal', () => {
    test('is unmeasured with no proposal to divide by, even when hours were logged', () => {
      expect(personDaysPerProposal(40, 0)).toEqual(NOT_MEASURED);
    });

    test('is a measured 0 when proposals exist but nobody logged effort', () => {
      expect(personDaysPerProposal(0, 2)).toEqual({ measured: true, value: 0 });
    });

    test('converts hours to person-days per proposal', () => {
      expect(personDaysPerProposal(80, 2)).toEqual({ measured: true, value: 5 });
    });
  });

  describe('averageG0ToG2Days', () => {
    test('is unmeasured when no opportunity has both decisions', () => {
      expect(
        averageG0ToG2Days([{ opportunityId: 'o1', gate: 'G0', decidedAt: at('2026-01-01') }]),
      ).toEqual(NOT_MEASURED);
    });

    test('is a measured 0 when an opportunity crossed both gates the same day', () => {
      expect(
        averageG0ToG2Days([
          { opportunityId: 'o1', gate: 'G0', decidedAt: at('2026-01-01T09:00:00Z') },
          { opportunityId: 'o1', gate: 'G2', decidedAt: at('2026-01-01T17:00:00Z') },
        ]),
      ).toEqual({ measured: true, value: 0 });
    });

    test('averages only the opportunities holding both decisions', () => {
      expect(
        averageG0ToG2Days([
          { opportunityId: 'o1', gate: 'G0', decidedAt: new Date(0) },
          { opportunityId: 'o1', gate: 'G2', decidedAt: new Date(10 * day) },
          { opportunityId: 'o2', gate: 'G0', decidedAt: new Date(0) },
          { opportunityId: 'o2', gate: 'G2', decidedAt: new Date(20 * day) },
          { opportunityId: 'o3', gate: 'G0', decidedAt: new Date(0) }, // never reached G2
        ]),
      ).toEqual({ measured: true, value: 15 });
    });
  });
});

describe('M6 Evaluator Lens — absence vs. measured zero', () => {
  const row = (over: Partial<Parameters<typeof lensMarks>[0]> = {}) => ({
    readerType: 'HUMAN',
    status: 'completed',
    excellence: 4,
    impact: 4,
    implementation: 4,
    ...over,
  });

  test('a draft evaluation carries no marks, even though the columns read 0', () => {
    expect(lensMarks(row({ status: 'draft', excellence: 0, impact: 0, implementation: 0 }))).toBeNull();
  });

  test('an in-progress evaluation carries no marks', () => {
    expect(lensMarks(row({ status: 'in-progress' }))).toBeNull();
  });

  test('a PANEL row carries no lens marks — its marks live in Reviewer/Score', () => {
    // prisma/seed-m6-evaluations.ts writes exactly this: completed PANEL rows whose
    // three lens columns were never set. They used to render "0.0 / 15.0 (below threshold)".
    expect(
      lensMarks(row({ readerType: 'PANEL', excellence: 0, impact: 0, implementation: 0 })),
    ).toBeNull();
  });

  test('a completed reader who really marked 0/0/0 keeps that measured zero', () => {
    expect(lensMarks(row({ excellence: 0, impact: 0, implementation: 0 }))).toEqual({
      excellence: 0,
      impact: 0,
      implementation: 0,
    });
  });

  test('a completed AI reader carries its marks', () => {
    expect(lensMarks(row({ readerType: 'AI' }))).toEqual({
      excellence: 4,
      impact: 4,
      implementation: 4,
    });
  });

  test('readerTypeOf keeps PANEL distinct instead of folding it into HUMAN', () => {
    expect(readerTypeOf('PANEL')).toBe('PANEL');
    expect(readerTypeOf('AI')).toBe('AI');
    expect(readerTypeOf('HUMAN')).toBe('HUMAN');
    expect(readerTypeOf('something-else')).toBe('HUMAN');
  });

  describe('lensTotal', () => {
    test('sums the three criteria out of 15', () => {
      expect(lensTotal({ excellence: 5, impact: 4, implementation: 3 }, false)).toBe(12);
    });

    test('weights Impact by 1.5 for an Innovation Action', () => {
      expect(lensTotal({ excellence: 5, impact: 4, implementation: 3 }, true)).toBe(14);
    });
  });

  describe('averageLensTotal', () => {
    test('is null when no reader has scored', () => {
      expect(averageLensTotal([{ scores: null }, { scores: null }], false)).toBeNull();
    });

    test('does not average unscored rows in as zeros', () => {
      // Two untouched panel rows next to one real 12.0 must average to 12.0, not 4.0.
      expect(
        averageLensTotal(
          [
            { scores: null },
            { scores: { excellence: 5, impact: 4, implementation: 3 } },
            { scores: null },
          ],
          false,
        ),
      ).toBe(12);
    });

    test('a measured 0 still averages in as 0', () => {
      expect(
        averageLensTotal(
          [
            { scores: { excellence: 0, impact: 0, implementation: 0 } },
            { scores: { excellence: 4, impact: 4, implementation: 4 } },
          ],
          false,
        ),
      ).toBe(6);
    });
  });
});
