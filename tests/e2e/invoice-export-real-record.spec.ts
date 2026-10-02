import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { createDbClient } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { seedUserMembership, cleanupUserMembership } from './fixtures/user-membership-seed';

/**
 * TASK-MTRD9QBJ2G32E — an invoice export may only describe an invoice that exists.
 *
 * `GET /api/billing/invoices/[id]/export` used to build a Turkish e-Invoice out of
 * constants in the route file — ETTN c8f3b4a1-…, supplier VKN 3810459281 at "Maslak
 * Vergi Dairesi", `isEfaturaUser: true`, ₺32,220 of invented lines — and hand it to
 * *any* caller, with no session, for *any* id, under a footer stating the document had
 * been sealed under VUK 213. Measured before the fix:
 *
 *   $ curl -si '.../api/billing/invoices/TOTALLY-MADE-UP-ID/export?format=xml'
 *   HTTP/1.1 200 OK
 *   content-disposition: attachment; filename="TOTALLY-MADE-UP-ID_UBL_TR.xml"
 *
 * The route now reads one row, tenant-filtered, and every one of those constants is
 * gone from the codebase. This spec is what keeps them gone.
 */

const STAMP = `e2e-inv-${Date.now()}`;
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const SHOTS = shotsDir('TASK-MTRD9QBJ2G32E-screenshots');

/**
 * The identities the route used to print. None of them is a real taxpayer — all three
 * VKNs fail the GİB checksum — but a document naming them was still a fiscal document
 * about nobody, downloadable by anybody.
 */
const RETIRED_FABRICATIONS = [
  '3810459281',
  '3880194821',
  'Maslak Vergi Dairesi',
  'c8f3b4a1-7d2e-4b9c-8a1f-3e5d7c9b0a2f',
  'FonBridge Teknoloji',
];

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

test.describe('invoice export reads a real record', () => {
  let tenantA: string;
  let tenantB: string;
  let invoiceA: string;
  let invoiceB: string;
  let ettnA: string;
  let cookieA: string;

  test.beforeAll(async () => {
    const mk = async (suffix: string) =>
      prisma.tenant.create({
        data: { name: `Invoice Export ${suffix} ${STAMP}`, slug: `${STAMP}-${suffix}`, country: 'TR' },
      });
    tenantA = (await mk('A')).id;
    tenantB = (await mk('B')).id;

    const issue = async (tenantId: string, number: string, buyer: string) =>
      prisma.invoice.create({
        data: {
          tenantId,
          number,
          issuedAt: new Date('2026-09-07T09:15:00.000Z'),
          currency: 'TRY',
          buyerName: buyer,
          buyerVknTckn: '2840958172',
          buyerTaxOffice: 'Doğanbey V.D.',
          buyerAddress: 'ODTÜ Teknokent Blok B',
          buyerCity: 'Ankara',
          buyerCountry: 'Türkiye',
          lines: [
            { name: 'Fabrika Pro Plan (1 ay)', quantity: 1, unitCode: 'C62', unitPriceMinor: 250000, vatRate: 20 },
          ],
          ettn: randomUUID(),
        },
      });

    const a = await issue(tenantA, `${STAMP}-A-0001`, `Invoice Export A ${STAMP}`);
    const b = await issue(tenantB, `${STAMP}-B-0001`, `Invoice Export B ${STAMP}`);
    invoiceA = a.number;
    invoiceB = b.number;
    ettnA = a.ettn;

    // Seed users and memberships so JWT callback can find them
    const userIdA = `${STAMP}-user-a`;
    await seedUserMembership(tenantA, userIdA, `${userIdA}@e2e.fabrika.test`, 'Invoice Export User A', 'TENANT_OWNER');

    cookieA = await sessionCookie(tenantA, userIdA);
  });

  test.afterAll(async () => {
    const userIdA = `${STAMP}-user-a`;
    await cleanupUserMembership(tenantA, userIdA);
    await prisma.invoice.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  const authed = (request: APIRequestContext, path: string) =>
    request.get(path, { headers: { Cookie: `${COOKIE_NAME}=${cookieA}` } });

  test('an anonymous caller gets no document at all', async ({ request }) => {
    const res = await request.get(
      '/api/billing/invoices/TOTALLY-MADE-UP-ID/export?format=xml'
    );
    expect(res.status()).toBe(401);
    const body = await res.text();
    expect(body).toContain('unauthorized');
    for (const fabrication of RETIRED_FABRICATIONS) {
      expect(body).not.toContain(fabrication);
    }
  });

  test('an id that exists nowhere is 404, not an invented invoice', async ({ request }) => {
    const res = await authed(request, `/api/billing/invoices/${STAMP}-NOPE/export?format=xml`);
    expect(res.status()).toBe(404);
    expect(await res.text()).toContain('invoice_not_found');
  });

  test('another tenant invoice is 404, the same answer as one that does not exist', async ({
    request,
  }) => {
    const res = await authed(request, `/api/billing/invoices/${invoiceB}/export?format=xml`);
    expect(res.status()).toBe(404);
    const body = await res.text();
    expect(body).toContain('invoice_not_found');
    expect(body).not.toContain('Invoice Export B');
  });

  test('an unsupported format is refused before anything is read', async ({ request }) => {
    const res = await authed(request, `/api/billing/invoices/${invoiceA}/export?format=exe`);
    expect(res.status()).toBe(400);
  });

  test('the tenant own invoice renders that row, and nothing invented', async ({
    request,
    page,
    baseURL,
  }) => {
    const res = await authed(request, `/api/billing/invoices/${invoiceA}/export?format=xml`);
    const body = await res.text();

    expect(res.status()).toBe(200);
    expect(body.length).toBeGreaterThan(0);

    expect(body).toContain(`<cbc:ID>${invoiceA}</cbc:ID>`);
    expect(body).toContain(`<cbc:UUID>${ettnA}</cbc:UUID>`);
    expect(body).toContain(`Invoice Export A ${STAMP}`);
    expect(body).toContain('2500.00');
    expect(body).toContain('Fabrika Pro Plan (1 ay)');
    expect(body).toContain('KDV');

    for (const fabrication of RETIRED_FABRICATIONS) {
      expect(body).not.toContain(fabrication);
    }

    await page.context().addCookies([
      { name: COOKIE_NAME, value: cookieA, url: baseURL! },
    ]);
    const shown = await page.goto(`/api/billing/invoices/${invoiceA}/export?format=html`);
    expect(shown?.status()).toBe(200);
    await page.screenshot({ path: `${SHOTS}/03-after-real-record-html.png`, fullPage: true });
    await expect(page.locator('.unfiled-banner')).toBeVisible();
    await expect(page.getByText(`Invoice Export A ${STAMP}`)).toBeVisible();
  });
});
