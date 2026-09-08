/**
 * Proves the other half of the decision: the CHARGE includes the VAT, so the
 * "KDV hariç" label on the pricing page is true and the invoice reconciles.
 *
 * Drives the real `POST /api/billing/checkout` over HTTP with a real session
 * cookie. Stripe is not live in dev, so the route answers with the amounts it
 * computed — which is exactly the number under test.
 *
 * Writes one TenantBillingIdentity row, then deletes it again.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { encode } from 'next-auth/jwt';
import { prisma } from '../../../src/lib/db';

const BASE = process.env.PROBE_BASE_URL ?? 'http://localhost:3000';
const COOKIE_NAME = 'authjs.session-token';
const SECRET = process.env.AUTH_SECRET || 'fabrika-secret-key-horizon-europe-2026-super-secure';

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const had = await prisma.tenantBillingIdentity.findUnique({ where: { tenantId: tenant.id } });
  if (had) throw new Error('tenant already has a billing identity; refusing to overwrite it');

  const cookie = await encode({
    token: { sub: 'probe-user', id: 'probe-user', email: 'probe@fabrika.test', tenantId: tenant.id, role: 'TENANT_OWNER' },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 3600,
  });

  try {
    for (const country of ['Türkiye', 'Kuveyt', 'Belçika']) {
      await prisma.tenantBillingIdentity.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          buyerName: 'Probe Alıcı Ltd. Şti.',
          buyerVknTckn: '2840958172',
          buyerTaxOffice: 'Kadıköy V.D.',
          buyerAddress: 'Bağdat Cad. No:10',
          buyerCity: 'İstanbul',
          buyerCountry: country,
        },
        update: { buyerCountry: country },
      });

      const res = await fetch(`${BASE}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=${cookie}` },
        body: JSON.stringify({ items: [{ sku: 'basic', billingCycle: 'monthly', quantity: 1 }] }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      console.log(`\nbuyerCountry = ${country}  → HTTP ${res.status}`);
      console.log(
        JSON.stringify(
          {
            totalMinor: body.totalMinor,
            tax: body.tax,
            grossTotalMinor: body.grossTotalMinor,
            currency: body.currency,
          },
          null,
          2
        )
      );
    }
  } finally {
    await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: tenant.id } });
    console.log('\n(probe billing identity deleted; table back to:',
      await prisma.tenantBillingIdentity.count(), 'rows)');
    await prisma.$disconnect();
  }
}

main().catch(async (e: unknown) => {
  console.error(String(e));
  await prisma.$disconnect();
  process.exit(1);
});
