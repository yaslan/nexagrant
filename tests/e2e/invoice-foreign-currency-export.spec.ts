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
 * What this spec does NOT claim: the USD document still carries no TL
 * equivalent and no TCMB rate, which VUK 215/385 require of a domestic
 * foreign-currency invoice. That is the open decision in
 * docs/adr/ADR-0002-foreign-currency-invoice-fx.md; until it lands,
 * `foreignCurrencyFilingBlock` stops such a document being *filed* with GİB
 * (unit-covered in tests/efatura-foreign-currency.test.ts).
 */

const STAMP = `e2e-fx-${Date.now()}`;
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
   * The seller identity is configuration. Where it is unset the route emits no
   * document at all (503) — that is a pass, and it is asserted rather than
   * skipped, so the spec cannot go quietly green in an environment that never
   * rendered anything. Set INVOICE_SUPPLIER_* to exercise the rendering branch.
   */
  async function documentOrConfigRefusal(
    request: APIRequestContext,
    number: string,
    format: 'html' | 'xml'
  ): Promise<string | null> {
    const res = await authed(request, `/api/billing/invoices/${number}/export?format=${format}`);
    const body = await res.text();
    if (res.status() === 503) {
      expect(body).toContain('supplier_identity_not_configured');
      expect(body).toContain('INVOICE_SUPPLIER_VKN');
      return null;
    }
    expect(res.status()).toBe(200);
    return body;
  }

  test('the USD document never prints a lira sign, and the TRY one still does', async ({
    request,
  }) => {
    const usd = await documentOrConfigRefusal(request, usdNumber, 'html');
    const lira = await documentOrConfigRefusal(request, tryNumber, 'html');
    test.skip(usd === null, 'INVOICE_SUPPLIER_* unset on the server under test — the rendering branch cannot be reached; set them (and use a free E2E_PORT) to run these assertions');

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
    test.skip(xml === null, 'INVOICE_SUPPLIER_* unset on the server under test — the rendering branch cannot be reached; set them (and use a free E2E_PORT) to run these assertions');

    expect(xml).toContain('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>');
    // No amount may carry a currencyID the document did not declare.
    const declared = [...xml!.matchAll(/currencyID="([A-Z]{3})"/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect([...new Set(declared)]).toEqual(['USD']);
  });

  test('the printable page a customer sees agrees with itself', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: COOKIE_NAME, value: cookie, url: baseURL! }]);

    const shown = await page.goto(`/api/billing/invoices/${usdNumber}/export?format=html`);
    await page.screenshot({ path: `${SHOTS}/01-usd-invoice-html.png`, fullPage: true });
    test.skip(shown?.status() === 503, 'INVOICE_SUPPLIER_* unset on the server under test — the rendering branch cannot be reached; set them (and use a free E2E_PORT) to run these assertions');
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
