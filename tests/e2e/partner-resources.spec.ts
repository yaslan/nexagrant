import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { PARTNER_RESOURCES } from '../../src/app/[locale]/(app)/[workspace]/partners/resources/resources';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * /partners/resources (TASK-MVQEAR9MCJLAT, FO-176) — the EU portal shortcut page
 * under Partners. Reached the way a user reaches it: by clicking the sidebar entry
 * (desktop) or the drawer entry (390px). A card click must open a new tab on the
 * portal's own host; the portal itself is answered by a stub so the run does not
 * depend on an outside site being up.
 */

const SHOTS = shotsDir('TASK-MVQEAR9MCJLAT-evidence');
const WORKSPACE = 'main';
const MEMBER = {
  userId: 'e2e-fo176-resources-member',
  email: 'fo176-resources-member@e2e.fabrika.test',
  role: 'PIPELINE_MANAGER' as const,
  tenantId: 'demo-tenant',
};
const MESSAGES = { tr: trMessages, en: enMessages } as const;

async function signIn(page: Page, locale: 'tr' | 'en') {
  await signInAs(page, { id: MEMBER.userId, email: MEMBER.email, tenantId: MEMBER.tenantId, role: MEMBER.role });
  await page.goto(`/${locale}/${WORKSPACE}/dashboard`);
}

async function expectTenCards(page: Page, locale: 'tr' | 'en') {
  const m = MESSAGES[locale].PartnerResources;
  await expect(page).toHaveURL(new RegExp(`/${locale}/${WORKSPACE}/partners/resources$`));
  await expect(page.getByRole('heading', { level: 1, name: m.title })).toBeVisible({ timeout: 30_000 });
  const cards = page.getByTestId('partner-resources-grid').getByRole('link');
  await expect(cards).toHaveCount(10);
  for (const r of PARTNER_RESOURCES) {
    const card = page.getByTestId(`partner-resource-${r.id}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', r.href);
    await expect(card).toHaveAttribute('target', '_blank');
    await expect(card).toHaveAttribute('rel', 'noopener noreferrer');
    const item = m.items[r.id as keyof typeof m.items];
    await expect(card).toContainText(item.name);
    await expect(card).toContainText(item.description);
  }
}

test.describe('Partner search resources (FO-176)', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...MEMBER, workspaceIds: [] });
  });
  test.afterAll(async () => {
    await cleanupIdentity([MEMBER.userId]);
    await prisma.$disconnect();
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`desktop: sidebar entry under Partners opens the page, a card opens the portal in a new tab (${locale})`, async ({ page, context }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      // The portal is stubbed: the test proves where the click goes, not that cordis.europa.eu is up.
      await context.route('https://cordis.europa.eu/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }),
      );
      await signIn(page, locale);

      const nav = MESSAGES[locale].Navigation;
      const entry = page.getByTestId('sidebar-nav-partnerResources').filter({ visible: true });
      await expect(entry).toHaveText(nav.partnerResources, { timeout: 30_000 });
      // Directly below Partners in the sidebar.
      const keys = await page
        .locator('aside [data-testid^="sidebar-nav-"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      expect(keys.indexOf('sidebar-nav-partnerResources')).toBe(keys.indexOf('sidebar-nav-partners') + 1);

      await entry.click();
      await expectTenCards(page, locale);
      // The open sub-entry is the highlighted one, not its parent.
      await expect(entry).toHaveClass(/bg-accent\/10/);
      await expect(page.getByTestId('sidebar-nav-partners').filter({ visible: true })).not.toHaveClass(/bg-accent\/10/);
      await page.screenshot({ path: `${SHOTS}/01-desktop-${locale}.png`, fullPage: true });

      // Keyboard: the card takes focus with a visible ring and Enter opens it.
      const cordis = page.getByTestId('partner-resource-cordis');
      await page.getByTestId('partner-resource-erasmusResults').focus();
      await page.keyboard.press('Tab');
      await expect(cordis).toBeFocused();
      expect(await cordis.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
      const [popup] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Enter')]);
      await popup.waitForLoadState('domcontentloaded');
      expect(new URL(popup.url()).host).toBe('cordis.europa.eu');
      // noopener: the portal gets no handle back to the app tab.
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      await popup.close();
    });

    test(`mobile 390px: the drawer entry opens the page (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await signIn(page, locale);

      await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
      const entry = page.getByTestId('sidebar-nav-partnerResources').filter({ visible: true });
      await expect(entry).toHaveText(MESSAGES[locale].Navigation.partnerResources);
      await page.screenshot({ path: `${SHOTS}/02-mobile-drawer-${locale}.png` });

      await entry.click();
      await expectTenCards(page, locale);
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? main.scrollWidth - main.clientWidth : 0;
      });
      expect(overflow, 'cards must fit the 390px viewport').toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/03-mobile-${locale}.png`, fullPage: true });
      await page.getByTestId('partner-resource-participantRegister').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/04-mobile-bottom-${locale}.png` });
    });
  }
});
