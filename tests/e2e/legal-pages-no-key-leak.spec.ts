import { test, expect } from '@playwright/test';

import { PRODUCT_NAME } from '../../src/lib/brand';

/**
 * TASK-MTVDQPG9V5WVY — a public legal page must print its TEXT, never the name
 * of the catalogue key that holds it.
 *
 * The three notices read `legal.*` strings that carry a `{brand}` placeholder,
 * but called `t('key')` with no interpolation values. next-intl answers a
 * missing value with `FORMATTING_ERROR` and falls back to rendering the key
 * path itself, so a reader arriving at `/tr/privacy` found the literal
 * `legal.privacy.controllerBody` under the "Veri Sorumlusu" heading — the KVKK
 * art.10 controller-identity disclosure was not merely incomplete, it was
 * absent, and every one of the six pages carried `legal.*.metaTitle` in its
 * browser tab and its Open Graph card.
 *
 * The failure is silent by construction: the page still answers 200, the
 * layout is intact, and nothing is thrown — only the words are gone. So the
 * guard asserts on rendered output rather than on the call sites. A future
 * placeholder added to a legal string, or a call site that drops its values
 * again, turns this red.
 *
 * `<title>` is asserted alongside the body deliberately: the body defect is the
 * visible one, and a fix that repairs the body while leaving `generateMetadata`
 * untouched looks completely correct in a browser window.
 */

const LOCALES = ['tr', 'en'] as const;

const PAGES = [
  { path: 'privacy', namespace: 'legal.privacy' },
  { path: 'terms', namespace: 'legal.terms' },
  { path: 'compliance/dpa', namespace: 'legal.dpa' },
  { path: 'cookies', namespace: 'legal.cookies' },
] as const;

/** A key path as next-intl renders it on failure, e.g. `legal.privacy.controllerBody`. */
const KEY_PATH = /legal\.[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9.]*/g;

test.describe('legal pages render text, not catalogue key paths', () => {
  for (const locale of LOCALES) {
    for (const page_ of PAGES) {
      const url = `/${locale}/${page_.path}`;

      test(`${url} leaks no key path and no raw placeholder`, async ({ page }) => {
        const response = await page.goto(url);
        expect(response, `no response for ${url}`).not.toBeNull();
        expect(response!.status(), `${url} must answer 200`).toBe(200);

        const bodyText = (await page.locator('body').innerText()) ?? '';
        const bodyLeaks = bodyText.match(KEY_PATH) ?? [];
        expect(
          bodyLeaks,
          `${url} prints catalogue key path(s) where the text belongs: ${bodyLeaks.join(', ')}`,
        ).toEqual([]);

        // An un-substituted `{brand}` is the same defect wearing the other face:
        // the value reached the formatter but the catalogue kept the literal.
        expect(bodyText, `${url} shows an un-substituted {brand}`).not.toContain('{brand}');

        const title = await page.title();
        expect(
          title.match(KEY_PATH) ?? [],
          `${url} has the key path in its <title>: ${title}`,
        ).toEqual([]);
        expect(title, `${url} <title> shows an un-substituted {brand}`).not.toContain('{brand}');

        const description = await page
          .locator('meta[name="description"]')
          .getAttribute('content');
        expect(description, `${url} has no meta description`).not.toBeNull();
        expect(
          description!.match(KEY_PATH) ?? [],
          `${url} has the key path in its meta description: ${description}`,
        ).toEqual([]);
      });
    }
  }

  test("the privacy notice names the controller in the reader's language", async ({ page }) => {
    // The regression that started the card: the section under the controller
    // heading must be a sentence naming the controller, not a key path. The
    // expected name is read from `brand.ts` rather than typed here, so a rename
    // moves this assertion with it; the retired name is a literal, because a
    // dead brand is a fact of history and must never reappear.
    const RETIRED_BRAND = 'Fabrika';

    for (const locale of LOCALES) {
      await page.goto(`/${locale}/privacy`);
      const body = await page.locator('body').innerText();
      expect(body, `/${locale}/privacy must name the controller`).toContain(PRODUCT_NAME);
      expect(body, `/${locale}/privacy shows the retired brand`).not.toContain(RETIRED_BRAND);
    }
  });
});
