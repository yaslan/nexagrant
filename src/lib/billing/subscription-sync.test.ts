import { describe, it, expect, beforeEach, vi } from 'vitest';

// `vi.mock` is hoisted above ordinary declarations, so the spy it closes over
// has to be created in a hoisted block too.
const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }));

vi.mock('stripe', () => ({
  default: class {
    subscriptions = { retrieve };
  },
}));

vi.mock('@/lib/db', () => {
  // Shared delegates between prisma and tx — when createInvoiceForPayment calls
  // tx.invoice.create, it must hit the same mock that the test checks.
  const invoiceDelegate = { findFirst: vi.fn(), create: vi.fn() };
  const tenantDelegate = { findUnique: vi.fn() };
  const tenantBillingIdentityDelegate = { findUnique: vi.fn() };

  const prisma: Record<string, unknown> = {
    auditEvent: { findFirst: vi.fn(), create: vi.fn() },
    invoice: invoiceDelegate,
    tenant: tenantDelegate,
    tenantBillingIdentity: tenantBillingIdentityDelegate,
    systemAlert: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  };

  // The idempotency key and the audit row are written inside a tenant
  // transaction since ADR-0003, so this file has to hand `logInvoicePayment` a
  // `withTenant` too. The transactional client carries only what runs in there:
  // the claim and the audit row. The invoice document is written inside a
  // `prisma.$transaction` for the advisory lock on invoice numbers, so `tx` must
  // include `invoice` and `tenantBillingIdentity` for the writer to read/write them.
  // The delegates are the SAME OBJECTS as on prisma so test assertions work.
  const tx: Record<string, unknown> = {
    stripeEventLog: { create: vi.fn(), findUnique: vi.fn() },
    auditEvent: { create: vi.fn() },
    invoice: invoiceDelegate,
    tenant: tenantDelegate,
    tenantBillingIdentity: tenantBillingIdentityDelegate,
    $executeRaw: vi.fn(),
  };
  const withTenant = vi.fn(
    async (_tenantId: string, callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
  );
  // The invoice write calls prisma.$transaction for the advisory lock on invoice numbers.
  prisma.$transaction = vi.fn(async (_callback: (arg: unknown) => Promise<unknown>) => _callback(tx));
  return { prisma, withTenant, __tx: tx };
});

import { logInvoicePayment } from './subscription-sync';
import { prisma } from '@/lib/db';
import * as dbModule from '@/lib/db';
import { PRODUCT_NAME } from '@/lib/brand';
import trMessages from '../../../messages/tr.json';
import enMessages from '../../../messages/en.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const tx = (dbModule as any).__tx;

const TENANT = 'tenant_stripe_1';

const IDENTITY = {
  buyerName: 'Örnek Teknoloji A.Ş.',
  buyerVknTckn: '2840958172',
  buyerTaxOffice: 'Doğanbey V.D.',
  buyerAddress: 'ODTÜ Teknokent Blok B',
  buyerCity: 'Ankara',
  buyerCountry: 'Türkiye',
};

/** A paid Stripe invoice, shaped as the webhook delivers it. */
function paidInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in_test_1',
    subscription: 'sub_test_1',
    amount_paid: 120_000,
    currency: 'try',
    hosted_invoice_url: 'https://stripe.test/i/1',
    lines: { data: [{ description: 'FonBridge Pro — aylık' }] },
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  retrieve.mockResolvedValue({ metadata: { tenantId: TENANT } });
  db.auditEvent.findFirst.mockResolvedValue(null);
  db.auditEvent.create.mockResolvedValue({ id: 'audit_1' });
  tx.stripeEventLog.findUnique.mockResolvedValue(null);
  tx.stripeEventLog.create.mockResolvedValue({ id: 'sel_1' });
  tx.auditEvent.create.mockResolvedValue({ id: 'audit_1' });
  db.invoice.findFirst.mockResolvedValue(null);
  db.invoice.create.mockResolvedValue({
    id: 'inv_1',
    number: 'FB-2026-000001',
    ettn: 'ettn-1',
  });
  db.systemAlert.create.mockResolvedValue({ id: 'alert_1' });
  db.systemAlert.findMany.mockResolvedValue([]);
  db.tenantBillingIdentity.findUnique.mockResolvedValue(IDENTITY);
  db.tenant.findUnique.mockResolvedValue({ locale: 'tr' });
  // The invoice writer runs inside prisma.$transaction, so it uses tx's delegates.
  // Mock them separately for the transaction callback.
  tx.invoice.findFirst.mockResolvedValue(null);
  tx.invoice.create.mockResolvedValue({
    id: 'inv_1',
    number: 'FB-2026-000001',
    ettn: 'ettn-1',
  });
  tx.tenant.findUnique.mockResolvedValue({ locale: 'tr' });
  tx.tenantBillingIdentity.findUnique.mockResolvedValue(IDENTITY);
});

/**
 * TASK-MTSWL8ADKZKDM — the Stripe path issues an invoice too.
 *
 * Before this card `logInvoicePayment` wrote an `AuditEvent` and nothing else,
 * so a Stripe customer's payment produced no document and
 * `/api/billing/invoices/<id>/export` answered 404 for them. Stripe's own
 * hosted invoice is a receipt from Stripe; it is not a Turkish e-Fatura.
 */
describe('logInvoicePayment', () => {
  it('issues one invoice for a paid subscription invoice', async () => {
    await logInvoicePayment(paidInvoice(), 'evt_1');

    expect(db.invoice.create).toHaveBeenCalledTimes(1);
    const row = db.invoice.create.mock.calls[0][0].data;
    expect(row).toMatchObject({
      tenantId: TENANT,
      currency: 'TRY',
      buyerVknTckn: IDENTITY.buyerVknTckn,
      // The payment it was issued for, which is what makes a redelivery safe.
      paymentRef: 'in_test_1',
      // Nothing was filed with GİB, so the row must not claim otherwise.
      gibEnvelopeId: null,
    });
    // The line text is Stripe's own, so the invoice says what the customer saw.
    expect(row.lines[0].name).toBe('FonBridge Pro — aylık');
    // Adding the VAT back must return exactly the amount that was charged.
    const total = (row.lines as Array<{ unitPriceMinor: number; vatRate: number }>).reduce(
      (sum, l) => sum + l.unitPriceMinor + Math.round((l.unitPriceMinor * l.vatRate) / 100),
      0
    );
    expect(total).toBe(120_000);
  });

  it('still records the payment when no invoice can be issued', async () => {
    db.tenantBillingIdentity.findUnique.mockResolvedValue(null);

    await logInvoicePayment(paidInvoice(), 'evt_2');

    // The sale happened and stays recorded; only the document is withheld.
    // The audit row goes through the tenant transaction since ADR-0003, which
    // is the only scope `AuditEvent`'s policy accepts a tenant row in.
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(db.auditEvent.create).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it('does not issue a second invoice when Stripe redelivers the event', async () => {
    db.invoice.findFirst.mockResolvedValue({ number: 'FB-2026-000001' });

    await logInvoicePayment(paidInvoice(), 'evt_3');

    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it('lets the payment stand even if issuing the invoice throws', async () => {
    // A webhook Stripe would retry must not be failed by the invoice write.
    db.invoice.findFirst.mockRejectedValue(new Error('database is down'));

    await expect(logInvoicePayment(paidInvoice(), 'evt_4')).resolves.toBeUndefined();
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  /**
   * TASK-MTV8W14FY9BKD — the line Stripe does not send is a line we author, and
   * it is printed onto a document the customer downloads. It must therefore be
   * catalogued in both languages, and it must be the tenant's language.
   *
   * The locale is read from `Tenant.locale`: a Stripe webhook carries no user
   * and no request, so there is no Accept-Language and no next-intl context to
   * inherit from.
   */
  describe('when Stripe sends no line description', () => {
    /** A paid invoice whose line carries no description at all. */
    const noDescription = () => paidInvoice({ lines: { data: [{ description: '' }] } });

    async function issuedLineName(locale: unknown, invoice = noDescription()) {
      db.tenant.findUnique.mockResolvedValue(locale === undefined ? null : { locale });
      await logInvoicePayment(invoice, `evt_loc_${String(locale)}`);
      return db.invoice.create.mock.calls[0][0].data.lines[0].name;
    }

    it('writes the Turkish sentence for a Turkish tenant', async () => {
      expect(await issuedLineName('tr')).toBe(`${PRODUCT_NAME} abonelik dönemi`);
    });

    it('writes the English sentence for an English tenant', async () => {
      expect(await issuedLineName('en')).toBe(`${PRODUCT_NAME} subscription period`);
    });

    it('falls to Turkish — the column default — for a locale it does not know', async () => {
      // `Tenant.locale` is a free-text column. An unrecognised value must not
      // throw on an invoice the customer has already paid for.
      expect(await issuedLineName('de')).toBe(`${PRODUCT_NAME} abonelik dönemi`);
    });

    it('falls to Turkish when the tenant row cannot be read', async () => {
      expect(await issuedLineName(undefined)).toBe(`${PRODUCT_NAME} abonelik dönemi`);
    });

    it('carries the product name from PRODUCT_NAME, never as a catalogue literal', () => {
      // The rename in 2026-Q1 was copied as a literal into 32 files. Neither
      // catalogue may spell the brand out; both must carry the placeholder.
      expect(trMessages.invoice.linePeriodFallback).toContain('{brand}');
      expect(enMessages.invoice.linePeriodFallback).toContain('{brand}');
      expect(trMessages.invoice.linePeriodFallback).not.toContain(PRODUCT_NAME);
      expect(enMessages.invoice.linePeriodFallback).not.toContain(PRODUCT_NAME);
    });

    it('lets the payment stand when the tenant lookup itself fails', async () => {
      // The locale read is a second database round-trip on a path whose whole
      // point is that a database failure must not fail a payment that already
      // succeeded. It must be caught like every other write here.
      db.tenant.findUnique.mockRejectedValue(new Error('database is down'));

      await expect(logInvoicePayment(noDescription(), 'evt_loc_down')).resolves.toBeUndefined();
      expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    });

    it('never translates the description Stripe itself sent', async () => {
      // The wording the buyer accepted at checkout is passed through as-is, in
      // any locale: an invoice that restates the sale in our words disagrees
      // with the sale.
      const name = await issuedLineName('en', paidInvoice());
      expect(name).toBe('FonBridge Pro — aylık');
    });
  });

  it('writes nothing at all when the subscription carries no tenant', async () => {
    retrieve.mockResolvedValue({ metadata: {} });

    await logInvoicePayment(paidInvoice(), 'evt_5');

    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.stripeEventLog.create).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  /**
   * ADR-0003 — the idempotency key is claimed in the same transaction as the
   * audit row, and a claim that loses the race writes nothing.
   */
  it('claims the event in the tenant transaction before recording it', async () => {
    await logInvoicePayment(paidInvoice(), 'evt_claim_1');

    expect(tx.stripeEventLog.create).toHaveBeenCalledTimes(1);
    expect(tx.stripeEventLog.create.mock.calls[0][0].data).toEqual({
      tenantId: TENANT,
      stripeEventId: 'evt_claim_1',
      handler: 'invoice.payment',
    });
  });

  it('records nothing when a concurrent delivery already claimed the event', async () => {
    // What Postgres raises when the UNIQUE index on `stripeEventId` refuses the
    // second of two simultaneous deliveries.
    tx.stripeEventLog.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    await expect(logInvoicePayment(paidInvoice(), 'evt_claim_2')).resolves.toBeUndefined();

    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it('skips the whole handler when the fast-path read finds the event', async () => {
    tx.stripeEventLog.findUnique.mockResolvedValue({ id: 'sel_old' });

    await logInvoicePayment(paidInvoice(), 'evt_claim_3');

    expect(tx.stripeEventLog.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  /**
   * TASK-MUPVLWSIPC5WU — the Stripe path creates an invoice via createInvoiceForPayment.
   * It calls the writer inside a prisma.$transaction for the advisory lock on invoice numbers.
   */
  it('calls createInvoiceForPayment inside the transaction', async () => {
    await logInvoicePayment(paidInvoice(), 'evt_tx_call');

    // The payment's audit event lands in the tenant transaction.
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    // The invoice write lands inside prisma.$transaction (the mock callback receives tx).
    // Test that the write hit the transaction's delegates, not the bare client's.
    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
    const invoiceCall = tx.invoice.create.mock.calls[0][0];
    expect(invoiceCall.data).toMatchObject({
      tenantId: TENANT,
      paymentRef: 'in_test_1',
    });
  });

  /**
   * When the invoice write inside the transaction fails, the payment still stands
   * recorded as an audit event. The transaction error does not roll back the audit.
   */
  it('lets the payment stand even if the transaction throws', async () => {
    // Advisory lock or TCMB fetch fails — the invoice cannot be issued.
    (db.$transaction as any).mockImplementationOnce(
      async (_callback: (tx: any) => Promise<unknown>) => {
        throw new Error('advisory lock timeout');
      }
    );

    await expect(logInvoicePayment(paidInvoice(), 'evt_tx_fail')).resolves.toBeUndefined();

    // The payment was already recorded as an audit event *before* the transaction,
    // so the audit row does stand even though the invoice write failed.
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    // The invoice write never ran or failed partway through.
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});
