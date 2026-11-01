/**
 * QA probe — TASK-MTSWLWDONWA3W re-verification at HEAD (blok-zincir-denet-i).
 * Runs the REAL invoice writer, REAL export document builder and REAL filing
 * gate against the REAL local database. Everything is rolled back.
 *   pnpm exec tsx .qa-fx-verify.mts
 *   TCMB_BASE_URL=http://127.0.0.1:1 pnpm exec tsx .qa-fx-verify.mts
 */
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../../../src/lib/db';
import { createInvoiceForPayment } from '../../../src/lib/billing/invoice-writer';
import { buildInvoiceDocument, type InvoiceRecord } from '../../../src/app/api/billing/invoices/[id]/export/invoice-document';
import { fileThrough, isFiled } from '../../../src/lib/efatura-integrator';
import { generateUblTrXml, generateEfaturaHtml, foreignCurrencyFilingBlock, calculateInvoiceTotals } from '../../../src/lib/efatura';

const SUPPLIER = {
  name: 'QA Tedarikçi A.Ş.', vknTckn: '1000000000', taxOffice: 'QA V.D.',
  address: 'QA Cad. No:1', city: 'Ankara', country: 'Türkiye',
};
const RECORD_SELECT = {
  number: true, issuedAt: true, currency: true, buyerName: true, buyerVknTckn: true,
  buyerTaxOffice: true, buyerAddress: true, buyerCity: true, buyerCountry: true,
  lines: true, profileId: true, invoiceType: true, ettn: true, gibEnvelopeId: true,
  fxRate: true, fxRateDate: true, fxRateSource: true, grandTotalTryMinor: true,
} as const;

function integrator(reached: { value: boolean }) {
  return { file: async () => { reached.value = true; return { status: 'filed' as const, envelopeId: 'ENV-QA-1', filedAt: new Date().toISOString() }; } };
}
class Rollback extends Error {}
const OUTAGE = (process.env.TCMB_BASE_URL ?? '').includes('127.0.0.1');

async function main() {
  console.log(`### TCMB_BASE_URL = ${process.env.TCMB_BASE_URL ?? '<real tcmb.gov.tr>'}`);
  const before = await prisma.invoice.count();
  const alertsBefore = await prisma.systemAlert.count();
  console.log(`Invoice rows before: ${before} | SystemAlert rows before: ${alertsBefore}`);

  if (!OUTAGE) {
    console.log('\n--- A. Schema: does the DB really carry the columns? ---');
    console.log(JSON.stringify(await prisma.$queryRawUnsafe(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_name='Invoice' and column_name in ('currency','fxRate','fxRateDate','fxRateSource','grandTotalTryMinor')
       order by column_name`)));
    console.log(JSON.stringify(await prisma.$queryRawUnsafe(
      `select conname, convalidated, pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid='"Invoice"'::regclass and contype='c'`)));
  }

  const tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;

  for (const currency of ['USD', 'TRY'] as const) {
    console.log(`\n--- B. Real path: ${currency} 99.00 charge ---`);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.tenantBillingIdentity.upsert({
          where: { tenantId },
          create: { tenantId, buyerName: 'QA Alıcı Ltd. Şti.', buyerVknTckn: '2840958172',
            buyerTaxOffice: 'Kadıköy V.D.', buyerAddress: 'Bağdat Cad. No:10', buyerCity: 'İstanbul', buyerCountry: 'Türkiye' },
          update: { buyerCountry: 'Türkiye' },
        });
        const result = await createInvoiceForPayment(tx, {
          tenantId, paymentRef: `qa_${currency}_${Date.now()}`, amountMinor: 9900, currency,
          description: 'Fabrika Pro — aylık abonelik', paidAt: new Date('2026-09-08T09:00:00.000Z'), provider: 'stripe',
        });
        console.log(`createInvoiceForPayment(${currency}) -> ${JSON.stringify(result)}`);
        if (result.status !== 'issued') { throw new Rollback(); }

        const row = await tx.invoice.findUniqueOrThrow({ where: { id: result.id }, select: RECORD_SELECT });
        const rate = row.fxRate ? Number(row.fxRate.toString()) : null;
        console.log('stored:', JSON.stringify({
          currency: row.currency, fxRate: rate,
          fxRateDate: row.fxRateDate?.toISOString().slice(0, 10) ?? null,
          fxRateSource: row.fxRateSource, grandTotalTryMinor: row.grandTotalTryMinor,
        }));
        if (rate !== null && row.grandTotalTryMinor !== null) {
          const expected = Math.floor(9900 * rate + 0.5);
          console.log(`TL math: round(9900 * ${rate}) = ${expected} vs stored ${row.grandTotalTryMinor} -> ${expected === row.grandTotalTryMinor ? 'MATCH' : 'MISMATCH'}`);
        }

        const doc = buildInvoiceDocument(row as unknown as InvoiceRecord, SUPPLIER);
        const totals = calculateInvoiceTotals(doc.lines, doc.currency);
        console.log(`document payable grand total: ${totals.grandTotal.toFixed(2)} ${doc.currency} (charge was 99.00) -> ${Math.round(totals.grandTotal * 100) === 9900 ? 'MATCH' : 'MISMATCH'}`);
        console.log(`foreignCurrencyFilingBlock -> ${JSON.stringify(foreignCurrencyFilingBlock(doc))}`);
        const reached = { value: false };
        const outcome = await fileThrough(integrator(reached), doc);
        console.log(`fileThrough -> ${JSON.stringify(outcome)} (filed=${isFiled(outcome)}, reachedAdapter=${reached.value})`);

        const xml = generateUblTrXml(doc);
        const px = /<cac:PricingExchangeRate>[\s\S]*?<\/cac:PricingExchangeRate>/.exec(xml);
        const tx2 = /<cac:TaxExchangeRate>[\s\S]*?<\/cac:TaxExchangeRate>/.exec(xml);
        console.log('XML DocumentCurrencyCode:', /<cbc:DocumentCurrencyCode>.*<\/cbc:DocumentCurrencyCode>/.exec(xml)?.[0]);
        console.log('XML PricingExchangeRate:\n' + (px?.[0] ?? '(absent)'));
        console.log('XML TaxExchangeRate present:', Boolean(tx2));
        console.log('XML PayableAmount:', /<cbc:PayableAmount[^>]*>[^<]*<\/cbc:PayableAmount>/.exec(xml)?.[0]);
        console.log('XML mentions a TRY amount anywhere? ', /currencyID="TRY"/.test(xml));
        console.log('XML TRY figure of the payable total present as a number? ', row.grandTotalTryMinor ? xml.includes((row.grandTotalTryMinor / 100).toFixed(2)) : 'n/a');

        const html = generateEfaturaHtml(doc);
        const amounts = html.match(/[₺$€]\s?[\d.,]+/g) ?? [];
        console.log('HTML money symbols seen:', JSON.stringify([...new Set(amounts)].slice(0, 6)));
        console.log('HTML mentions TCMB / kur / TL karşılığı? ', /TCMB/i.test(html), /\bkur\b/i.test(html), /TL kar/i.test(html));
        if (row.grandTotalTryMinor) {
          console.log('HTML shows the TL equivalent figure? ', html.includes((row.grandTotalTryMinor / 100).toFixed(2)));
        }
        fs.writeFileSync(`docs/agent-results/TASK-MTSWLWDONWA3W-evidence/08-after-fx-note-${currency}.html`, html);
        fs.writeFileSync(`docs/agent-results/TASK-MTSWLWDONWA3W-evidence/08-after-fx-note-${currency}.xml`, xml);
        throw new Rollback();
      });
    } catch (e) { if (!(e instanceof Rollback)) throw e; console.log('(rolled back)'); }
  }

  if (!OUTAGE) {
    console.log('\n--- B2. Weekend shift: a USD charge paid on Sunday 2026-09-06, and EUR ---');
    for (const [cur, paidAt] of [['EUR', '2026-09-08T09:00:00.000Z'], ['USD', '2026-09-06T09:00:00.000Z']] as const) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.tenantBillingIdentity.upsert({ where: { tenantId },
            create: { tenantId, buyerName: 'QA Alıcı Ltd. Şti.', buyerVknTckn: '2840958172', buyerTaxOffice: 'Kadıköy V.D.', buyerAddress: 'Bağdat Cad. No:10', buyerCity: 'İstanbul', buyerCountry: 'Türkiye' },
            update: { buyerCountry: 'Türkiye' } });
          const r = await createInvoiceForPayment(tx, {
            tenantId, paymentRef: `qa_w_${cur}_${Date.now()}`, amountMinor: 9900, currency: cur,
            description: 'Fabrika Pro', paidAt: new Date(paidAt), provider: 'stripe' });
          if (r.status !== 'issued') { console.log(`${cur} @ ${paidAt.slice(0,10)} -> ${JSON.stringify(r)}`); throw new Rollback(); }
          const row = await tx.invoice.findUniqueOrThrow({ where: { id: r.id }, select: { currency: true, issuedAt: true, fxRate: true, fxRateDate: true, grandTotalTryMinor: true } });
          console.log(`${cur} issued ${row.issuedAt.toISOString().slice(0,10)} -> rate ${row.fxRate?.toString()} of bulletin ${row.fxRateDate?.toISOString().slice(0,10)} | TL ${row.grandTotalTryMinor}`);
          throw new Rollback();
        });
      } catch (e) { if (!(e instanceof Rollback)) throw e; }
    }

    console.log('\n--- B3. The rows already in this database ---');
    console.log(JSON.stringify(await prisma.$queryRawUnsafe(`select number, currency, "fxRate", "fxRateSource", "grandTotalTryMinor", "gibEnvelopeId" from "Invoice" order by "createdAt"`)));

    console.log('\n--- C. A rate-less foreign-currency document at the gate ---');
    const rateless = {
      number: 'QA-RATELESS-1', issuedAt: new Date('2026-09-08T09:00:00.000Z'), currency: 'USD',
      buyerName: 'QA Alıcı Ltd. Şti.', buyerVknTckn: '2840958172', buyerTaxOffice: 'Kadıköy V.D.',
      buyerAddress: 'Bağdat Cad. No:10', buyerCity: 'İstanbul', buyerCountry: 'Türkiye',
      lines: [{ name: 'Fabrika Pro', quantity: 1, unitCode: 'MON', unitPriceMinor: 8250, vatRate: 20 }],
      profileId: 'EARSIVFATURA', invoiceType: 'SATIS', ettn: '00000000-0000-4000-8000-000000000001',
      gibEnvelopeId: null, fxRate: null, fxRateDate: null, fxRateSource: null, grandTotalTryMinor: null,
    } as unknown as InvoiceRecord;
    const doc = buildInvoiceDocument(rateless, SUPPLIER);
    const reached = { value: false };
    console.log(`fileThrough(rate-less USD) -> ${JSON.stringify(await fileThrough(integrator(reached), doc))} reachedAdapter=${reached.value}`);

    console.log('\n--- D. Can a rate-less foreign-currency row even be inserted? ---');
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `insert into "Invoice" (id,"tenantId",number,"issuedAt",currency,lines,"buyerName","buyerVknTckn","buyerTaxOffice","buyerAddress","buyerCity","buyerCountry","profileId","invoiceType",ettn,"paymentRef","createdAt")
           values ('qa_cons_1',$1,'QA-CONS-1',now(),'USD','[]'::jsonb,'X','2840958172','V.D.','A','İ','Türkiye','EARSIVFATURA','SATIS','00000000-0000-4000-8000-000000000002','qa_cons_ref',now())`,
          tenantId);
        console.log('INSERT of a rate-less USD invoice: ACCEPTED  <-- constraint did not fire');
        throw new Rollback();
      });
    } catch (e) {
      if (e instanceof Rollback) console.log('(rolled back)');
      else console.log('INSERT of a rate-less USD invoice: REJECTED ->', String(e).split('\n').filter(l => /constraint|violates/i.test(l)).slice(0, 2).join(' | ') || String(e).slice(0, 200));
    }
  }

  const alertsAfter = await prisma.systemAlert.count();
  console.log(`\nInvoice rows after: ${await prisma.invoice.count()} | SystemAlert rows after: ${alertsAfter} (delta ${alertsAfter - alertsBefore})`);
  if (alertsAfter > alertsBefore) {
    const latest = await prisma.systemAlert.findMany({ orderBy: { createdAt: 'desc' }, take: alertsAfter - alertsBefore, select: { level: true, source: true, message: true, meta: true } });
    console.log('new SystemAlerts:', JSON.stringify(latest, null, 1).slice(0, 1200));
  }
  await prisma.$disconnect();
}
main().catch(async (e: unknown) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
