import { test, expect } from '@playwright/test';
import { expectHydrated } from './fixtures/hydration';

/**
 * The tree must hydrate without a mismatch, with a *non-empty* cart and the cookie
 * banner up.
 *
 * Both surfaces used to read `localStorage` from a `useState` initialiser, which runs
 * during render: on the server there is no storage, so the cart came out empty and the
 * banner came out hidden, while the client's very first render already had the real
 * cart and the banner — React reported "Hydration failed because the server rendered
 * HTML didn't match the client" and named the floating `<button aria-label="Sepeti aç">`
 * the server never emitted.
 *
 * The cart has to be seeded for this to mean anything: with an empty cart the drawer's
 * button is absent on both sides and the mismatch never appears, so a spec that loads
 * the page as-is is a green light with nothing behind it. `addInitScript` writes the
 * storage keys before any page script runs.
 */
const CART_STORAGE_KEY = 'fonbridge_cart_items_v2';
const CONSENT_STORAGE_KEY = 'fabrika_cookie_consent';

const SEEDED_CART = [
  {
    sku: 'plan-pro',
    type: 'plan',
    name: 'Pro',
    billingCycle: 'monthly',
    quantity: 1,
  },
];

const CART_BUTTON_LABEL: Record<string, string> = { tr: 'Sepeti aç', en: 'Open cart' };

for (const locale of ['tr', 'en']) {
  test(`no hydration mismatch on /${locale} with a full cart and the cookie banner`, async ({
    page,
  }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));

    await page.addInitScript(
      ([cartKey, consentKey, cart]) => {
        try {
          localStorage.setItem(cartKey as string, cart as string);
          // The banner only shows while this browser has not answered.
          localStorage.removeItem(consentKey as string);
        } catch {
          // Storage unavailable would make the seeding pointless, but not this test wrong.
        }
      },
      [CART_STORAGE_KEY, CONSENT_STORAGE_KEY, JSON.stringify(SEEDED_CART)] as const
    );

    await page.goto(`/${locale}`);
    // The mismatch is reported during hydration, so the check waits for hydration itself:
    // the cart button carrying React's props key (fixtures/hydration.ts). That is also the
    // guard against a green run that proves nothing — if the surface never rendered,
    // there was no mismatch to catch in the first place.
    await expectHydrated(page.getByRole('button', { name: CART_BUTTON_LABEL[locale] }));
    await page.waitForTimeout(1500);
    await expect(page.getByRole('alertdialog')).toBeVisible();

    const offenders = logs.filter(
      (line) =>
        line.includes('Hydration failed') ||
        line.includes("server rendered HTML didn't match the client") ||
        line.includes('did not match')
    );
    expect(offenders.length, offenders.join('\n')).toBe(0);
  });
}

/**
 * The cart must survive a page reload. If the `isHydrated` guard in CartContext.tsx
 * is removed, the pre-hydration empty placeholder would write back to localStorage
 * on every render during hydration, erasing the customer's cart on reload.
 * This test verifies the guard actually prevents that data loss.
 */
test('cart persists across page reload', async ({ page }) => {
  await page.addInitScript(
    ([cartKey, consentKey, cart]) => {
      try {
        localStorage.setItem(cartKey as string, cart as string);
        localStorage.removeItem(consentKey as string);
      } catch {
        // Storage unavailable would make the seeding pointless, but not this test wrong.
      }
    },
    [CART_STORAGE_KEY, CONSENT_STORAGE_KEY, JSON.stringify(SEEDED_CART)] as const
  );

  await page.goto('/tr');

  // Verify the cart is present, and hydrated, before reload
  await expectHydrated(page.getByRole('button', { name: CART_BUTTON_LABEL.tr }));
  await page.waitForTimeout(1500);

  // Reload the page
  await page.reload();

  // Verify the cart button is still there once React has hydrated again
  // (this means the cart data was not erased on re-hydration)
  await expectHydrated(page.getByRole('button', { name: CART_BUTTON_LABEL.tr }));
  await page.waitForTimeout(1500);

  // Verify the cart items in localStorage were not wiped
  const cartAfterReload = await page.evaluate(() => {
    try {
      const stored = localStorage.getItem('fonbridge_cart_items_v2');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  expect(cartAfterReload).not.toBeNull();
  expect(Array.isArray(cartAfterReload)).toBe(true);
  expect(cartAfterReload.length).toBeGreaterThan(0);
});
