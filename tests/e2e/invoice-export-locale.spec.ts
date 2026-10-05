import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { createDbClient } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { requireId } from '../helpers/teardown-guard';

/**
 * TASK-MTTUSZF4QSFGU — the printed invoice in the language the reader is using,
 * and the GİB terms that stay Turkish inside it.
 *
 * Measured against the live route, not against the generator: the point of the card
 * is that a customer clicking "download" in an English session got a Turkish page,
 * and only a real request through `/api/billing/invoices/[id]/export` proves the
 * locale actually reaches the renderer.
 *
 * Two invoices are seeded so the two halves of the card are both exercised on a real
 * row: one at 20% VAT withheld 9/10, one at 10% VAT withheld 5/10. Neither rate is
 * written anywhere in the rendered page — both are read off the stored lines.
 */

const STAMP = `e2e-invloc-${Date.now()}`;
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const SHOTS = shotsDir('TASK-MTTUSZF4QSFGU-screenshots');

const connectionString =
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const prisma = createDbClient(connectionString);

/** Product labels that must NOT survive on the English page. */
const TURKISH_PRODUCT_LABELS = [
  'Ara Toplam (Matrah)',
  'ÖDENECEK GENEL TOPLAM',
  'SAYIN (ALICI)',
  'FATURA DETAYLARI',
  'Hizmet / Ürün Açıklaması',
  'Tevkifat Tutarı',
];

/** Words that are GİB's, not ours — Turkish in every locale. */
const GIB_TERMS = ['VKN', 'ETTN', 'e-Fatura', 'TICARIFATURA', 'TEVKIFAT'];

test.describe('the printed invoice follows the reader language', () => {
  let tenantId: string;
  let cookie: string;
  let ninetenths: string;
  let fivetenths: string;

  test.beforeAll(async () => {
    await withSystemScope('platform-admin', 'e2e.invoice-export-locale.setup', async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: `Invoice Locale ${STAMP}`, slug: STAMP, country: 'TR' },
      });
      tenantId = tenant.id;

      const issue = async (number: string, vatRate: number, withholdingRate: number) =>
        (
          await tx.invoice.create({
            data: {
              tenantId,
              number,
              issuedAt: new Date('2026-09-10T09:15:00.000Z'),
              currency: 'TRY',
              buyerName: `Invoice Locale Buyer ${STAMP}`,
              buyerVknTckn: '2840958172',
              buyerTaxOffice: 'Doğanbey V.D.',
              buyerAddress: 'ODTÜ Teknokent Blok B',
              buyerCity: 'Ankara',
              buyerCountry: 'Türkiye',
              invoiceType: 'TEVKIFAT',
              lines: [
                // unitCode MON — the shape a subscription invoice actually has, and
                // the row that used to print "1 Adet" no matter what the code said.
                {
                  name: 'Fabrika Pro Plan (1 ay)',
                  quantity: 1,
                  unitCode: 'MON',
                  unitPriceMinor: 250000,
                  vatRate,
                  withholdingCode: '604',
                  withholdingRate,
                },
              ],
              ettn: randomUUID(),
            },
          })
        ).number;

      ninetenths = await issue(`${STAMP}-0001`, 20, 0.9);
      fivetenths = await issue(`${STAMP}-0002`, 10, 0.5);

      const userId = `${STAMP}-user`;
      await tx.user.upsert({
        where: { id: userId },
        create: { id: userId, email: `${STAMP}@e2e.fabrika.test`, locale: 'tr' },
        update: { email: `${STAMP}@e2e.fabrika.test` },
      });
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: { userId, tenantId, role: 'TENANT_OWNER' },
        update: { role: 'TENANT_OWNER' },
      });

      cookie = await encode({
        token: {
          sub: userId,
          id: userId,
          email: `${STAMP}@e2e.fabrika.test`,
          tenantId,
          role: 'TENANT_OWNER',
        },
        secret: SECRET,
        salt: COOKIE_NAME,
        maxAge: 60 * 60,
      });
    });
  });

  test.afterAll(async () => {
    await withSystemScope('platform-admin', 'e2e.invoice-export-locale.cleanup', async (tx) => {
      const tid = requireId(tenantId, 'tenantId');
      const uid = `${STAMP}-user`;
      await tx.membership.deleteMany({ where: { tenantId: tid, userId: uid } });
      await tx.user.deleteMany({ where: { id: uid } });
      await tx.invoice.deleteMany({ where: { tenantId: tid } });
      await tx.tenant.deleteMany({ where: { id: tid } });
    });
    await prisma.$disconnect();
  });

  const page = (number: string, locale?: string) =>
    `/api/billing/invoices/${number}/export?format=html${locale ? `&locale=${locale}` : ''}`;

  test('a Turkish reader gets the Turkish page, with the rate the lines carry', async ({
    request,
  }) => {
    const res = await request.get(page(ninetenths, 'tr'), {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain('Hesaplanan KDV (%20):');
    expect(html).toContain('Tevkifat Tutarı (9/10):');
    expect(html).toContain('1 Ay');
    expect(html).not.toContain('1 Adet');
  });

  test('a link with no locale still renders Turkish — nothing existing changed', async ({
    request,
  }) => {
    const res = await request.get(page(ninetenths), {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    });
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('ÖDENECEK GENEL TOPLAM:');
  });

  test('an English reader gets an English page that still names GİB things in Turkish', async ({
    request,
  }) => {
    const res = await request.get(page(ninetenths, 'en'), {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('VAT charged (20%):');
    expect(html).toContain('Withholding — tevkifat (9/10):');
    expect(html).toContain('TOTAL PAYABLE:');
    expect(html).toContain('1 month');
    for (const turkish of TURKISH_PRODUCT_LABELS) expect(html).not.toContain(turkish);
    for (const term of GIB_TERMS) expect(html).toContain(term);
  });

  test('a second invoice at 10% withheld 5/10 states its own rates, not the first ones', async ({
    request,
  }) => {
    for (const [locale, vat, withheld] of [
      ['tr', 'Hesaplanan KDV (%10):', 'Tevkifat Tutarı (5/10):'],
      ['en', 'VAT charged (10%):', 'Withholding — tevkifat (5/10):'],
    ] as const) {
      const res = await request.get(page(fivetenths, locale), {
        headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
      });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain(vat);
      expect(html).toContain(withheld);
      expect(html).not.toContain('9/10');
      expect(html).not.toContain('%20');
      expect(html).not.toContain('20%');
    }
  });

  test('the filed XML is Turkish whatever the locale parameter says', async ({ request }) => {
    for (const locale of ['tr', 'en']) {
      const res = await request.get(
        `/api/billing/invoices/${ninetenths}/export?format=xml&locale=${locale}`,
        { headers: { Cookie: `${COOKIE_NAME}=${cookie}` } }
      );
      expect(res.status()).toBe(200);
      const xml = await res.text();
      expect(xml).toContain('<cbc:Name>KDV</cbc:Name>');
      expect(xml).toContain('<cbc:Name>Tevkifat</cbc:Name>');
      expect(xml).not.toContain('<cbc:Name>VAT</cbc:Name>');
      expect(xml).not.toContain('Withholding');
    }
  });

  test('both pages render for a human, and are photographed', async ({ page: browserPage, baseURL }) => {
    await browserPage.context().addCookies([{ name: COOKIE_NAME, value: cookie, url: baseURL! }]);
    for (const locale of ['tr', 'en'] as const) {
      const shown = await browserPage.goto(page(ninetenths, locale));
      expect(shown?.status()).toBe(200);
      await expect(browserPage.locator('.unfiled-banner')).toBeVisible();
      await browserPage.screenshot({
        path: `${SHOTS}/invoice-9-10-${locale}.png`,
        fullPage: true,
      });
    }
  });
});
