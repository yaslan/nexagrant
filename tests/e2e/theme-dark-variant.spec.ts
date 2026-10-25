import { test, expect, type Page } from '@playwright/test';

/**
 * AKTAR-MURBCJ0A-1 K-3 — `dark:` utilities must apply under the dark theme.
 *
 * The server puts `class="dark" data-theme="dark"` on <html> (src/app/layout.tsx), and
 * globals.css declared `@custom-variant dark (&:where(.dark, [data-theme="dark"]))`.
 * Tailwind compiles that to `.dark\:bg-slate-900:where(.dark, [data-theme="dark"])`,
 * i.e. the element *itself* must carry `.dark`. Only <html> does, so every `dark:`
 * class below it was dead: the Panel h1 stayed #101828 on the #080D1A ground (1.09:1).
 *
 * The check is behavioural, not a grep of globals.css: the same element is rendered in
 * both themes and its computed colour must change to the `dark:` value. Drop the
 * descendant selector from the variant and this goes red.
 */

// Public, no session or database needed. Its <main> is `bg-gray-50 dark:bg-slate-900`
// and the back link `text-indigo-600 dark:text-indigo-400`.
const PATH = '/tr/calls/germany';

async function colours(page: Page, baseURL: string, theme: 'light' | 'dark') {
  await page.context().addCookies([{ name: 'fabrika-theme', value: theme, url: baseURL }]);
  await page.goto(PATH);
  const wrapper = page.locator('main.bg-gray-50').first();
  await expect(wrapper).toBeVisible();
  return page.evaluate(() => {
    const html = document.documentElement;
    const wrapper = document.querySelector('main.bg-gray-50') as HTMLElement;
    const link = wrapper.querySelector('a.text-indigo-600') as HTMLElement;
    return {
      htmlDark: html.classList.contains('dark'),
      dataTheme: html.getAttribute('data-theme'),
      wrapperBg: getComputedStyle(wrapper).backgroundColor,
      linkColor: getComputedStyle(link).color,
    };
  });
}

/** What the browser computes for a given Tailwind colour utility, measured in place. */
async function computedOf(page: Page, className: string, prop: 'backgroundColor' | 'color') {
  return page.evaluate(
    ([cls, p]) => {
      const probe = document.createElement('span');
      probe.className = cls;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe)[p as 'color'];
      probe.remove();
      return value;
    },
    [className, prop] as const,
  );
}

test('dark: utilities apply to descendants of <html class="dark">', async ({ page, baseURL }) => {
  const light = await colours(page, baseURL!, 'light');
  expect(light.htmlDark).toBe(false);

  const dark = await colours(page, baseURL!, 'dark');
  expect(dark.htmlDark).toBe(true);
  expect(dark.dataTheme).toBe('dark');

  expect(dark.wrapperBg, 'dark:bg-slate-900 did not apply').not.toBe(light.wrapperBg);
  expect(dark.linkColor, 'dark:text-indigo-400 did not apply').not.toBe(light.linkColor);

  // And it is the dark: value, not some other cascade change.
  expect(dark.wrapperBg).toBe(await computedOf(page, 'bg-slate-900', 'backgroundColor'));
  expect(dark.linkColor).toBe(await computedOf(page, 'text-indigo-400', 'color'));
});
