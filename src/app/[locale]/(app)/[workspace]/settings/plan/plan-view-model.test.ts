import { describe, expect, it } from 'vitest';
import type { NgPlanView } from '@/lib/billing/nexagrant/view';
import { SESSION_REQUIRED_DIGEST } from '@/lib/session-required';
import {
  defaultCurrency,
  defaultInterval,
  errorCauseForLog,
  loadErrorOf,
  loadFailureLogLine,
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

/** Stand-in for Prisma's error class: same name and `code`, no client needed. */
class PrismaClientKnownRequestError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
  }
}

/** Objects whose property reads throw (NG-290 E1 / Ö5): getters and a Proxy that throws on every `get`. */
function throwingGetter(prop: string): object {
  const err = new Error('getter target');
  Object.defineProperty(err, prop, {
    get() {
      throw new Error(`${prop} getter`);
    },
  });
  return err;
}
const hostileValues: [string, unknown][] = [
  ...['name', 'message', 'constructor', 'code', 'digest'].map((p): [string, unknown] => [`${p} getter throws`, throwingGetter(p)]),
  [
    'Proxy throws on every get',
    new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
      },
    ),
  ],
];

describe('loadFailureLogLine (NG-290)', () => {
  it('an unknown failure logs "unknown" with the class and the Prisma code, nothing else', () => {
    const err = new PrismaClientKnownRequestError('Transaction API error: Transaction already closed', 'P2028');
    expect(loadErrorOf(err)).toBe('unknown');
    expect(loadFailureLogLine('billing state', err)).toBe(
      '[NgPlanSettings] billing state unavailable: unknown (PrismaClientKnownRequestError P2028)',
    );
  });

  it('a missing session is not logged; the catalogue gap is, with its class', () => {
    expect(loadFailureLogLine('billing state', { digest: SESSION_REQUIRED_DIGEST })).toBeNull();
    const line = loadFailureLogLine('catalogue', Object.assign(new Error('no catalogue'), { digest: 'NG_CATALOGUE_MISSING' }));
    expect(line).toBe('[NgPlanSettings] catalogue unavailable: catalogue (Error)');
  });

  it('carries no part of the message: tenant names, e-mails, customer ids, connection strings stay out', () => {
    const leaky = new PrismaClientKnownRequestError(
      'No such customer: cus_NffrFeUfNV2Hib for tenant Belediye Ankara Kültür owner jane.doe@example.com ' +
        'at postgresql://app:hunter2@db.internal:5432/fabrika Got: 1234',
      'P2025',
    );
    const line = loadFailureLogLine('billing state', leaky);
    expect(line).toBe('[NgPlanSettings] billing state unavailable: unknown (PrismaClientKnownRequestError P2025)');
    for (const word of ['No such', 'cus_', 'Nffr', 'Belediye', 'Ankara', 'Kültür', 'jane', 'example.com', 'hunter2', 'db.internal', '1234', ':']) {
      expect(line!.slice('[NgPlanSettings] billing state unavailable:'.length), word).not.toContain(word);
    }
  });

  it('copes with odd thrown values and drops names or codes that are not plain identifiers', () => {
    expect(errorCauseForLog('plain string')).toBe('string');
    expect(errorCauseForLog(null)).toBe('object');
    expect(errorCauseForLog(undefined)).toBe('undefined');
    expect(errorCauseForLog({ code: 'ECONNREFUSED' })).toBe('Object ECONNREFUSED');
    expect(errorCauseForLog({ code: 'x y "z"', name: 'bad name!' })).toBe('Error');
    expect(errorCauseForLog({ code: 'cus_NffrFeUfNV2Hib for tenant Acme', name: 'jane@acme.example' })).toBe('Error');
    const timeout = Object.assign(new Error('Query read timeout'), { name: 'TimeoutError' });
    expect(errorCauseForLog(timeout)).toBe('TimeoutError');
  });

  it.each(hostileValues)('never throws when the thrown value is hostile: %s', (_label, value) => {
    expect(() => loadErrorOf(value)).not.toThrow();
    expect(loadErrorOf(value)).toBe('unknown');
    expect(() => errorCauseForLog(value)).not.toThrow();
    expect(() => loadFailureLogLine('billing state', value)).not.toThrow();
    expect(loadFailureLogLine('billing state', value)).toMatch(
      /^\[NgPlanSettings\] billing state unavailable: unknown \([A-Za-z0-9_$]+\)$/,
    );
  });

  it('a throwing name getter falls back to the constructor name; a throwing code getter drops the code', () => {
    expect(errorCauseForLog(throwingGetter('name'))).toBe('Error');
    const coded = new PrismaClientKnownRequestError('x', 'P2028');
    expect(errorCauseForLog(coded)).toBe('PrismaClientKnownRequestError P2028');
    Object.defineProperty(coded, 'code', {
      get() {
        throw new Error('code getter');
      },
    });
    expect(errorCauseForLog(coded)).toBe('PrismaClientKnownRequestError');
    expect(errorCauseForLog(new Proxy({}, { get() { throw new Error('trap'); } }))).toBe('Object');
  });
});
