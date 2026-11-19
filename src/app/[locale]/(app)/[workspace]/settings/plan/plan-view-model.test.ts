import { describe, expect, it } from 'vitest';
import type { NgPlanView } from '@/lib/billing/nexagrant/view';
import { SESSION_REQUIRED_DIGEST } from '@/lib/session-required';
import {
  defaultCurrency,
  defaultInterval,
  loadErrorOf,
  matrixRows,
  offeredDimensions,
  priceStateFor,
  sortPlans,
} from './plan-view-model';

/** Test-local catalogue rows; the numbers here are fixtures, not the product's prices. */
function plan(over: Partial<NgPlanView> & Pick<NgPlanView, 'id'>): NgPlanView {
  return {
    tier: over.id,
    sortOrder: 1,
    sellable: true,
    isFallback: false,
    features: [],
    prices: [
      { currency: 'TRY', interval: 'year', amountMinor: null, purchasable: false },
      { currency: 'EUR', interval: 'year', amountMinor: null, purchasable: false },
      { currency: 'TRY', interval: 'month', amountMinor: null, purchasable: false },
      { currency: 'EUR', interval: 'month', amountMinor: null, purchasable: false },
    ],
    ...over,
  };
}

describe('priceStateFor', () => {
  it('a sellable plan with no amount is "price coming soon"', () => {
    expect(priceStateFor(plan({ id: 'b' }), 'TRY', 'year')).toEqual({ kind: 'soon' });
  });

  it('a plan that is not sold and not the fallback is "contact us"', () => {
    expect(priceStateFor(plan({ id: 'e', sellable: false }), 'EUR', 'month')).toEqual({ kind: 'contact' });
  });

  it('the fallback plan is "free"', () => {
    expect(priceStateFor(plan({ id: 'f', sellable: false, isFallback: true }), 'TRY', 'month')).toEqual({ kind: 'free' });
  });

  it('a purchasable cell shows its own amount for the selected currency and interval only', () => {
    const p = plan({
      id: 'p',
      prices: [
        { currency: 'TRY', interval: 'year', amountMinor: 123456, purchasable: true },
        { currency: 'EUR', interval: 'year', amountMinor: null, purchasable: false },
      ],
    });
    expect(priceStateFor(p, 'TRY', 'year')).toEqual({ kind: 'price', amountMinor: 123456, currency: 'TRY', interval: 'year' });
    expect(priceStateFor(p, 'EUR', 'year')).toEqual({ kind: 'soon' });
    // No cell at all for this combination: not invented.
    expect(priceStateFor(p, 'TRY', 'month')).toEqual({ kind: 'soon' });
  });

  it('an amount the server did not mark purchasable is not shown as a price', () => {
    const p = plan({ id: 'x', prices: [{ currency: 'EUR', interval: 'year', amountMinor: 900, purchasable: false }] });
    expect(priceStateFor(p, 'EUR', 'year')).toEqual({ kind: 'soon' });
  });
});

describe('sortPlans', () => {
  it('orders by the catalogue sortOrder, not by the input order', () => {
    const out = sortPlans([plan({ id: 'c', sortOrder: 3 }), plan({ id: 'a', sortOrder: 1 }), plan({ id: 'b', sortOrder: 2 })]);
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('matrixRows', () => {
  it('lists only granted features, in vocabulary order, with null for a plan that lacks one', () => {
    const plans = [
      plan({ id: 'f', features: [{ key: 'seats', limit: 1 }, { key: 'org_profile', limit: null }] }),
      plan({ id: 'p', features: [{ key: 'org_profile', limit: null }, { key: 'partner_search', limit: null }, { key: 'seats', limit: null }] }),
    ];
    const rows = matrixRows(plans);
    expect(rows.map((r) => r.key)).toEqual(['org_profile', 'partner_search', 'seats']);
    expect(rows[1]?.cells).toEqual([null, { key: 'partner_search', limit: null }]);
    expect(rows[2]?.cells).toEqual([{ key: 'seats', limit: 1 }, { key: 'seats', limit: null }]);
  });

  it('an empty catalogue has no rows', () => {
    expect(matrixRows([])).toEqual([]);
  });
});

describe('offered dimensions and defaults', () => {
  it('reads currencies and intervals from the price cells', () => {
    expect(offeredDimensions([plan({ id: 'a' })])).toEqual({ currencies: ['TRY', 'EUR'], intervals: ['year', 'month'] });
    expect(offeredDimensions([])).toEqual({ currencies: [], intervals: [] });
  });

  it('Turkish UI shows TL first, any other locale euro; falls back to what is offered', () => {
    expect(defaultCurrency('tr', ['TRY', 'EUR'])).toBe('TRY');
    expect(defaultCurrency('en', ['TRY', 'EUR'])).toBe('EUR');
    expect(defaultCurrency('en', ['TRY'])).toBe('TRY');
    expect(defaultCurrency('tr', [])).toBeNull();
  });

  it('yearly first when offered', () => {
    expect(defaultInterval(['month', 'year'])).toBe('year');
    expect(defaultInterval(['month'])).toBe('month');
    expect(defaultInterval([])).toBeNull();
  });
});

describe('loadErrorOf', () => {
  it('maps the contract digests and hides everything else', () => {
    expect(loadErrorOf({ digest: SESSION_REQUIRED_DIGEST })).toBe('session');
    expect(loadErrorOf({ code: 'NG_CATALOGUE_MISSING' })).toBe('catalogue');
    expect(loadErrorOf(Object.assign(new Error('x'), { digest: 'NG_CATALOGUE_MISSING' }))).toBe('catalogue');
    expect(loadErrorOf(new Error('relation "NgPlan" does not exist'))).toBe('unknown');
    expect(loadErrorOf(null)).toBe('unknown');
  });
});
