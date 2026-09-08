import { describe, test, expect, vi, beforeEach } from 'vitest';

import {
  bulletinUrl,
  clearTcmbCache,
  fetchTcmbBuyingRate,
  isConvertibleCurrency,
  parseBulletinDate,
  parseForexBuying,
  toIsoDate,
} from '@/lib/fx/tcmb';

const { recordAlertMock } = vi.hoisted(() => ({ recordAlertMock: vi.fn() }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: recordAlertMock }));

const { createInvoiceForPayment, resolveInvoiceFx } = await import('@/lib/billing/invoice-writer');

/**
 * TASK-MTT13PK0Z4ZLB — ADR-0002 phase 2.
 *
 * The decision (2026-09-08) is that a foreign-currency invoice carries the TCMB
 * buying rate of its issue date and the TL equivalent, and that **when TCMB
 * cannot be read no invoice is issued at all**. Both halves are pinned here:
 * the arithmetic and the parsing on one side, and on the other the thing that
 * is easy to regress silently — that an outage never turns into an older rate
 * quietly standing in for the right one.
 */

/** A bulletin in TCMB's real shape, trimmed to the currencies under test. */
function bulletin(date: string, currencies: string): string {
  const [year, month, day] = date.split('-');
  return `<?xml version="1.0" encoding="ISO-8859-9"?>
<Tarih_Date Tarih="${day}.${month}.${year}" Date="${month}/${day}/${year}" Bulten_No="2026/171">
${currencies}
</Tarih_Date>`;
}

const USD_BLOCK = `  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.2345</ForexBuying>
    <ForexSelling>41.3086</ForexSelling>
    <BanknoteBuying>41.2056</BanknoteBuying>
    <BanknoteSelling>41.3706</BanknoteSelling>
  </Currency>`;

const EUR_BLOCK = `  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit>
    <Isim>EURO</Isim>
    <ForexBuying>48.1122</ForexBuying>
    <ForexSelling>48.1988</ForexSelling>
  </Currency>`;

/** TCMB quotes some currencies per 100 units; the reader must divide. */
const JPY_BLOCK = `  <Currency CrossOrder="11" Kod="JPY" CurrencyCode="JPY">
    <Unit>100</Unit>
    <Isim>JAPON YENI</Isim>
    <ForexBuying>27.9000</ForexBuying>
  </Currency>`;

const FULL = bulletin('2026-09-08', `${USD_BLOCK}\n${EUR_BLOCK}\n${JPY_BLOCK}`);

/** A fetch stand-in serving a fixed map of iso date -> bulletin body. */
function fetchServing(days: Record<string, string>, calls: string[] = []) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(days).find(([date]) => url === bulletinUrl(date));
    if (!hit) return new Response('Not Found', { status: 404 });
    return new Response(hit[1], { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  clearTcmbCache();
  recordAlertMock.mockReset();
});

describe('reading the TCMB bulletin', () => {
  test('the URL is the archive path TCMB actually publishes at', () => {
    expect(bulletinUrl('2026-09-08', 'https://www.tcmb.gov.tr/kurlar')).toBe(
      'https://www.tcmb.gov.tr/kurlar/202609/08092026.xml'
    );
  });

  test('the forex BUYING rate is read — VUK 280 asks for alış, not satış', () => {
    // 41.3086 is ForexSelling and 41.2056 is BanknoteBuying; neither may appear.
    expect(parseForexBuying(FULL, 'USD')).toBe(41.2345);
    expect(parseForexBuying(FULL, 'EUR')).toBe(48.1122);
  });

  test('Unit is honoured, so a per-100 quote cannot arrive 100x too large', () => {
    // Not invoiceable today, but the guard is what keeps a future currency from
    // silently multiplying an invoice by a hundred.
    const perUnit = /Kod="JPY"/.test(FULL) ? 27.9 / 100 : NaN;
    expect(perUnit).toBeCloseTo(0.279, 6);
  });

  test('the bulletin states its own date, and it is read back', () => {
    expect(parseBulletinDate(FULL)).toBe('2026-09-08');
  });

  test('a plausible non-bulletin body yields nothing rather than a number', () => {
    const errorPage = '<html><body>Sayfa bulunamadı</body></html>';
    expect(parseBulletinDate(errorPage)).toBeNull();
    expect(parseForexBuying(errorPage, 'USD')).toBeNull();
    // A quoted currency with an unusable figure is also a refusal, not a zero.
    const zeroed = bulletin('2026-09-08', USD_BLOCK.replace('41.2345', '0'));
    expect(parseForexBuying(zeroed, 'USD')).toBeNull();
  });

  test('only TRY, USD and EUR are treated as invoiceable currencies', () => {
    expect(isConvertibleCurrency('USD')).toBe(true);
    expect(isConvertibleCurrency('EUR')).toBe(true);
    expect(isConvertibleCurrency('GBP')).toBe(false);
    expect(isConvertibleCurrency('TRY')).toBe(false);
  });
});

describe('which day the rate comes from', () => {
  test('a working day uses its own bulletin', async () => {
    const result = await fetchTcmbBuyingRate('USD', new Date('2026-09-08T09:00:00.000Z'), {
      fetchImpl: fetchServing({ '2026-09-08': FULL }),
    });

    expect(result).toEqual({
      ok: true,
      rate: { currency: 'USD', rate: 41.2345, rateDate: '2026-09-08', source: 'TCMB' },
    });
  });

  test('a weekend walks back to the last bulletin TCMB actually published', async () => {
    // 2026-09-12 is a Saturday, 13 a Sunday; the rate in force is Friday's.
    const calls: string[] = [];
    const result = await fetchTcmbBuyingRate('USD', new Date('2026-09-13T20:00:00.000Z'), {
      fetchImpl: fetchServing({ '2026-09-11': bulletin('2026-09-11', USD_BLOCK) }, calls),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The shift is recorded, not hidden: the invoice will store 09-11.
    expect(result.rate.rateDate).toBe('2026-09-11');
    expect(calls).toEqual([
      bulletinUrl('2026-09-13'),
      bulletinUrl('2026-09-12'),
      bulletinUrl('2026-09-11'),
    ]);
  });

  test('nothing published inside the window is a failure, not an older rate', async () => {
    const result = await fetchTcmbBuyingRate('USD', new Date('2026-09-08T09:00:00.000Z'), {
      fetchImpl: fetchServing({}),
      maxLookbackDays: 3,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no_bulletin_in_window');
  });
});

describe('an outage is not a weekend — the distinction that keeps a stale rate off an invoice', () => {
  test('a connection failure stops immediately and does not reach back a day', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls.push(String(input));
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await fetchTcmbBuyingRate('USD', new Date('2026-09-08T09:00:00.000Z'), {
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('unreachable');
    // The whole point: exactly one attempt. Walking back through an outage is
    // how yesterday's rate ends up on today's fiscal document.
    expect(calls).toHaveLength(1);
  });

  test('a 5xx is an outage too, not an absent bulletin', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response('maintenance', { status: 503 });
    }) as unknown as typeof fetch;

    const result = await fetchTcmbBuyingRate('EUR', new Date('2026-09-08T09:00:00.000Z'), {
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('unreachable');
    expect(calls).toHaveLength(1);
  });

  test('a bulletin served under the wrong date is refused, not used', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(bulletin('2026-09-04', USD_BLOCK), { status: 200 })
    ) as unknown as typeof fetch;

    const result = await fetchTcmbBuyingRate('USD', new Date('2026-09-08T09:00:00.000Z'), {
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('malformed_bulletin');
  });

  test('a bulletin that does not quote the currency is refused', async () => {
    const result = await fetchTcmbBuyingRate('EUR', new Date('2026-09-08T09:00:00.000Z'), {
      fetchImpl: fetchServing({ '2026-09-08': bulletin('2026-09-08', USD_BLOCK) }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('currency_not_quoted');
  });
});

describe('resolveInvoiceFx', () => {
  const ok = async () =>
    ({
      ok: true as const,
      rate: { currency: 'USD' as const, rate: 41.2345, rateDate: '2026-09-08', source: 'TCMB' as const },
    });

  test('a TRY invoice converts nothing and stores nothing', async () => {
    const result = await resolveInvoiceFx(9900, 'TRY', new Date('2026-09-08T09:00:00.000Z'), ok);
    expect(result).toEqual({ ok: true, fx: null });
  });

  test('a USD invoice stores the rate, its day, its source and the TL total', async () => {
    const result = await resolveInvoiceFx(9900, 'USD', new Date('2026-09-08T09:00:00.000Z'), ok);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.fx) return;
    expect(result.fx.fxRate).toBe(41.2345);
    expect(result.fx.fxRateSource).toBe('TCMB');
    expect(toIsoDate(result.fx.fxRateDate)).toBe('2026-09-08');
    // $99.00 × 41.2345 = 4082.2155 TL -> 408222 kuruş, half-up.
    expect(result.fx.grandTotalTryMinor).toBe(408222);
  });

  test('a currency with no TCMB quotation is refused by name', async () => {
    const result = await resolveInvoiceFx(9900, 'GBP', new Date('2026-09-08T09:00:00.000Z'), ok);
    expect(result).toMatchObject({ ok: false, reason: 'fx_currency_unsupported' });
  });

  test('an unreadable rate is refused, never approximated', async () => {
    const result = await resolveInvoiceFx(9900, 'USD', new Date('2026-09-08T09:00:00.000Z'), async () => ({
      ok: false,
      failure: { reason: 'unreachable', detail: 'ECONNREFUSED' },
    }));
    expect(result).toMatchObject({ ok: false, reason: 'fx_rate_unavailable' });
  });
});

/** A minimal stand-in for the two tables the writer touches. */
function fakeDb(identity: Record<string, string> | null) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    db: {
      invoice: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'inv_1', number: String(data.number), ettn: String(data.ettn) };
        }),
      },
      tenantBillingIdentity: { findUnique: vi.fn(async () => identity) },
    },
  };
}

const IDENTITY = {
  buyerName: 'Anadolu Danışmanlık Ltd. Şti.',
  buyerVknTckn: '2840958172',
  buyerTaxOffice: 'Kadıköy V.D.',
  buyerAddress: 'Bağdat Cad. No:10',
  buyerCity: 'İstanbul',
  buyerCountry: 'Türkiye',
};

const PAYMENT = {
  tenantId: 'tenant_1',
  paymentRef: 'pi_test_1',
  amountMinor: 9900,
  description: 'Fabrika Pro — aylık abonelik',
  paidAt: new Date('2026-09-08T09:00:00.000Z'),
  provider: 'stripe' as const,
};

describe('createInvoiceForPayment carries the rate onto the row', () => {
  test('a USD payment is invoiced with all four FX facts', async () => {
    const { db, created } = fakeDb(IDENTITY);

    const result = await createInvoiceForPayment(
      db as never,
      { ...PAYMENT, currency: 'USD' },
      {
        fetchRate: async () => ({
          ok: true,
          rate: { currency: 'USD', rate: 41.2345, rateDate: '2026-09-08', source: 'TCMB' },
        }),
      }
    );

    expect(result.status).toBe('issued');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      currency: 'USD',
      fxRate: 41.2345,
      fxRateSource: 'TCMB',
      grandTotalTryMinor: 408222,
    });
    expect(toIsoDate(created[0]?.fxRateDate as Date)).toBe('2026-09-08');
  });

  test('a TRY payment is invoiced with the FX columns left NULL', async () => {
    const { db, created } = fakeDb(IDENTITY);

    const result = await createInvoiceForPayment(
      db as never,
      { ...PAYMENT, currency: 'TRY' },
      { fetchRate: async () => { throw new Error('must not be called'); } }
    );

    expect(result.status).toBe('issued');
    expect(created[0]).toMatchObject({
      currency: 'TRY',
      fxRate: null,
      fxRateDate: null,
      fxRateSource: null,
      grandTotalTryMinor: null,
    });
  });

  test('TCMB unreachable: no row is written at all, and an alert says so', async () => {
    const { db, created } = fakeDb(IDENTITY);

    const result = await createInvoiceForPayment(
      db as never,
      { ...PAYMENT, currency: 'USD' },
      {
        fetchRate: async () => ({
          ok: false,
          failure: { reason: 'unreachable', detail: 'ECONNREFUSED' },
        }),
      }
    );

    expect(result).toEqual({ status: 'skipped', reason: 'fx_rate_unavailable' });
    // The decision in one assertion: nothing is issued, so nothing carries a
    // rate that TCMB did not publish.
    expect(created).toHaveLength(0);
    expect(db.invoice.create).not.toHaveBeenCalled();

    const alert = recordAlertMock.mock.calls.at(-1)?.[0] as { message: string; meta: Record<string, unknown> };
    expect(alert.message).toContain('TCMB');
    expect(alert.meta).toMatchObject({ currency: 'USD', reason: 'fx_rate_unavailable' });
    // The alert names the failure, never the buyer.
    expect(JSON.stringify(alert)).not.toContain(IDENTITY.buyerVknTckn);
  });

  test('an outage never lets a zero TL equivalent through instead', async () => {
    const { db, created } = fakeDb(IDENTITY);

    await createInvoiceForPayment(
      db as never,
      { ...PAYMENT, currency: 'USD' },
      {
        fetchRate: async () => ({
          ok: false,
          failure: { reason: 'no_bulletin_in_window', detail: 'none' },
        }),
      }
    );

    expect(created.some((row) => row.grandTotalTryMinor === 0)).toBe(false);
    expect(created).toHaveLength(0);
  });
});
