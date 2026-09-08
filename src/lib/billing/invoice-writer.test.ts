import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  ASSUMED_PROFILE_ID,
  createInvoiceForPayment,
  decomposeGrossAmount,
  formatInvoiceNumber,
  nextSequence,
  parseVatRate,
  ROUNDING_LINE_NAME,
  type InvoiceWriterDb,
  type PaymentForInvoice,
} from './invoice-writer';

/** `meta` is part of what an alert has to prove: it names the gap without naming the taxpayer. */
type CapturedAlert = { level: string; source: string; message: string; meta?: Record<string, unknown> };
const alerts: CapturedAlert[] = [];

vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (input: CapturedAlert) => {
    alerts.push(input);
    return { status: 'recorded', id: 'alert-1' };
  }),
}));

/**
 * A stand-in for the two tables the writer touches. Enough to exercise the
 * number allocation and the unique index, and nothing more — the real
 * behaviour against Postgres is covered by tests/e2e/invoice-write-path.spec.ts.
 */
function fakeDb(options: {
  identity?: Record<string, string> | null;
  rows?: Array<{ number: string; paymentRef: string | null }>;
  /** Reject this many creates with a unique violation before accepting one. */
  collisions?: number;
} = {}): InvoiceWriterDb & { created: Array<Record<string, unknown>> } {
  const rows = [...(options.rows ?? [])];
  const created: Array<Record<string, unknown>> = [];
  let collisions = options.collisions ?? 0;

  return {
    created,
    invoice: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const where = args.where as {
          paymentRef?: string;
          number?: { startsWith: string };
        };
        if (where.paymentRef !== undefined) {
          return rows.find((r) => r.paymentRef === where.paymentRef) ?? null;
        }
        const prefix = where.number?.startsWith ?? '';
        const matching = rows
          .filter((r) => r.number.startsWith(prefix))
          .sort((a, b) => (a.number < b.number ? 1 : -1));
        return matching[0] ?? null;
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if (collisions > 0) {
          collisions -= 1;
          // Simulate the row another transaction committed first.
          rows.push({ number: args.data.number as string, paymentRef: 'someone-else' });
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        created.push(args.data);
        rows.push({
          number: args.data.number as string,
          paymentRef: args.data.paymentRef as string,
        });
        return { id: 'inv_1', number: args.data.number, ettn: args.data.ettn };
      }),
    },
    tenantBillingIdentity: {
      findUnique: vi.fn(async () =>
        options.identity === undefined ? completeIdentity() : options.identity
      ),
    },
  } as unknown as InvoiceWriterDb & { created: Array<Record<string, unknown>> };
}

function completeIdentity() {
  return {
    buyerName: 'Örnek Teknoloji A.Ş.',
    buyerVknTckn: '2840958172',
    buyerTaxOffice: 'Doğanbey V.D.',
    buyerAddress: 'ODTÜ Teknokent Blok B',
    buyerCity: 'Ankara',
    buyerCountry: 'Türkiye',
  };
}

function payment(overrides: Partial<PaymentForInvoice> = {}): PaymentForInvoice {
  return {
    tenantId: 'tenant-1',
    paymentRef: 'pay_1',
    amountMinor: 120_000,
    currency: 'TRY',
    description: 'Fabrika Pro (1 ay)',
    paidAt: new Date('2026-09-08T10:00:00.000Z'),
    provider: 'iyzico',
    ...overrides,
  };
}

beforeEach(() => {
  alerts.length = 0;
});

describe('parseVatRate', () => {
  it('treats 0 as a real rate and not as "unset"', () => {
    // A sale genuinely outside VAT is not the same fact as a rate nobody set,
    // and only one of the two may produce an invoice.
    expect(parseVatRate('0')).toBe(0);
  });

  it('rejects an unset, blank or out-of-range value', () => {
    for (const raw of [undefined, '', '   ', 'twenty', '-1', '101', 'NaN']) {
      expect(parseVatRate(raw)).toBeNull();
    }
  });

  it('accepts a plain percentage', () => {
    expect(parseVatRate('20')).toBe(20);
    expect(parseVatRate(' 18 ')).toBe(18);
  });
});

describe('decomposeGrossAmount', () => {
  /**
   * The invariant that matters: net + VAT + rounding must land exactly on the
   * amount the card was charged, so the document total can never disagree with the
   * receipt. `calculateInvoiceTotals` recomputes the VAT from the net, so the
   * VAT asserted here is recomputed the same way.
   */
  it('reconstructs the charged amount exactly, for every amount and rate swept', () => {
    for (const rate of [0, 1, 8, 10, 18, 20]) {
      for (let gross = 1; gross <= 5000; gross += 1) {
        const result = decomposeGrossAmount(gross, rate);
        expect(result, `gross=${gross} rate=${rate}`).not.toBeNull();
        const { netMinor, vatMinor, roundingMinor } = result!;
        expect(netMinor).toBeGreaterThan(0);
        expect(Math.round((netMinor * rate) / 100)).toBe(vatMinor);
        expect(netMinor + vatMinor + roundingMinor).toBe(gross);
      }
    }
  });

  /**
   * The reason the rounding line exists at all. `net + round(net × rate/100)`
   * skips integers — at 20% it reaches only five of every six — so without a
   * remainder about one payment in six could not be invoiced. The remainder
   * that closes the gap must stay negligible, or it would be a price change
   * hiding in the arithmetic.
   */
  it('never needs more than one minor unit of rounding', () => {
    for (const rate of [0, 1, 8, 10, 18, 20]) {
      for (let gross = 1; gross <= 5000; gross += 1) {
        expect(decomposeGrossAmount(gross, rate)!.roundingMinor).toBeLessThanOrEqual(1);
      }
    }
  });

  it('splits a round 20% charge with nothing left over', () => {
    expect(decomposeGrossAmount(120_000, 20)).toEqual({
      netMinor: 100_000,
      vatMinor: 20_000,
      roundingMinor: 0,
    });
  });

  it('carries the remainder for a charge the rate cannot divide', () => {
    // ₺0.03 at 20%: net 2 → VAT 0 → 2; net 3 → VAT 1 → 4. Neither is 3, so the
    // odd kuruş becomes its own line instead of the sale going uninvoiced.
    expect(decomposeGrossAmount(3, 20)).toEqual({
      netMinor: 2,
      vatMinor: 0,
      roundingMinor: 1,
    });
  });

  it('leaves the whole amount net when the rate is zero', () => {
    expect(decomposeGrossAmount(45_678, 0)).toEqual({
      netMinor: 45_678,
      vatMinor: 0,
      roundingMinor: 0,
    });
  });

  it('refuses a non-positive or fractional amount', () => {
    expect(decomposeGrossAmount(0, 20)).toBeNull();
    expect(decomposeGrossAmount(-100, 20)).toBeNull();
    expect(decomposeGrossAmount(10.5, 20)).toBeNull();
  });
});

describe('invoice numbering', () => {
  it('formats the number the customer cites', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('FB-2026-000001');
    expect(formatInvoiceNumber(2026, 123456)).toBe('FB-2026-123456');
  });

  it('continues the tenant’s series and restarts each year', () => {
    expect(nextSequence(null, 2026)).toBe(1);
    expect(nextSequence('FB-2026-000041', 2026)).toBe(42);
    // Last year's number is not this year's predecessor.
    expect(nextSequence('FB-2025-000900', 2026)).toBe(1);
    // Anything unparseable restarts; the unique index is the real guard.
    expect(nextSequence('INV-7', 2026)).toBe(1);
  });
});

describe('createInvoiceForPayment — when no invoice may be issued', () => {
  it('issues nothing and names the fields when the tenant has no billing identity', async () => {
    const db = fakeDb({ identity: null });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toEqual({
      status: 'skipped',
      reason: 'buyer_identity_missing',
      missing: [
        'buyerName',
        'buyerVknTckn',
        'buyerTaxOffice',
        'buyerAddress',
        'buyerCity',
      ],
    });
    expect(db.created).toHaveLength(0);
    expect(alerts.map((a) => a.source)).toContain('invoice_buyer_identity_missing');
  });

  it('treats a blank field as unset rather than invoicing a blank taxpayer', async () => {
    const db = fakeDb({ identity: { ...completeIdentity(), buyerVknTckn: '   ' } });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toMatchObject({ status: 'skipped', missing: ['buyerVknTckn'] });
    expect(db.created).toHaveLength(0);
  });

  it('never puts the buyer’s tax number into the alert trail', async () => {
    const db = fakeDb({ identity: { ...completeIdentity(), buyerTaxOffice: '' } });

    await createInvoiceForPayment(db, payment());

    expect(JSON.stringify(alerts)).not.toContain('2840958172');
  });

  it('issues nothing when no VAT rate is sourced for the buyer’s country', async () => {
    // Assuming 20% because the neighbouring row says so is how a made-up figure
    // reaches a fiscal document (boss decision 2026-09-08).
    const db = fakeDb({ identity: { ...completeIdentity(), buyerCountry: 'Ruritanya' } });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toEqual({ status: 'skipped', reason: 'vat_country_unknown' });
    expect(db.created).toHaveLength(0);
    const alert = alerts.at(-1)!;
    expect(alert.source).toBe('invoice_vat_country_unknown');
    expect(JSON.stringify(alert)).toContain('Ruritanya');
    expect(JSON.stringify(alert)).toContain('vat-rates.ts');
    // The alert names the country and the table, never the taxpayer.
    expect(JSON.stringify(alert)).not.toContain('2840958172');
  });

  it('issues nothing for an EU buyer, and says the regime — not the rate — is missing', async () => {
    // Belgium's rate is in the table at 21%. It still may not be charged: a
    // Türkiye-resident supplier does not normally charge EU VAT. The operator
    // must not be told to "add the country" — it is already there.
    const db = fakeDb({ identity: { ...completeIdentity(), buyerCountry: 'Belçika' } });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toEqual({ status: 'skipped', reason: 'vat_country_unknown' });
    expect(db.created).toHaveLength(0);
    const alert = alerts.at(-1)!;
    expect(alert.meta).toMatchObject({ reason: 'regime_not_chargeable', country: 'BE', regime: 'unknown' });
    expect(alert.message).toContain('reverse charge');
    expect(alert.message).not.toContain('Add the country');
  });

  it('issues nothing when the billing identity carries a blank country', async () => {
    const db = fakeDb({ identity: { ...completeIdentity(), buyerCountry: '   ' } });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toEqual({ status: 'skipped', reason: 'vat_country_unknown' });
    expect(db.created).toHaveLength(0);
  });

  it('treats a zero-VAT country as an answer, not as a missing rate', async () => {
    // Kuwait levies no VAT. `0` must issue an invoice with no tax line — the
    // opposite of "no rate configured", which issues nothing at all.
    const db = fakeDb({ identity: { ...completeIdentity(), buyerCountry: 'Kuveyt' } });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toMatchObject({ status: 'issued' });
    const lines = db.created[0]!.lines as Array<{ vatRate: number; unitPriceMinor: number }>;
    expect(lines.every((line) => line.vatRate === 0)).toBe(true);
    // Nothing is taken out for tax, so the whole charge is the net price.
    expect(lines.reduce((sum, line) => sum + line.unitPriceMinor, 0)).toBe(payment().amountMinor);
  });

  it('issues nothing for a zero or negative charge', async () => {
    const db = fakeDb();

    const result = await createInvoiceForPayment(db, payment({ amountMinor: 0 }));

    expect(result).toMatchObject({ status: 'skipped', reason: 'amount_not_invoiceable' });
    expect(db.created).toHaveLength(0);
  });
});

describe('createInvoiceForPayment — when an invoice is issued', () => {
  it('writes one row with the buyer frozen onto it and the net price stored', async () => {
    const db = fakeDb();

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toMatchObject({ status: 'issued', number: 'FB-2026-000001' });
    expect(db.created).toHaveLength(1);
    const row = db.created[0]!;
    expect(row).toMatchObject({
      tenantId: 'tenant-1',
      number: 'FB-2026-000001',
      currency: 'TRY',
      buyerVknTckn: '2840958172',
      profileId: ASSUMED_PROFILE_ID,
      invoiceType: 'SATIS',
      paymentRef: 'pay_1',
      // Not filed with GİB, and the row must not pretend otherwise.
      gibEnvelopeId: null,
    });
    // ₺1200 charged at 20% is stored as ₺1000 net; the exporter adds the VAT back.
    expect(row.lines).toEqual([
      {
        name: 'Fabrika Pro (1 ay)',
        quantity: 1,
        unitCode: 'MON',
        unitPriceMinor: 100_000,
        vatRate: 20,
      },
    ]);
    expect(row.ettn).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('puts the odd kuruş on its own zero-VAT line so the total matches the charge', async () => {
    // ₺0.03 at 20% cannot be expressed as one net line; without the rounding
    // line this sale could not be invoiced at all.
    const db = fakeDb();

    const result = await createInvoiceForPayment(db, payment({ amountMinor: 3 }));

    expect(result).toMatchObject({ status: 'issued' });
    expect(db.created[0]!.lines).toEqual([
      { name: 'Fabrika Pro (1 ay)', quantity: 1, unitCode: 'MON', unitPriceMinor: 2, vatRate: 20 },
      { name: ROUNDING_LINE_NAME, quantity: 1, unitCode: 'C62', unitPriceMinor: 1, vatRate: 0 },
    ]);
  });

  it('flags that the e-Fatura profile was assumed, not resolved', async () => {
    const db = fakeDb();

    await createInvoiceForPayment(db, payment());

    expect(alerts.map((a) => a.source)).toContain('invoice_profile_assumed');
  });

  it('continues the tenant’s existing series', async () => {
    const db = fakeDb({
      rows: [
        { number: 'FB-2026-000001', paymentRef: 'pay_old' },
        { number: 'FB-2026-000002', paymentRef: 'pay_older' },
      ],
    });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toMatchObject({ status: 'issued', number: 'FB-2026-000003' });
  });

  it('issues no second document when the payment was already invoiced', async () => {
    const db = fakeDb({ rows: [{ number: 'FB-2026-000007', paymentRef: 'pay_1' }] });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toEqual({ status: 'already_issued', number: 'FB-2026-000007' });
    expect(db.created).toHaveLength(0);
  });

  it('takes the next number when another payment wins the race', async () => {
    // The first create loses to a concurrent commit on FB-2026-000001.
    const db = fakeDb({ collisions: 1 });

    const result = await createInvoiceForPayment(db, payment());

    expect(result).toMatchObject({ status: 'issued', number: 'FB-2026-000002' });
    expect(db.created).toHaveLength(1);
  });
});
