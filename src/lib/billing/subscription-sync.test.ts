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
  const prisma: Record<string, unknown> = {
    auditEvent: { findFirst: vi.fn(), create: vi.fn() },
    invoice: { findFirst: vi.fn(), create: vi.fn() },
    tenantBillingIdentity: { findUnique: vi.fn() },
    systemAlert: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  };
  return { prisma };
});

import { logInvoicePayment } from './subscription-sync';
import { prisma } from '@/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

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
  db.invoice.findFirst.mockResolvedValue(null);
  db.invoice.create.mockResolvedValue({
    id: 'inv_1',
    number: 'FB-2026-000001',
    ettn: 'ettn-1',
  });
  db.systemAlert.create.mockResolvedValue({ id: 'alert_1' });
  db.systemAlert.findMany.mockResolvedValue([]);
  db.tenantBillingIdentity.findUnique.mockResolvedValue(IDENTITY);
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
    expect(db.auditEvent.create).toHaveBeenCalledTimes(1);
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
    expect(db.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('writes nothing at all when the subscription carries no tenant', async () => {
    retrieve.mockResolvedValue({ metadata: {} });

    await logInvoicePayment(paidInvoice(), 'evt_5');

    expect(db.auditEvent.create).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });
});
