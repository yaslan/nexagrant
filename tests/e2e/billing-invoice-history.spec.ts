import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

import { createDbClient } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * TASK-MTRD91ZLKEQ3A — Settings → Billing may not quote a number nobody issued.
 *
 * The panel shipped two constants in `BillingClient.tsx`: `GIB202600000001` and
 * `GIB202600000014`, dated 01.09.2026 and 01.08.2026, described as "Team Plan"
 * (a plan id retired in `RETIRED_PLAN_IDS`), for ₺32,220.00 and ₺10,740.00,
 * under a column headed "GİB fatura no" — plus a legal name "Demo Ar-Ge ve
 * Danışmanlık Ltd. Şti." and VKN 2840958172. Nothing issued any of it.
 *
 * This walks the real panel in a real browser on the demo tenant: first with no
 * invoices (the honest empty state), then with one `Invoice` row actually
 * written, then with a GİB envelope id on that row. The row is removed
 * afterwards.
 */

const SHOTS = shotsDir('TASK-MTRD91ZLKEQ3A-screenshots');
const TENANT_ID = 'demo-tenant';
const BILLING_URL = '/tr/main/settings/billing';
const NUMBER = `E2E-${Date.now()}`;

/** Everything the panel used to state without a record behind it. */
const RETIRED_FABRICATIONS = [
  'GIB202600000001',
  'GIB202600000014',
  'Team Plan',
  '32,220',
  'Demo Ar-Ge',
  '2840958172',
];

const prisma = createDbClient(
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika'
);

/**
 * A TENANT_OWNER seat of this spec's own on the demo tenant, seeded in `beforeAll` and
 * removed in `afterAll`; signed in with a minted cookie, not the demo form, so the spec
 * runs against `next start` too (TASK-MUSBCXP9RKS3D). `workspaceIds: []` is every
 * workspace, the reach of the demo seat it replaces.
 */
const OWNER = {
  userId: 'e2e-invoice-history-owner',
  email: 'invoice-history-owner@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: TENANT_ID,
};

async function signIn(page: Page) {
  // signInAs also records the cookie consent the banner would otherwise ask for.
  await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
  await page.goto(BILLING_URL);
  await page.waitForURL(`**${BILLING_URL}`, { timeout: 30_000 });
  // Every caller asserts on a locator next; that auto-wait is the synchronisation.
}

/** The card holding the invoice history — what the evidence screenshots frame. */
function invoiceSection(page: Page) {
  return page.getByTestId('billing-invoice-section');
}

test.describe.configure({ mode: 'serial' });

test.describe('billing panel invoice history', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...OWNER, workspaceIds: [] });
  });

  test.afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { tenantId: TENANT_ID, number: NUMBER } });
    await cleanupIdentity([OWNER.userId]);
    await prisma.$disconnect();
  });

  test('with no invoice on record it says so, and quotes nothing', async ({ page }) => {
    // Only this spec's own leftovers are removed — a real invoice on the demo
    // tenant is somebody's record, and a test may not delete it. If one exists,
    // the empty state is *correctly* absent and there is nothing to assert.
    await prisma.invoice.deleteMany({
      where: { tenantId: TENANT_ID, number: { startsWith: 'E2E-' } },
    });
    const existing = await prisma.invoice.count({ where: { tenantId: TENANT_ID } });
    test.skip(existing > 0, `demo tenant already holds ${existing} invoice(s)`);

    await signIn(page);

    await expect(page.getByTestId('billing-invoices-empty')).toBeVisible();
    const body = await page.locator('body').innerText();
    for (const fabrication of RETIRED_FABRICATIONS) {
      expect(body, `panel still states "${fabrication}"`).not.toContain(fabrication);
    }
    await invoiceSection(page).screenshot({ path: `${SHOTS}/billing-invoices-empty.png` });
  });

  test('an invoice that exists is listed with its own stored total', async ({ page }) => {
    await prisma.invoice.create({
      data: {
        tenantId: TENANT_ID,
        number: NUMBER,
        issuedAt: new Date('2026-09-01T09:00:00.000Z'),
        currency: 'TRY',
        buyerName: 'Fabrika Beta A.Ş.',
        buyerVknTckn: '1234567890',
        buyerTaxOffice: 'Doğanbey V.D.',
        buyerAddress: 'ODTÜ Teknokent Blok B',
        buyerCity: 'Ankara',
        buyerCountry: 'Türkiye',
        // Minor units on the row (CLAUDE.md rule 9): ₺8.950,00 + %20 KDV.
        lines: [
          {
            name: 'Fabrika Pro Plan (1 ay)',
            quantity: 1,
            unitCode: 'MON',
            unitPriceMinor: 895_000,
            vatRate: 20,
          },
        ],
        ettn: randomUUID(),
      },
    });

    await signIn(page);
    const table = page.getByTestId('billing-invoices');
    await expect(table).toBeVisible();
    await expect(table.getByText(NUMBER)).toBeVisible();
    await expect(table.getByText('Fabrika Pro Plan (1 ay)')).toBeVisible();
    // Computed from the row, not typed into the page.
    await expect(table.getByText('₺10.740,00')).toBeVisible();
    // No envelope id on the row yet, so no filing may be claimed.
    await expect(table.getByText("GİB'e gönderilmedi")).toBeVisible();
    await invoiceSection(page).screenshot({ path: `${SHOTS}/billing-invoices-listed.png` });
    await page.screenshot({ path: `${SHOTS}/billing-quota-cards.png` });
  });

  test('it claims a GİB filing only once the row carries an envelope id', async ({ page }) => {
    await prisma.invoice.updateMany({
      where: { tenantId: TENANT_ID, number: NUMBER },
      data: { gibEnvelopeId: 'ENV-E2E-77' },
    });

    await signIn(page);
    const table = page.getByTestId('billing-invoices');
    await expect(table.getByText("GİB'e gönderildi")).toBeVisible();
    await invoiceSection(page).screenshot({ path: `${SHOTS}/billing-invoices-filed.png` });
  });
});
