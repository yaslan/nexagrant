import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { createDbClient } from '../../src/lib/db';
import { handleIyzicoWebhook } from '../../src/lib/iyzico';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { requireId } from '../helpers/teardown-guard';

/**
 * TASK-MTSWL8ADKZKDM — a successful payment must actually issue an invoice.
 *
 * `Invoice`, the UBL-TR generator, the export route and the e-Fatura preflight
 * all existed, and no production code ever wrote a row. Measured on dev @ aa11d85:
 *
 *   $ grep -rniE "invoice\.(create|upsert|createMany)" src scripts prisma tests workers
 *   tests/e2e/invoice-export-real-record.spec.ts:81:      prisma.invoice.create({
 *   tests/e2e/billing-invoice-history.spec.ts:90:    await prisma.invoice.create({
 *
 * Two test files, no production writer. Every paying customer therefore had zero
 * invoices and `/api/billing/invoices/<id>/export` answered 404 for all of them.
 *
 * This spec drives the *real* iyzico webhook handler against the *real* database
 * — only the call out to iyzico's own API is stubbed, because the provider is
 * the one thing a test may not reach — and then fetches the document over HTTP.
 */

const STAMP = `e2e-iwp-${Date.now()}`;
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

const connectionString =
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const prisma = createDbClient(connectionString);

/** A buyer identity supplied for the test tenant, never invented by the code under test. */
const BUYER = {
  buyerName: 'Örnek Teknoloji A.Ş.',
  buyerVknTckn: '2840958172',
  buyerTaxOffice: 'Doğanbey V.D.',
  buyerAddress: 'ODTÜ Teknokent Blok B No:1',
  buyerCity: 'Ankara',
  buyerCountry: 'Türkiye',
};

/** The charge the stubbed provider reports, in major units, as iyzico returns it. */
const PAID_PRICE = '1200.00';
const PAID_MINOR = 120_000;

async function sessionCookie(tenantId: string, userId: string): Promise<string> {
  return encode({
    token: { sub: userId, id: userId, email: `${userId}@e2e.fabrika.test`, tenantId, role: 'TENANT_OWNER' },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
}

/** A notification for a tenant, with the conversationId the checkout would have minted. */
function notificationFor(tenantId: string, planId: string, paymentId: string) {
  return {
    iyziEventType: 'CHECKOUTFORM_AUTH',
    iyziReferenceCode: `ref-${paymentId}`,
    token: `tok-${paymentId}`,
    paymentId,
    paymentConversationId: ['fabrika', tenantId, planId, 'month', randomBytes(8).toString('hex')].join(':'),
    status: 'SUCCESS',
  };
}

/** Stands in for iyzico's payment-detail API; the money comes from here, as in production. */
function stubRetrieve(paymentId: string, conversationId: string) {
  return async () => ({
    status: 'success',
    paymentStatus: 'SUCCESS',
    paymentId,
    conversationId,
    paidPrice: PAID_PRICE,
    currency: 'TRY',
  });
}

let tenantId: string;
let planId: string;
let cookie: string;

test.beforeAll(async () => {
  const plan = await prisma.plan.findFirst({ select: { id: true } });
  expect(plan, 'a seeded plan is required; run pnpm db:seed').not.toBeNull();
  planId = plan!.id;

  const tenant = await prisma.tenant.create({
    data: { name: `Invoice Write Path ${STAMP}`, slug: STAMP, country: 'TR' },
  });
  tenantId = tenant.id;
  cookie = await sessionCookie(tenantId, `${STAMP}-user`);
});

test.afterAll(async () => {
  // Scoped to this run's tenant only; nothing pre-existing is touched.
  //
  // `SystemAlert` first, and by `meta.tenantId` rather than by a column: the
  // table is deliberately tenant-agnostic and carries no `tenantId` of its own
  // (see src/lib/observability/system-alert.ts), so a "delete everything of
  // mine" sweep that walks tenant-scoped tables cannot reach it. This spec
  // asserts that the writer *raises* an alert, which means every run leaves one
  // behind; without this line the row outlives the tenant it names and becomes
  // an orphan nobody can resolve. Measured before this line existed: 234 of 268
  // open alerts named tenants that no longer existed (TASK-MTVFWYKIZXRB1).
  await prisma.systemAlert.deleteMany({
    where: { meta: { path: ['tenantId'], equals: requireId(tenantId, 'tenantId') } },
  });
  await prisma.invoice.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
  await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
  await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
  await prisma.$disconnect();
});

test('a tenant with no billing identity is paid-up but not invoiced', async () => {
  // Deliberately first: the tenant has no TenantBillingIdentity row yet. The
  // payment must still complete, and no invoice may be invented for a taxpayer
  // nobody has supplied (TASK-MTRD9QBJ2G32E).
  const paymentId = `${STAMP}-p0`;
  const notification = notificationFor(tenantId, planId, paymentId);

  const result = await handleIyzicoWebhook(notification, {
    retrievePayment: stubRetrieve(paymentId, notification.paymentConversationId),
  });

  expect(result.success).toBe(true);
  expect(await prisma.invoice.count({ where: { tenantId } })).toBe(0);

  const alert = await prisma.systemAlert.findFirst({
    where: { source: 'invoice_buyer_identity_missing' },
    orderBy: { createdAt: 'desc' },
  });
  expect(alert, 'the refusal must be reported, not silent').not.toBeNull();
  // The alert names the fields; it must never become a second copy of a tax id.
  expect(JSON.stringify(alert?.meta)).toContain('buyerVknTckn');
  expect(JSON.stringify(alert?.meta)).not.toContain(BUYER.buyerVknTckn);
});

test('a payment issues one invoice, and the export route serves it', async ({ request }) => {
  await prisma.tenantBillingIdentity.create({ data: { tenantId, ...BUYER } });

  const paymentId = `${STAMP}-p1`;
  const notification = notificationFor(tenantId, planId, paymentId);

  const result = await handleIyzicoWebhook(notification, {
    retrievePayment: stubRetrieve(paymentId, notification.paymentConversationId),
  });
  expect(result.success).toBe(true);

  // The row itself, read back out of Postgres.
  const invoice = await prisma.invoice.findFirst({ where: { tenantId, paymentRef: paymentId } });
  expect(invoice, 'the payment must have issued an invoice').not.toBeNull();
  expect(invoice!.number).toMatch(/^FB-\d{4}-\d{6}$/);
  expect(invoice!.buyerVknTckn).toBe(BUYER.buyerVknTckn);
  expect(invoice!.ettn).toMatch(/^[0-9a-f-]{36}$/);
  // Nothing has been filed with GİB, and the row must not pretend otherwise.
  expect(invoice!.gibEnvelopeId).toBeNull();

  // The stored lines add back up to exactly what the card was charged.
  const lines = invoice!.lines as Array<{ unitPriceMinor: number; vatRate: number }>;
  const total = lines.reduce(
    (sum, l) => sum + l.unitPriceMinor + Math.round((l.unitPriceMinor * l.vatRate) / 100),
    0
  );
  expect(total).toBe(PAID_MINOR);

  // And the export route now answers for this row instead of 404. The seller
  // identity is configuration: with INVOICE_SUPPLIER_* set the route has to
  // render the document, so 200 is the only pass here — a 503 means the
  // environment is unconfigured and this gate goes red rather than shrugging.
  // The not-404 assertion below stays because 404 is the original defect: the
  // row issued, but unreachable by the customer who paid for it.
  const xml = await request.get(
    `/api/billing/invoices/${invoice!.number}/export?format=xml`,
    { headers: { Cookie: `${COOKIE_NAME}=${cookie}` } }
  );
  expect(xml.status(), 'the issued invoice must be reachable').not.toBe(404);
  const body = await xml.text();

  expect(xml.status()).toBe(200);
  expect(body).toContain(invoice!.ettn);
  expect(body).toContain(BUYER.buyerVknTckn);
  expect(body).toContain('1000.00'); // the net the charge decomposed to
  // Nothing was filed, so the document says so instead of claiming a seal.
  expect(body).toContain('mali değeri yoktur');
});

test('a redelivered webhook does not issue a second invoice', async () => {
  const before = await prisma.invoice.count({ where: { tenantId } });

  const paymentId = `${STAMP}-p1`; // the same payment as above
  const notification = notificationFor(tenantId, planId, paymentId);
  await handleIyzicoWebhook(notification, {
    retrievePayment: stubRetrieve(paymentId, notification.paymentConversationId),
  });

  expect(await prisma.invoice.count({ where: { tenantId } })).toBe(before);
});

test('two concurrent payments get two distinct numbers', async () => {
  const before = await prisma.invoice.findMany({
    where: { tenantId },
    select: { number: true },
  });

  const payments = [`${STAMP}-c1`, `${STAMP}-c2`, `${STAMP}-c3`];
  await Promise.all(
    payments.map((paymentId) => {
      const notification = notificationFor(tenantId, planId, paymentId);
      return handleIyzicoWebhook(notification, {
        retrievePayment: stubRetrieve(paymentId, notification.paymentConversationId),
      });
    })
  );

  const after = await prisma.invoice.findMany({
    where: { tenantId },
    select: { number: true, paymentRef: true },
  });

  const issued = after.filter((r) => payments.includes(r.paymentRef ?? ''));
  expect(issued, 'every concurrent payment must be invoiced').toHaveLength(payments.length);
  // No number may be handed out twice, and none may collide with what was there.
  const numbers = after.map((r) => r.number);
  expect(new Set(numbers).size).toBe(numbers.length);
  expect(numbers.length).toBe(before.length + payments.length);
});
