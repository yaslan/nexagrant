import { test, expect, type Page } from '@playwright/test';

/**
 * TASK-MVDWBVWOAU34T (FO-88) — the pricing page draws Basic, then Pro, then
 * Ultra, on every URL it is reached by and at every width.
 *
 * The order used to be whatever order Postgres returned the `Plan` rows in
 * (no `orderBy`), and that moved: the shared dev database drew Pro ahead of
 * Basic. It is now `PLAN_DISPLAY_ORDER` in
 * `src/app/[locale]/(public)/pricing/plan-display-order.ts`.
 *
 * Only the named plans are compared. A plan the list does not name (one a
 * studio test left published) is allowed to appear, after them; this spec is
 * about the three, not about what else the database holds.
 *
 * The order is read twice: as the DOM order, which is what a screen reader and
 * the tab key follow, and as the on-screen position, because a grid can place
 * a card somewhere its markup does not say.
 */

const NAMED = ['basic', 'pro', 'ultra'];
const URLS = ['/tr/fiyatlandirma', '/tr/pricing', '/en/pricing'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 375, height: 812 },
];

function consent(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true })
    );
  });
}

async function namedCards(page: Page) {
  const cards = page.locator('[data-testid^="plan-card-"]');
  await expect(cards.first()).toBeVisible();
  const drawn = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        planId: (element.getAttribute('data-testid') ?? '').replace('plan-card-', ''),
        top: Math.round(box.top + window.scrollY),
        left: Math.round(box.left),
      };
    })
  );
  return drawn.filter((card) => NAMED.includes(card.planId));
}

for (const viewport of VIEWPORTS) {
  test.describe(`pricing card order at ${viewport.name} width`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const url of URLS) {
      test(`${url} draws Basic, Pro, Ultra`, async ({ page }) => {
        await consent(page);
        await page.goto(url);

        const cards = await namedCards(page);
        expect(cards.map((card) => card.planId)).toEqual(NAMED);

        // Reading order on screen: row by row, then left to right.
        const onScreen = [...cards].sort((a, b) => a.top - b.top || a.left - b.left);
        expect(onScreen.map((card) => card.planId)).toEqual(NAMED);

        // The swap moved positions, not the highlight: Pro is still the recommended card.
        const recommended = page.locator('[data-testid^="plan-card-"]').filter({ hasText: /recommended|ÖNERİLEN/i });
        await expect(recommended).toHaveCount(1);
        await expect(recommended).toHaveAttribute('data-testid', 'plan-card-pro');

        // The schedule table is headed by the same cards, in the same order.
        const headers = await page.locator('table thead th').allInnerTexts();
        const planColumns = headers.filter((text) => /^(Basic|Pro|Ultra)\b/.test(text.trim()));
        expect(planColumns.map((text) => text.trim().split(/\s/)[0]?.toLowerCase())).toEqual(NAMED);
      });
    }
  });
}
