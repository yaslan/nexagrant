/**
 * Disproof probe for TASK-MTT1WUUS7MN7R.
 *
 * Runs the REAL invoice writer against the REAL local database for a Turkish
 * buyer and a Kuwaiti buyer, reads the stored row back with SQL, and prints
 * what it found. Everything is written inside a transaction that is rolled
 * back, so the database is left exactly as it was.
 *
 *   pnpm exec tsx .tmp-be-en/probe-vat-country.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../../../src/lib/db';
import { createInvoiceForPayment } from '../../../src/lib/billing/invoice-writer';
import { resolveVatRate } from '../../../src/lib/billing/vat-rate';
import { supportedVatCountries } from '../../../src/lib/billing/vat-rates';

class Rollback extends Error {}

/** $45.00 — the Basic monthly list price, VAT-exclusive. */
const NET_MINOR = 4500;

const CASES = [
  { label: 'TR buyer (Türkiye)', country: 'Türkiye' },
  { label: 'KW buyer (Kuveyt)', country: 'Kuveyt' },
];

async function main() {
  console.log(`sourced countries in the table: ${supportedVatCountries().join(', ') || '(none)'}`);
  for (const c of CASES) {
    console.log(`resolveVatRate(${JSON.stringify(c.country)}) -> ${JSON.stringify(resolveVatRate(c.country))}`);
  }
  console.log(`Invoice rows before: ${await prisma.invoice.count()}`);

  for (const c of CASES) {
    console.log(`\n──────── ${c.label} ────────`);
    const vat = resolveVatRate(c.country);
    // What checkout would charge: the VAT-exclusive list price plus the tax.
    const rate = vat.status === 'resolved' ? vat.ratePercent : 0;
    const chargedMinor = NET_MINOR + Math.floor((NET_MINOR * rate) / 100 + 0.5);
    console.log(`net list price   : ${NET_MINOR} minor (USD $45.00, KDV hariç)`);
    console.log(`charged by checkout: ${chargedMinor} minor  (net + ${rate}% VAT)`);

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
            buyerCountry: c.country,
          },
          update: { buyerCountry: c.country },
        });

        const result = await createInvoiceForPayment(tx, {
          tenantId: tenant.id,
          paymentRef: `probe_vat_${Date.now()}_${c.country}`,
          amountMinor: chargedMinor,
          currency: 'USD',
          description: 'Fabrika Basic — aylık abonelik',
          paidAt: new Date('2026-09-08T09:00:00.000Z'),
          provider: 'stripe',
        });
        console.log(`createInvoiceForPayment -> ${JSON.stringify(result)}`);

        if (result.status !== 'issued') {
          const rows = await tx.$queryRawUnsafe(
            `select count(*)::int as n from "Invoice" where "tenantId" = $1 and "buyerCountry" = $2`,
            tenant.id,
            c.country
          );
          console.log(`SELECT count for this buyer country -> ${JSON.stringify(rows)}`);
          console.log('No row was written, so no VAT figure exists to be wrong.');
          throw new Rollback();
        }

        // Read the stored row back with SQL, not through the ORM's own view of
        // what it just wrote.
        const rows = await tx.$queryRawUnsafe(
          `select "number", "currency", "buyerCountry", "lines",
                  "fxRate"::text as "fxRate", "grandTotalTryMinor"
             from "Invoice" where "id" = $1`,
          result.id
        );
        console.log('SELECT * FROM "Invoice" (stored row):');
        console.log(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));

        const lines = (rows as Array<{ lines: Array<{ name: string; unitPriceMinor: number; vatRate: number }> }>)[0]!.lines;
        const net = lines.reduce((s, l) => s + l.unitPriceMinor, 0);
        const tax = lines.reduce((s, l) => s + Math.floor((l.unitPriceMinor * l.vatRate) / 100 + 0.5), 0);
        console.log(`reconciliation: net ${net} + VAT ${tax} = ${net + tax}  (charged ${chargedMinor}) -> ${net + tax === chargedMinor ? 'MATCHES' : 'MISMATCH'}`);
        console.log(`net stored equals the VAT-exclusive list price? ${net === NET_MINOR ? 'YES' : `NO (${net} vs ${NET_MINOR})`}`);

        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
      console.log('(transaction rolled back — nothing persisted)');
    }
  }

  console.log(`\nInvoice rows after: ${await prisma.invoice.count()}`);
  await prisma.$disconnect();
}

main().catch(async (e: unknown) => {
  console.error(String(e));
  await prisma.$disconnect();
  process.exit(1);
});
