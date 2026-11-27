import { writeFile } from 'node:fs/promises';

import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * TASK-MTR882HVZ8BG7 — "the price you join at stays yours", in a real browser.
 *
 * The pricing page makes that promise in both catalogues. Until this task
 * nothing recorded the rate a tenant joined at, so every surface quoted the
 * campaign of the day: a tenant that joined Pro monthly under ILK5 at $26.10
 * was shown $87.00 for the same plan once the campaign closed.
 *
 * What is asserted here is the *divergence*. With no campaign running, the
 * public pricing page quotes a stranger the list price while the locked
 * tenant's own billing panel still quotes the rate it joined at — two pages,
 * two numbers, same server, same minute. That gap is the promise working.
 *
 * The fixture writes the lock onto the seeded subscription and clears it again
 * afterwards, so the run leaves the database as it found it.
 */

const SHOTS = shotsDir('TASK-MTR882HVZ8BG7-screenshots');
const TENANT_ID = 'demo-tenant';
/**
 * A TENANT_OWNER seat of this spec's own on the locked tenant, seeded in `beforeAll`
 * and removed in `afterAll`; signed in with a minted cookie, not the demo form, so the
 * spec runs against `next start` too (TASK-MUSBCXP9RKS3D). `workspaceIds: []` is every
 * workspace, the reach of the demo seat it replaces.
 */
const OWNER = {
  userId: 'e2e-price-lock-owner',
  email: 'price-lock-owner@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: TENANT_ID,
};
const BILLING_URL = '/tr/main/settings/billing';

/** Pro monthly: $87.00 list, $26.10 at 70% off (ILK5). */
const LOCK = {
  lockedTierCode: 'ILK5',
  lockedPercentOff: 70,
  lockedAmountMinor: 2_610,
  lockedCurrency: 'USD',
  priceLockedAt: new Date('2026-03-01T00:00:00.000Z'),
};

const CLEARED = {
  lockedTierCode: null,
  lockedPercentOff: null,
  lockedAmountMinor: null,
  lockedCurrency: null,
  priceLockedAt: null,
};

/** Locale-tolerant: tr renders "87,00 $", en renders "$87.00". */
const LIST_PRO_MONTHLY = /87[.,]00/;
const LOCKED_PRO_MONTHLY = /26[.,]10/;

test.describe('price lock — a locked tenant and a stranger see different prices', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...OWNER, workspaceIds: [] });
    await prisma.subscription.update({ where: { tenantId: TENANT_ID }, data: LOCK });
  });

  test.afterAll(async () => {
    await prisma.subscription.update({ where: { tenantId: TENANT_ID }, data: CLEARED });
    await cleanupIdentity([OWNER.userId]);
  });

  /** The owner's session, landing on the billing panel; the URL is the proof it is real. */
  const signInAsOwner = async (page: import('@playwright/test').Page) => {
    await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: OWNER.tenantId, role: OWNER.role });
    await page.goto(BILLING_URL);
    await page.waitForURL(`**${BILLING_URL}`, { timeout: 30_000 });
  };

  const shot = (page: import('@playwright/test').Page, name: string) =>
    page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  const consent = (page: import('@playwright/test').Page) =>
    page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' }),
      );
    });

  test('the public pricing page quotes a stranger the list price', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    // The toggle is client state: a click before hydration is lost (docs/E2E_TESTING.md §3.4).
    const monthly = page.getByRole('button', { name: 'Aylık', exact: true });
    await expectHydrated(monthly);
    await monthly.click();

    const price = page.getByTestId('plan-price-pro');
    // The whole demonstration rests on no campaign running — that is the state
    // in which the old code re-priced everyone. If the server was started with
    // BILLING_ACTIVE_TIER set, this fails rather than photographing a run that
    // proves nothing.
    await expect(price).toHaveText(LIST_PRO_MONTHLY);

    // The card on its own as well as the page: the number is the evidence, and
    // it should not need hunting for in a full-page capture.
    await page.getByTestId('plan-card-pro').screenshot({
      path: `${SHOTS}/01a-pricing-card-pro-stranger.png`,
    });

    // And the promise the lock now backs is on the page, with its limits stated.
    await expect(page.getByText('Katıldığınız fiyat sabit kalır.')).toBeVisible();
    await expect(page.getByText(/Kilit, aboneliğiniz sürdüğü sürece geçerlidir/)).toBeVisible();

    await shot(page, '01-pricing-page-stranger-list-price');
  });

  test('the locked tenant’s own billing panel still quotes the rate it joined at', async ({ page }) => {
    await consent(page);
    await signInAsOwner(page);
    // The toggle is client state: a click before hydration is lost (docs/E2E_TESTING.md §3.4).
    const monthly = page.getByRole('button', { name: 'Aylık', exact: true });
    await expectHydrated(monthly);
    await monthly.click();

    const price = page.getByTestId('settings-plan-price-pro');
    await expect(price).toHaveText(LOCKED_PRO_MONTHLY);
    await expect(price).not.toHaveText(LIST_PRO_MONTHLY);

    // The panel names the tenant's own locked rate, not a campaign it could join.
    await expect(page.getByText(/katıldığınız ILK5 oranına sabitlenmiş/i)).toBeVisible();

    await page.getByTestId('settings-plan-card-pro').screenshot({
      path: `${SHOTS}/02a-billing-card-pro-locked.png`,
    });
    await shot(page, '02-billing-panel-locked-tenant');
  });
  test('checkout charges the locked rate, not the campaign of the day', async ({ page }) => {
    // The panel is what the customer reads; this is what the customer pays.
    // Stripe credentials are not live in dev, so checkout returns the amounts it
    // computed instead of a Stripe URL — which is exactly the number under test.
    await consent(page);
    await signInAsOwner(page);

    const response = await page.request.post('/api/billing/checkout', {
      data: { items: [{ sku: 'pro', billingCycle: 'monthly', quantity: 1 }] },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.demoMode).toBe(true);
    expect(body.priceLocked).toBe(true);
    expect(body.shopfrontTier).toMatchObject({ code: 'NONE', percentOff: 0 });
    expect(body.activeTier).toMatchObject({ code: 'ILK5', percentOff: 70 });
    expect(body.lines[0]).toMatchObject({
      sku: 'plan-pro',
      amountMinor: 2_610,
      listAmountMinor: 8_700,
      percentOff: 70,
      campaignCode: 'ILK5',
    });

    // Written down next to the screenshots: an API response is the evidence
    // here, and a reader of the report should not have to take it on trust.
    await writeFile(
      `${SHOTS}/03-checkout-response-locked.json`,
      JSON.stringify(body, null, 2) + '\n',
    );
  });
});
