import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';

import { createDbClient } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * TASK-MTSY71BUMBLWM — the screen that fills `TenantBillingIdentity` in.
 *
 * `invoice-writer.ts` refuses to issue an invoice without that row, and until
 * this card nothing in `src/app/` could write one: the table had a reader, a VAT
 * resolver and an alert, and no writer. 82 of the 106 open operator alerts were
 * that single gap when the pile was measured (77.4% — see
 * docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/01-alert-pile-before.txt).
 *
 * This walks the real panel in a real browser against the demo tenant, because
 * the unit tests mock the database away and therefore cannot see the two things
 * that actually matter here:
 *
 *   1. that a rejected VKN is rejected *by the screen*, with the reason shown
 *      against the field rather than swallowed, and
 *   2. that a member who may not edit the identity never receives it — the page
 *      payload, not just the rendered text, has to be free of the number. A
 *      section hidden with CSS still ships what it hides.
 *
 * The row is removed afterwards, so the "nothing on file yet" state the first
 * test asserts is there again on the next run.
 */

const SHOTS = shotsDir('TASK-MTSY71BUMBLWM-screenshots');
const TENANT_ID = 'demo-tenant';
const BILLING_URL = '/tr/main/settings/billing';

/**
 * Seats of this spec's own on the demo tenant, seeded in `beforeAll` and removed in
 * `afterAll` (TASK-MUSBCXP9RKS3D): the session is a minted cookie, not the demo
 * sign-in form, so the spec runs against `next start` too. `workspaceIds: []` is
 * every workspace, the same reach the demo seats it replaces had.
 */
type Seat = { userId: string; email: string; role: 'TENANT_OWNER' | 'PIPELINE_MANAGER'; tenantId: string };
/** TENANT_OWNER on the demo tenant — the only role `manage_billing` is granted to. */
const OWNER: Seat = {
  userId: 'e2e-billing-identity-owner',
  email: 'billing-identity-owner@e2e.fabrika.test',
  role: 'TENANT_OWNER',
  tenantId: TENANT_ID,
};
/** PIPELINE_MANAGER on the same tenant: signed in, entitled to the page, not to the identity. */
const NON_OWNER: Seat = {
  userId: 'e2e-billing-identity-member',
  email: 'billing-identity-member@e2e.fabrika.test',
  role: 'PIPELINE_MANAGER',
  tenantId: TENANT_ID,
};

/**
 * A valid VKN whose check digit holds, and one whose does not. Both are test
 * data: 1000000000 is the same clearly-fake number `playwright.config.ts`
 * already uses for the supplier side, and cannot be mistaken for a real
 * taxpayer. No TCKN is used anywhere in this file — a real-looking national
 * identity number does not belong in a repository, even as a fixture.
 */
const VALID_VKN = '1000000000';
const INVALID_VKN = '1234567891';

const prisma = createDbClient(
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika'
);

async function signIn(page: Page, seat: Seat) {
  // signInAs also records the cookie consent the banner would otherwise ask for.
  await signInAs(page, { id: seat.userId, email: seat.email, tenantId: seat.tenantId, role: seat.role });
  await page.goto(BILLING_URL);
  // Landing on the page (not bounced to /giris or /no-workspace) is the proof the session is real.
  await page.waitForURL(`**${BILLING_URL}`, { timeout: 30_000 });
  // Callers assert on a locator next; the ones that type hydrate the form first.
}

test.describe.configure({ mode: 'serial' });

test.describe('billing identity form', () => {
  test.beforeAll(async () => {
    for (const seat of [OWNER, NON_OWNER]) {
      await seedIdentity({ ...seat, workspaceIds: [] });
    }
    // Only the demo tenant's own row, and only so the run starts from the state
    // every tenant is in today: none of them has an identity.
    await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: TENANT_ID } });
  });

  test.afterAll(async () => {
    await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: TENANT_ID } });
    await cleanupIdentity([OWNER.userId, NON_OWNER.userId]);
    await prisma.$disconnect();
  });

  test('an owner with no identity on file is told so, and given the form', async ({ page }) => {
    await signIn(page, OWNER);

    await expect(page.getByTestId('billing-identity')).toBeVisible();
    await expect(page.getByTestId('billing-identity-missing')).toBeVisible();
    // Nothing is on file, so the read-back panel must not be rendered at all.
    await expect(page.getByTestId('billing-identity-onfile')).toHaveCount(0);

    await page.getByTestId('billing-identity').screenshot({
      path: `${SHOTS}/01-owner-empty-form.png`,
    });
  });

  test('a VKN whose check digit does not hold is refused, and nothing is written', async ({
    page,
  }) => {
    await signIn(page, OWNER);
    // The inputs are controlled: typing before React hydrates them is overwritten.
    await expectHydrated(page.getByTestId('billing-identity-save'));

    await page.locator('#buyerName').fill('Örnek Teknoloji A.Ş.');
    await page.locator('#buyerVknTckn').fill(INVALID_VKN);
    await page.locator('#buyerTaxOffice').fill('Maslak Vergi Dairesi');
    await page.locator('#buyerCity').fill('İstanbul');
    await page.locator('#buyerAddress').fill('Büyükdere Cad. No: 1');
    await page.getByTestId('billing-identity-save').click();

    // The reason is shown against the field that carries it, not as a generic
    // "something went wrong" the buyer cannot act on.
    await expect(page.getByTestId('identity-error-buyerVknTckn')).toBeVisible();
    await expect(page.getByTestId('billing-identity-banner')).toBeVisible();

    await page.getByTestId('billing-identity').screenshot({
      path: `${SHOTS}/02-invalid-vkn-rejected.png`,
    });

    // The claim under test is not "a message appeared" but "no row was written".
    const rows = await prisma.tenantBillingIdentity.count({ where: { tenantId: TENANT_ID } });
    expect(rows, 'a refused submission still reached the database').toBe(0);
  });

  test('a valid identity is stored, normalised, and read back masked', async ({ page }) => {
    await signIn(page, OWNER);
    // The inputs are controlled: typing before React hydrates them is overwritten.
    await expectHydrated(page.getByTestId('billing-identity-save'));

    await page.locator('#buyerName').fill('Örnek Teknoloji A.Ş.');
    // Typed the way it is printed on a letterhead, spaces and all: the stored
    // value has to be the digits.
    await page.locator('#buyerVknTckn').fill('100 000 000 0');
    await page.locator('#buyerTaxOffice').fill('Maslak  Vergi Dairesi');
    await page.locator('#buyerCity').fill('İstanbul');
    await page.locator('#buyerAddress').fill('Büyükdere Cad. No: 1');
    await page.getByTestId('billing-identity-save').click();

    const banner = page.getByTestId('billing-identity-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('kaydedildi');

    await page.getByTestId('billing-identity').screenshot({
      path: `${SHOTS}/03-valid-identity-saved.png`,
    });

    const row = await prisma.tenantBillingIdentity.findUnique({ where: { tenantId: TENANT_ID } });
    expect(row, 'the form reported a save but no row exists').not.toBeNull();
    expect(row?.buyerVknTckn).toBe(VALID_VKN);
    expect(row?.buyerTaxOffice).toBe('Maslak Vergi Dairesi');
    expect(row?.buyerCountry).toBe('TR');

    // Reloading shows what is on file — masked, never the whole number.
    await page.reload();
    await expect(page.getByTestId('billing-identity-onfile')).toBeVisible();
    await expect(page.getByTestId('billing-identity-onfile')).toContainText('0000');
    await expect(page.getByTestId('billing-identity-onfile')).not.toContainText(VALID_VKN);

    await page.getByTestId('billing-identity').screenshot({
      path: `${SHOTS}/04-identity-on-file-masked.png`,
    });
  });

  test('a member who may not edit it never receives the number', async ({ page }) => {
    // The row from the previous test is still on file — which is the only way
    // this test means anything: there is something to leak.
    const row = await prisma.tenantBillingIdentity.findUnique({ where: { tenantId: TENANT_ID } });
    expect(row?.buyerVknTckn, 'nothing on file, so this proves nothing').toBe(VALID_VKN);

    await signIn(page, NON_OWNER);

    await expect(page.getByTestId('billing-identity-locked')).toBeVisible();
    await expect(page.getByTestId('billing-identity-save')).toHaveCount(0);

    // `content()` is the whole document: the markup *and* the serialised server
    // payload the React tree is rehydrated from. `innerText` would pass on a
    // section that merely renders the value off-screen.
    const payload = await page.content();
    expect(payload, 'the VKN reached a member who may not edit it').not.toContain(VALID_VKN);
    expect(payload, 'the VKN reached a member in its masked form').not.toContain('Maslak');

    await page.getByTestId('billing-identity-locked').screenshot({
      path: `${SHOTS}/05-non-owner-locked.png`,
    });
  });
});
