import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { createDbClient } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { seedUserMembership, cleanupUserMembership } from './fixtures/user-membership-seed';
import { requireId } from '../helpers/teardown-guard';

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
const SECRET = e2eAuthSecret();
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

/**
 * The `<tr>` blocks of a rendered document that mention `needle`. The totals
 * table is flat, so splitting on the row tag is enough — and it lets an
 * assertion say *where* a currency sign is allowed to appear rather than only
 * whether it appears at all.
 */
function rowsMentioning(html: string, needle: string): string[] {
  return html
    .split('<tr')
    .slice(1)
    .filter((row) => row.includes(needle));
}

/** How many times `needle` occurs in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
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

    const userId = `${STAMP}-user`;
    await seedUserMembership(tenantId, userId, `${userId}@e2e.fabrika.test`, 'FX Export User', 'TENANT_OWNER');

    cookie = await sessionCookie(tenantId, userId);
  });

  test.afterAll(async () => {
    const userId = `${STAMP}-user`;
    await cleanupUserMembership(tenantId, userId);
    await prisma.invoice.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
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

  /**
   * VUK 215 and 385 Sıra No.lu Genel Tebliğ require a foreign-currency invoice
   * to *also* show its lira equivalent, and this repo enforces that in both
   * directions: `foreignCurrencyFilingBlock` (src/lib/efatura.ts) refuses to
   * file a USD document carrying no TL figure, and 8118b54 put that figure on
   * the printed page. So "the USD document never prints ₺" was never the rule —
   * it was this assertion outliving the feature. The rule is that the two
   * currencies may not MIX: every amount of the sale itself is in dollars, and
   * the one lira figure is the stated equivalent, in its own labelled row.
   */
  test('the USD document prices the sale in dollars and shows lira only as the stated equivalent', async ({
    request,
  }) => {
    const usd = await documentOrConfigRefusal(request, usdNumber, 'html');
    const lira = await documentOrConfigRefusal(request, tryNumber, 'html');

    expect(usd).toContain('Para Birimi:</strong> USD');
    expect(usd).toContain('$99,00'); // the line, and the net below it
    expect(usd).toContain('$19,80'); // %20 KDV
    expect(usd).toContain('$118,80'); // 99.00 + 20% KDV, in dollars

    // Exactly one ₺ on the whole document, and it sits in the row that names
    // itself as the equivalent. The original defect — every money cell printed
    // with a hard-coded ₺ under a "Para Birimi: USD" header — fails this.
    expect(occurrences(usd, '₺')).toBe(1);
    const equivalentRows = rowsMentioning(usd, '₺');
    expect(equivalentRows).toHaveLength(1);
    expect(equivalentRows[0]).toContain('TL karşılığı');
    // Read off the stored row (grandTotalTryMinor 408222 above), not recomputed
    // at export time.
    expect(equivalentRows[0]).toContain('₺4.082,22');

    // And no amount of the sale itself may be restated in lira anywhere.
    for (const amount of ['99,00', '19,80', '118,80']) {
      expect(usd).not.toContain(`₺${amount}`);
    }

    // The rate line names TRY as a word, so it introduces no second sign.
    expect(usd).toContain(`1 USD = ${FIXTURE_RATE.toFixed(4).replace('.', ',')} TRY`);

    expect(lira).toContain('Para Birimi:</strong> TRY');
    expect(lira).toContain('₺99,00');
    expect(lira).not.toContain('$');
    // A lira invoice needs no equivalent of itself and must not grow one.
    expect(lira).not.toContain('TL karşılığı');
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
    expect(rendered).toContain('$118,80');

    // The same rule as the test above, read off the painted page: one lira
    // figure, on the line that declares itself the equivalent (VUK 215).
    const equivalentLines = rendered.split('\n').filter((line) => line.includes('₺'));
    expect(equivalentLines).toHaveLength(1);
    expect(equivalentLines[0]).toContain('TL karşılığı');
    expect(equivalentLines[0]).toContain('₺4.082,22');

    await page.goto(`/api/billing/invoices/${tryNumber}/export?format=html`);
    await page.screenshot({ path: `${SHOTS}/02-try-invoice-html.png`, fullPage: true });
    const liraRendered = await page.locator('body').innerText();
    expect(liraRendered).toContain('₺118,80');
    expect(liraRendered).not.toContain('$');
  });
});
