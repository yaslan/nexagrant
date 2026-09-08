import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTR882HVZ8BG7 — the lock is a floor, not a ceiling.
 *
 * A tenant that joined at 40% off must never be quoted more than a stranger who
 * walks in during a 70% campaign. `effectiveTier` therefore takes the better of
 * the two rates, and this proves it on the running product rather than in a
 * unit test: same plan, same minute, the locked tenant and the stranger both
 * see the deeper campaign price.
 *
 * It needs a campaign running, which is a server setting, so the spec skips
 * itself unless the server it is pointed at is running ILK5:
 *
 *   BILLING_ACTIVE_TIER=ILK5 pnpm dev --port 3210
 *   E2E_BASE_URL=http://localhost:3210 npx playwright test tests/e2e/price-lock-deeper-campaign.spec.ts
 */

const SHOTS = shotsDir('TASK-MTR882HVZ8BG7-screenshots');
const TENANT_ID = 'demo-tenant';
const EMAIL = 'admin@yasinaslan.com.tr';
const BILLING_URL = '/tr/main/settings/billing';

/** A shallower lock than the campaign: Pro monthly at 40% off is $52.20. */
const SHALLOW_LOCK = {
  lockedTierCode: 'KURUCU40',
  lockedPercentOff: 40,
  lockedAmountMinor: 5_220,
  lockedCurrency: 'USD',
  priceLockedAt: new Date('2026-01-15T00:00:00.000Z'),
};

const CLEARED = {
  lockedTierCode: null,
  lockedPercentOff: null,
  lockedAmountMinor: null,
  lockedCurrency: null,
  priceLockedAt: null,
};

/** Locale-tolerant: tr renders "26,10 $", en renders "$26.10". */
const CAMPAIGN_PRO_MONTHLY = /26[.,]10/;
const LOCKED_PRO_MONTHLY = /52[.,]20/;

test.describe('price lock — a deeper campaign reaches an already-locked tenant', () => {
  test.beforeAll(async () => {
    await prisma.subscription.update({ where: { tenantId: TENANT_ID }, data: SHALLOW_LOCK });
  });

  test.afterAll(async () => {
    await prisma.subscription.update({ where: { tenantId: TENANT_ID }, data: CLEARED });
  });

  const shot = (page: import('@playwright/test').Page, name: string) =>
    page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  const consent = (page: import('@playwright/test').Page) =>
    page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });

  test('the locked tenant is quoted the deeper campaign, not its own shallower rate', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    await page.waitForLoadState('networkidle');

    const runningTier = (await page.getByTestId('active-tier-code').innerText()).trim();
    test.skip(
      runningTier !== 'ILK5',
      `needs a server running BILLING_ACTIVE_TIER=ILK5; this one is running ${runningTier}`,
    );

    await page.getByRole('button', { name: 'Aylık', exact: true }).click();
    await expect(page.getByTestId('plan-price-pro')).toHaveText(CAMPAIGN_PRO_MONTHLY);
    await page.getByTestId('plan-card-pro').screenshot({
      path: `${SHOTS}/05a-pricing-card-pro-campaign.png`,
    });
    await shot(page, '05-pricing-page-campaign-running');

    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(BILLING_URL)}`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${BILLING_URL}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Aylık', exact: true }).click();

    const price = page.getByTestId('settings-plan-price-pro');
    await expect(price).toHaveText(CAMPAIGN_PRO_MONTHLY);
    await expect(price).not.toHaveText(LOCKED_PRO_MONTHLY);

    // Quoted the campaign, so the panel names the campaign — not a locked rate
    // the customer is no longer paying.
    await expect(page.getByText(/ILK5 kampanyasına göre gösteriliyor/i)).toBeVisible();

    await page.getByTestId('settings-plan-card-pro').screenshot({
      path: `${SHOTS}/06a-billing-card-pro-deeper-campaign.png`,
    });
    await shot(page, '06-billing-panel-deeper-campaign-wins');
  });
});
