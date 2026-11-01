/**
 * Disproof probe for TASK-MTT13PK0Z4ZLB / ADR-0002 phase 2.
 *
 * Runs the REAL invoice writer against the REAL local database and the REAL
 * export/filing path, once with the TCMB client reachable and once with it
 * deliberately disabled, and prints what each run actually did.
 *
 * Everything it writes happens inside a transaction that is rolled back, so the
 * database is left exactly as it was found.
 *
 *   pnpm exec tsx .tmp-be-en/probe-fx-e2e.ts on
 *   TCMB_BASE_URL=http://127.0.0.1:1 pnpm exec tsx .tmp-be-en/probe-fx-e2e.ts off
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../../../src/lib/db';
import { createInvoiceForPayment } from '../../../src/lib/billing/invoice-writer';
import {
  buildInvoiceDocument,
  type InvoiceRecord,
} from '../../../src/app/api/billing/invoices/[id]/export/invoice-document';
import { fileThrough, isFiled } from '../../../src/lib/efatura-integrator';
import { generateUblTrXml } from '../../../src/lib/efatura';

const SUPPLIER = {
  name: 'Probe Tedarikçi A.Ş.',
  vknTckn: '1000000000',
  taxOffice: 'Probe V.D.',
  address: 'Probe Cad. No:1',
  city: 'Ankara',
};

/** A stub integrator: it records whether the document ever reached an adapter. */
function integrator(reached: { value: boolean }) {
  return {
    file: async () => {
      reached.value = true;
      return { status: 'filed' as const, envelopeId: 'ENV-PROBE-1', filedAt: new Date().toISOString() };
    },
  };
}

class Rollback extends Error {}

async function main() {
  const mode = process.argv[2] ?? 'on';
  console.log(`### MODE: TCMB ${mode.toUpperCase()}  (TCMB_BASE_URL=${process.env.TCMB_BASE_URL ?? '<real tcmb.gov.tr>'})`);

  const before = await prisma.invoice.count();
  console.log(`Invoice rows before: ${before}`);

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findFirstOrThrow({ select: { id: true } });
      await tx.tenantBillingIdentity.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          buyerName: 'Probe Alıcı Ltd. Şti.',
          buyerVknTckn: '2840958172',
          buyerTaxOffice: 'Kadıköy V.D.',
          buyerAddress: 'Bağdat Cad. No:10',
          buyerCity: 'İstanbul',
          buyerCountry: 'Türkiye',
        },
        update: {},
      });

      const result = await createInvoiceForPayment(tx, {
        tenantId: tenant.id,
        paymentRef: `probe_${mode}_${Date.now()}`,
        amountMinor: 9900,
        currency: 'USD',
        description: 'Fabrika Pro — aylık abonelik',
        paidAt: new Date('2026-09-08T09:00:00.000Z'),
        provider: 'stripe',
      }, { vatRateRaw: '20' });

      console.log(`createInvoiceForPayment(USD) -> ${JSON.stringify(result)}`);

      if (result.status !== 'issued') {
        console.log('No invoice row was written, so there is no document to file.');
        console.log('TL equivalent written anywhere?  none — no row exists.');

        // What the pre-existing rate-less USD row does at the filing gate:
        const rateless = await tx.invoice.findFirst({
          where: { currency: { not: 'TRY' }, fxRate: null },
          select: RECORD_SELECT,
        });
        if (rateless) {
          const reached = { value: false };
          const outcome = await fileThrough(integrator(reached), buildInvoiceDocument(rateless as InvoiceRecord, SUPPLIER));
          console.log(`A rate-less USD row at the filing gate -> ${JSON.stringify(outcome)}`);
          console.log(`reached the integrator adapter? ${reached.value}`);
        }
        throw new Rollback();
      }

      const row = await tx.invoice.findUniqueOrThrow({
        where: { id: result.id },
        select: RECORD_SELECT,
      });
      console.log('Stored FX columns:', JSON.stringify({
        currency: row.currency,
        fxRate: row.fxRate?.toString() ?? null,
        fxRateDate: row.fxRateDate?.toISOString().slice(0, 10) ?? null,
        fxRateSource: row.fxRateSource,
        grandTotalTryMinor: row.grandTotalTryMinor,
      }));

      const doc = buildInvoiceDocument(row as InvoiceRecord, SUPPLIER);
      const reached = { value: false };
      const outcome = await fileThrough(integrator(reached), doc);
      console.log(`fileThrough -> ${JSON.stringify(outcome)}  (filed=${isFiled(outcome)}, reached adapter=${reached.value})`);

      const xml = generateUblTrXml(doc);
      const block = /<cac:PricingExchangeRate>[\s\S]*?<\/cac:PricingExchangeRate>/.exec(xml);
      console.log('UBL-TR PricingExchangeRate block:\n' + (block?.[0] ?? '(absent)'));

      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
    console.log('(transaction rolled back — nothing persisted)');
  }

  console.log(`Invoice rows after: ${await prisma.invoice.count()}`);
  await prisma.$disconnect();
}

const RECORD_SELECT = {
  number: true, issuedAt: true, currency: true, buyerName: true, buyerVknTckn: true,
  buyerTaxOffice: true, buyerAddress: true, buyerCity: true, buyerCountry: true,
  lines: true, profileId: true, invoiceType: true, ettn: true, gibEnvelopeId: true,
  fxRate: true, fxRateDate: true, fxRateSource: true, grandTotalTryMinor: true,
} as const;

main().catch(async (e: unknown) => {
  console.error(String(e));
  await prisma.$disconnect();
  process.exit(1);
});
