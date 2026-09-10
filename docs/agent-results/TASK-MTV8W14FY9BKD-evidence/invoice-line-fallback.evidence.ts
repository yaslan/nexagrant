/**
 * TASK-MTV8W14FY9BKD — evidence run, NOT a committed test.
 *
 * Drives the real `logInvoicePayment` against the real database (only Stripe's
 * own API is stubbed, because the provider is the one thing a test may not
 * reach), for a tenant whose locale is `tr` and a tenant whose locale is `en`,
 * with a Stripe invoice that carries NO line description — so the fallback
 * branch is the one that runs. Then renders the stored row through the same
 * document builder the export route uses and prints the description cell.
 */
import { describe, it, expect, vi } from 'vitest';

const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock('stripe', () => ({
  default: class {
    subscriptions = { retrieve };
  },
}));

import { prisma } from '@/lib/db';
import { logInvoicePayment } from '@/lib/billing/subscription-sync';
import { buildInvoiceDocument } from '@/app/api/billing/invoices/[id]/export/invoice-document';
import { generateEfaturaHtml } from '@/lib/efatura';

const STAMP = `ev-${Date.now()}`;

const BUYER = {
  buyerName: 'Örnek Teknoloji A.Ş.',
  buyerVknTckn: '2840958172',
  buyerTaxOffice: 'Doğanbey V.D.',
  buyerAddress: 'ODTÜ Teknokent Blok B No:1',
  buyerCity: 'Ankara',
  buyerCountry: 'Türkiye',
};

const SUPPLIER = {
  name: 'FonBridge Teknoloji A.Ş.',
  vknTckn: '1234567890',
  taxOffice: 'Kızılay V.D.',
  address: 'Cyberpark A Blok',
  city: 'Ankara',
  country: 'Türkiye',
  email: 'fatura@example.test',
};

async function makeTenant(locale: string) {
  const t = await prisma.tenant.create({
    data: { name: `Ev ${locale} ${STAMP}`, slug: `ev-${locale}-${STAMP}`, country: 'TR', locale },
  });
  await prisma.tenantBillingIdentity.create({ data: { tenantId: t.id, ...BUYER } });
  return t;
}

/** A paid Stripe invoice whose line carries no description at all. */
function emptyLineInvoice(id: string) {
  return {
    id,
    subscription: 'sub_ev_1',
    amount_paid: 120_000,
    currency: 'try',
    hosted_invoice_url: 'https://stripe.test/i/ev',
    lines: { data: [{ description: '' }] },
  } as never;
}

describe('TASK-MTV8W14FY9BKD evidence', () => {
  it('writes and renders the fallback line in the tenant own language', async () => {
    const created: string[] = [];
    try {
      for (const locale of ['tr', 'en'] as const) {
        const tenant = await makeTenant(locale);
        created.push(tenant.id);
        retrieve.mockResolvedValue({ metadata: { tenantId: tenant.id } });

        const payRef = `in_ev_${locale}_${STAMP}`;
        await logInvoicePayment(emptyLineInvoice(payRef), `evt_ev_${locale}_${STAMP}`);

        const row = await prisma.invoice.findFirst({ where: { tenantId: tenant.id } });
        expect(row, `no invoice row written for ${locale}`).toBeTruthy();

        const lines = row!.lines as Array<{ name: string; unitCode: string }>;
        console.log(`\n===== Tenant.locale = "${locale}" =====`);
        console.log(`  Invoice number   : ${row!.number}`);
        console.log(`  paymentRef       : ${row!.paymentRef}`);
        console.log(`  STORED line name : ${lines[0]!.name}`);

        const doc = buildInvoiceDocument(row as never, SUPPLIER);
        const html = generateEfaturaHtml(doc, locale);
        // The whole line row as the customer sees it on the downloaded page.
        const row0 = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
          .map((m) => m[1]!)
          .find((tr) => tr.includes(lines[0]!.name));
        expect(row0, `fallback line not printed on the ${locale} page`).toBeTruthy();
        const cells = [...row0!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
          m[1]!.replace(/<[^>]*>/g, '').trim()
        );
        console.log(`  RENDERED row     : ${cells.join(' | ')}`);
        console.log(`  page contains it : ${html.includes(lines[0]!.name)}`);
      }
    } finally {
      for (const id of created) {
        await prisma.invoice.deleteMany({ where: { tenantId: id } });
        await prisma.auditEvent.deleteMany({ where: { tenantId: id } });
        await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: id } });
        await prisma.tenant.delete({ where: { id } });
      }
    }
  }, 60_000);
});
