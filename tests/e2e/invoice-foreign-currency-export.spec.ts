import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { createDbClient } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTSWLWDONWA3W — the exported invoice must state its own currency.
 *
 * The live price catalogue is USD (docs/BILLING.md §1), so the first real
 * `Invoice` row will not be in lira. Measured on this route before the fix:
 * the header box said "Para Birimi: USD" and every money cell below it was
 * printed with a hard-coded ₺, so a $99.00 subscription was shown as ₺99,00 —
 * the same document asserting two different currencies, understating the
 * amount by whatever the day's rate was.
 *
 * This spec drives the real HTTP route in a real browser, with one USD row and
 * one TRY row on the same tenant, so a regression cannot hide behind a unit
 * test that never renders the page.
 *
 * Extended by TASK-MTT13PK0Z4ZLB once ADR-0002 was decided (option (b),
 * 2026-09-08). The USD row now carries the TCMB rate and the TL equivalent it
 * was issued at, because after that decision a rate-less foreign-currency
 * invoice can no longer exist: `Invoice_fx_required_for_foreign_currency`
 * refuses the row in Postgres itself, which this spec also asserts against the
 * real database. The FX figures below are a fixture — deterministic, so the
 * rendered document is comparable across runs — and the production path takes
 * them only from `src/lib/fx/tcmb.ts` (unit-covered in
 * tests/invoice-fx-tcmb.test.ts).
 */

const STAMP = `e2e-fx-${Date.now()}`;
/** A fixed stand-in for a published TCMB buying rate; see the header comment. */
const FIXTURE_RATE = 41.2345;
const COOKIE_NAME = 'authjs.session-token';
const SECRET =
  process.env.AUTH_SECRET || 'fabrika-secret-key-horizon-europe-2026-super-secure';
const SHOTS = shotsDir('TASK-MTSWLWDONWA3W-screenshots');

const connectionString =
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const prisma = createDbClient(connectionString);

async function sessionCookie(tenantId: string, userId: string): Promise<string> {
  return encode({
    token: {
      sub: userId,
      id: userId,
      email: `${userId}@e2e.fabrika.test`,
      tenantId,
      role: 'TENANT_OWNER',
    },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
}

test.describe('a foreign-currency invoice export', () => {
  let tenantId: string;
  let usdNumber: string;
  let tryNumber: string;
  let cookie: string;

  test.beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `FX Export ${STAMP}`, slug: STAMP, country: 'TR' },
    });
    tenantId = tenant.id;

    // $99.00 and ₺99.00 — the same 9900 minor units, so the only thing that can
    // make the two documents differ is the currency they are read under.
    const issue = async (currency: string, number: string) =>
      prisma.invoice.create({
        data: {
          tenantId,
          number,
          issuedAt: new Date('2026-09-08T09:00:00.000Z'),
          currency,
          // TRY needs no conversion and stores nothing; USD must store all four
          // or Postgres rejects the row (ADR-0002). 99.00 x 41.2345 = 4082.2155
          // TL -> 408222 kuruş.
          ...(currency === 'TRY'
            ? {}
            : {
                fxRate: FIXTURE_RATE,
                fxRateDate: new Date('2026-09-08T00:00:00.000Z'),
                fxRateSource: 'TCMB',
                grandTotalTryMinor: 408222,
              }),
          buyerName: `FX Buyer ${STAMP}`,
          buyerVknTckn: '2840958172',
          buyerTaxOffice: 'Kadıköy V.D.',
          buyerAddress: 'Bağdat Cad. No:10',
          buyerCity: 'İstanbul',
          buyerCountry: 'Türkiye',
          lines: [
            { name: 'Fabrika Pro (1 ay)', quantity: 1, unitCode: 'MON', unitPriceMinor: 9900, vatRate: 20 },
          ],
          ettn: randomUUID(),
        },
      });

    usdNumber = (await issue('USD', `${STAMP}-USD`)).number;
    tryNumber = (await issue('TRY', `${STAMP}-TRY`)).number;
    cookie = await sessionCookie(tenantId, `${STAMP}-user`);
  });

  test.afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const authed = (request: APIRequestContext, path: string) =>
    request.get(path, { headers: { Cookie: `${COOKIE_NAME}=${cookie}` } });

  /**
   * The seller identity is configuration. The route MUST produce a real
   * document (HTTP 200 with XML/HTML content) when the config is set. If env
   * vars are missing and a 503 is returned, the test fails — that is the
   * intended outcome. Set INVOICE_SUPPLIER_* to exercise the rendering branch.
   */
  async function documentOrConfigRefusal(
    request: APIRequestContext,
    number: string,
    format: 'html' | 'xml'
  ): Promise<string> {
    const res = await authed(request, `/api/billing/invoices/${number}/export?format=${format}`);
    const body = await res.text();
    expect(res.status()).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    return body;
  }

  test('the USD document never prints a lira sign, and the TRY one still does', async ({
    request,
  }) => {
    const usd = await documentOrConfigRefusal(request, usdNumber, 'html');
    const lira = await documentOrConfigRefusal(request, tryNumber, 'html');

    expect(usd).toContain('Para Birimi:</strong> USD');
    expect(usd).not.toContain('₺');
    expect(usd).toContain('$99,00');
    expect(usd).toContain('$118,80'); // 99.00 + 20% KDV, in dollars

    expect(lira).toContain('Para Birimi:</strong> TRY');
    expect(lira).toContain('₺99,00');
    expect(lira).not.toContain('$');
  });

  test('the XML declares one currency and uses it on every amount', async ({ request }) => {
    const xml = await documentOrConfigRefusal(request, usdNumber, 'xml');

    expect(xml).toContain('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>');
    // No amount may carry a currencyID the document did not declare.
    const declared = [...xml.matchAll(/currencyID="([A-Z]{3})"/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect([...new Set(declared)]).toEqual(['USD']);
  });

  test('the XML carries the TCMB rate the row was issued at', async ({ request }) => {
    const xml = await documentOrConfigRefusal(request, usdNumber, 'xml');

    // VUK 215/280/385: the rate and the TL side travel with the document, and
    // they come off the stored row rather than being recomputed at export time.
    expect(xml).toContain('<cac:PricingExchangeRate>');
    expect(xml).toContain('<cac:TaxExchangeRate>');
    expect(xml).toContain('<cbc:SourceCurrencyCode>USD</cbc:SourceCurrencyCode>');
    expect(xml).toContain('<cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode>');
    expect(xml).toContain(`<cbc:CalculationRate>${FIXTURE_RATE.toFixed(4)}</cbc:CalculationRate>`);
    expect(xml).toContain('<cbc:Date>2026-09-08</cbc:Date>');

    // And the TRY document must not grow an exchange-rate block it has no use for.
    const lira = await documentOrConfigRefusal(request, tryNumber, 'xml');
    expect(lira).not.toContain('<cac:PricingExchangeRate>');
  });

  test('the database itself refuses a foreign-currency invoice with no rate', async () => {
    // The rule this card added is a constraint, not a convention: it holds for
    // any writer, including one that bypasses `createInvoiceForPayment`.
    await expect(
      prisma.invoice.create({
        data: {
          tenantId,
          number: `${STAMP}-USD-NORATE`,
          issuedAt: new Date('2026-09-08T09:00:00.000Z'),
          currency: 'USD',
          buyerName: `FX Buyer ${STAMP}`,
          buyerVknTckn: '2840958172',
          buyerTaxOffice: 'Kadıköy V.D.',
          buyerAddress: 'Bağdat Cad. No:10',
          buyerCity: 'İstanbul',
          buyerCountry: 'Türkiye',
          lines: [
            { name: 'Fabrika Pro (1 ay)', quantity: 1, unitCode: 'MON', unitPriceMinor: 9900, vatRate: 20 },
          ],
          ettn: randomUUID(),
        },
      })
    ).rejects.toThrow(/Invoice_fx_required_for_foreign_currency/);

    expect(
      await prisma.invoice.count({ where: { tenantId, number: `${STAMP}-USD-NORATE` } })
    ).toBe(0);
  });

  test('the printable page a customer sees agrees with itself', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: COOKIE_NAME, value: cookie, url: baseURL! }]);

    const shown = await page.goto(`/api/billing/invoices/${usdNumber}/export?format=html`);
    await page.screenshot({ path: `${SHOTS}/01-usd-invoice-html.png`, fullPage: true });
    expect(shown?.status()).toBe(200);

    // Read out of the rendered page, not out of the response string.
    await expect(page.getByText('Para Birimi:')).toBeVisible();
    const rendered = await page.locator('body').innerText();
    expect(rendered).toContain('USD');
    expect(rendered).not.toContain('₺');
    expect(rendered).toContain('$118,80');

    await page.goto(`/api/billing/invoices/${tryNumber}/export?format=html`);
    await page.screenshot({ path: `${SHOTS}/02-try-invoice-html.png`, fullPage: true });
    const liraRendered = await page.locator('body').innerText();
    expect(liraRendered).toContain('₺118,80');
    expect(liraRendered).not.toContain('$');
  });
});
