import { describe, it, expect } from 'vitest';
import {
  buildReportData,
  gaborGranger,
  median,
  parsePricingResponses,
  summariseSegments,
  vanWestendorp,
  formatEur,
  formatPct,
} from '@/lib/beta/pricing-analysis';
import { responseCsvHeader } from '@/lib/beta/pricing-survey';

const HEADER = responseCsvHeader();

interface RowOverrides {
  [key: string]: string | number;
}

/** A complete, valid response row; overrides replace named columns. */
function row(overrides: RowOverrides = {}): string {
  const base: Record<string, string | number> = {
    respondentId: 'R1',
    slug: 'acme',
    country: 'TR',
    orgType: 'SME',
    locale: 'tr',
    submittedAt: '2026-10-20',
    segment: 'sme',
    teamSize: 4,
    proposalsPerYear: 5,
    currentSpendEur: 500,
    vwTooCheap: 50,
    vwCheap: 150,
    vwExpensive: 300,
    vwTooExpensive: 500,
    gg149: 'yes',
    gg199: 'yes',
    gg249: 'no',
    gg299: 'no',
    gg349: 'no',
    planChoice: 'team',
    seatsNeeded: 5,
    workspacesNeeded: 1,
    addons: 'addon_m6',
    creditsEnough: 'no',
    billingCycle: 'monthly',
    currencyPref: 'EUR',
    needsEInvoice: 'yes',
    successFee: 'conditional',
    convertDiscountPct: 30,
    payLikelihood: 8,
    comment: '',
  };
  Object.assign(base, overrides);
  return HEADER.split(',')
    .map((column) => {
      const value = String(base[column] ?? '');
      return /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(',');
}

function csv(rows: string[], banner = ''): string {
  return [banner, HEADER, ...rows].filter(Boolean).join('\n') + '\n';
}

describe('parsePricingResponses', () => {
  it('parses a valid row', () => {
    const parsed = parsePricingResponses(csv([row()]));
    expect(parsed.rejected).toEqual([]);
    expect(parsed.responses).toHaveLength(1);
    expect(parsed.responses[0]).toMatchObject({ respondentId: 'R1', segment: 'sme', payLikelihood: 8 });
    expect(parsed.responses[0]?.gaborGranger.get(14900)).toBe(true);
    expect(parsed.responses[0]?.gaborGranger.get(24900)).toBe(false);
  });

  it('rejects a row whose Van Westendorp prices are out of order, with a reason', () => {
    const parsed = parsePricingResponses(csv([row({ vwCheap: 400 })]));
    expect(parsed.responses).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0]?.reason).toMatch(/not ordered/);
    expect(parsed.rejected[0]?.respondentId).toBe('R1');
  });

  it('rejects rather than drops a duplicate respondent', () => {
    const parsed = parsePricingResponses(csv([row(), row()]));
    expect(parsed.responses).toHaveLength(1);
    expect(parsed.rejected[0]?.reason).toMatch(/duplicate/);
  });

  it('rejects an out-of-range scale and a missing required field', () => {
    const parsed = parsePricingResponses(
      csv([row({ respondentId: 'A', payLikelihood: 11 }), row({ respondentId: 'B', segment: '' })])
    );
    expect(parsed.responses).toHaveLength(0);
    expect(parsed.rejected.map((r) => r.reason)).toEqual([
      expect.stringMatching(/payLikelihood/),
      expect.stringMatching(/segment/),
    ]);
  });

  it('keeps a rejected row out of the denominator but visible in the report', () => {
    const data = buildReportData(parsePricingResponses(csv([row({ respondentId: 'A' }), row({ respondentId: 'B', vwCheap: 900 })])));
    expect(data.n).toBe(1);
    expect(data.rejected).toHaveLength(1);
  });

  it('reads the dataset status banner', () => {
    expect(parsePricingResponses(csv([row()], '# STATUS: FIXTURE synthetic')).status).toBe('FIXTURE');
    expect(parsePricingResponses(csv([row()], '# STATUS: FIXTURE synthetic')).statusNote).toBe('synthetic');
    expect(parsePricingResponses(csv([row()], '# STATUS: REAL')).status).toBe('REAL');
    expect(parsePricingResponses(csv([row()])).status).toBe('UNDECLARED');
  });

  it('treats `none` as no add-ons and splits a list on semicolons', () => {
    expect(parsePricingResponses(csv([row({ addons: 'none' })])).responses[0]?.addons).toEqual([]);
    expect(
      parsePricingResponses(csv([row({ addons: 'addon_m6;addon_m11' })])).responses[0]?.addons
    ).toEqual(['addon_m6', 'addon_m11']);
  });

  it('reads money columns as euro and stores minor units', () => {
    // The form asks a human for euro; everything downstream is Int cents. Getting
    // this boundary wrong is a silent 100× error, so it is pinned here.
    const parsed = parsePricingResponses(csv([row({ vwCheap: 149, currentSpendEur: 800 })]));
    expect(parsed.responses[0]?.vwCheap).toBe(14900);
    expect(parsed.responses[0]?.currentSpendEurCents).toBe(80000);
  });

  it('tolerates a decimal, a comma decimal and a euro sign', () => {
    const parsed = parsePricingResponses(csv([row({ vwCheap: '149.50' })]));
    expect(parsed.responses[0]?.vwCheap).toBe(14950);
    expect(parsePricingResponses(csv([row({ vwCheap: '149,50' })])).responses[0]?.vwCheap).toBe(14950);
    expect(parsePricingResponses(csv([row({ vwCheap: '€150' })])).responses[0]?.vwCheap).toBe(15000);
  });

  it('refuses a money value with more precision than a cent', () => {
    expect(parsePricingResponses(csv([row({ vwCheap: '149.567' })])).rejected[0]?.reason).toMatch(/two decimals/);
  });

  it('accepts an empty optional spend but not a malformed one', () => {
    expect(parsePricingResponses(csv([row({ currentSpendEur: '' })])).responses[0]?.currentSpendEurCents).toBeNull();
    expect(parsePricingResponses(csv([row({ currentSpendEur: 'lots' })])).rejected).toHaveLength(1);
  });
});

describe('vanWestendorp', () => {
  // Three identical respondents at 100 / 200 / 300 / 400 cents make every curve a
  // step function, so all four intersections can be worked out by hand.
  const identical = parsePricingResponses(
    csv(
      ['A', 'B', 'C'].map((id) =>
        row({ respondentId: id, vwTooCheap: 1, vwCheap: 2, vwExpensive: 3, vwTooExpensive: 4 })
      )
    )
  ).responses;

  it('finds the indifference point by interpolating a real crossing', () => {
    // cheap and expensive cross between 200 and 300, symmetrically → 250.
    expect(vanWestendorp(identical).ippCents).toBe(250);
  });

  it('reports the midpoint of a plateau instead of its left edge', () => {
    // Nobody calls anything too cheap above 100 or too expensive below 400, so the
    // difference is flat zero across [200, 300]; the honest optimum is its middle.
    expect(vanWestendorp(identical).oppCents).toBe(250);
    expect(vanWestendorp(identical).pmcCents).toBe(200);
    expect(vanWestendorp(identical).pmeCents).toBe(300);
  });

  it('orders the band PMC ≤ OPP ≤ PME on a spread sample', () => {
    const responses = parsePricingResponses(
      csv([
        row({ respondentId: 'A', vwTooCheap: 49, vwCheap: 99, vwExpensive: 249, vwTooExpensive: 399 }),
        row({ respondentId: 'B', vwTooCheap: 99, vwCheap: 199, vwExpensive: 399, vwTooExpensive: 699 }),
        row({ respondentId: 'C', vwTooCheap: 29, vwCheap: 79, vwExpensive: 199, vwTooExpensive: 349 }),
        row({ respondentId: 'D', vwTooCheap: 59, vwCheap: 149, vwExpensive: 299, vwTooExpensive: 499 }),
      ])
    ).responses;
    const vw = vanWestendorp(responses);
    expect(vw.pmcCents).not.toBeNull();
    expect(vw.pmeCents).not.toBeNull();
    expect(vw.oppCents).not.toBeNull();
    expect(vw.pmcCents!).toBeLessThanOrEqual(vw.oppCents!);
    expect(vw.oppCents!).toBeLessThanOrEqual(vw.pmeCents!);
  });

  it('returns nulls rather than a number for an empty sample', () => {
    const vw = vanWestendorp([]);
    expect(vw).toMatchObject({ n: 0, pmcCents: null, oppCents: null, pmeCents: null, ippCents: null });
  });
});

describe('gaborGranger', () => {
  const responses = parsePricingResponses(
    csv([
      row({ respondentId: 'A', gg149: 'yes', gg199: 'yes', gg249: 'yes', gg299: 'no', gg349: 'no' }),
      row({ respondentId: 'B', gg149: 'yes', gg199: 'yes', gg249: 'no', gg299: 'no', gg349: 'no' }),
      row({ respondentId: 'C', gg149: 'yes', gg199: 'no', gg249: 'no', gg299: 'no', gg349: 'no' }),
    ])
  ).responses;

  it('maximises the revenue index rather than acceptance', () => {
    const gg = gaborGranger(responses);
    // 149×3 = 447 · 199×2 = 398 · 249×1 = 249 → the cheapest rung wins here.
    expect(gg.ladder.map((r) => r.buyers)).toEqual([3, 2, 1, 0, 0]);
    expect(gg.bestPriceCents).toBe(14900);
    expect(gg.ladder[0]?.acceptance).toBeCloseTo(1);
  });

  it('flags a respondent who says yes above a price they refused', () => {
    const mixed = parsePricingResponses(
      csv([row({ respondentId: 'Z', gg149: 'no', gg199: 'yes', gg249: 'no', gg299: 'no', gg349: 'no' })])
    ).responses;
    expect(gaborGranger(mixed).nonMonotonic).toEqual(['Z']);
    expect(gaborGranger(responses).nonMonotonic).toEqual([]);
  });
});

describe('rollups', () => {
  it('summarises only the segments that answered', () => {
    const responses = parsePricingResponses(
      csv([
        row({ respondentId: 'A', segment: 'sme', seatsNeeded: 4, convertDiscountPct: 20, payLikelihood: 8 }),
        row({ respondentId: 'B', segment: 'sme', seatsNeeded: 6, convertDiscountPct: 40, payLikelihood: 6 }),
        row({ respondentId: 'C', segment: 'consultancy', seatsNeeded: 12, convertDiscountPct: 10, payLikelihood: 9 }),
      ])
    ).responses;
    const segments = summariseSegments(responses);
    expect(segments.map((s) => s.segment)).toEqual(['sme', 'consultancy']);
    expect(segments[0]).toMatchObject({ n: 2, medianSeats: 5, medianDiscountAskPct: 30, meanPayLikelihood: 7 });
  });

  it('counts committed respondents at 8 and above', () => {
    const data = buildReportData(
      parsePricingResponses(
        csv([
          row({ respondentId: 'A', payLikelihood: 8 }),
          row({ respondentId: 'B', payLikelihood: 7 }),
          row({ respondentId: 'C', payLikelihood: 10 }),
          row({ respondentId: 'D', payLikelihood: 0 }),
        ])
      )
    );
    expect(data.committedShare).toBe(0.5);
    expect(data.discountAskP75Pct).toBe(30);
  });

  it('tallies add-on demand across respondents, ignoring `none`', () => {
    const data = buildReportData(
      parsePricingResponses(
        csv([
          row({ respondentId: 'A', addons: 'addon_m6;addon_m11' }),
          row({ respondentId: 'B', addons: 'addon_m6' }),
          row({ respondentId: 'C', addons: 'none' }),
        ])
      )
    );
    expect(data.addonDemand[0]).toMatchObject({ key: 'addon_m6', count: 2 });
    expect(data.addonDemand.some((d) => d.key === 'none')).toBe(false);
  });
});

describe('formatting helpers', () => {
  it('renders cents as whole euro and never as arithmetic input', () => {
    expect(formatEur(24900)).toBe('€249');
    expect(formatEur(null)).toBe('—');
  });

  it('puts the percent sign first, as Turkish does', () => {
    expect(formatPct(0.667)).toBe('%67');
    expect(formatPct(null)).toBe('—');
  });

  it('takes the median of an even sample as the rounded midpoint', () => {
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});
