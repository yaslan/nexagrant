import { test, expect } from '@playwright/test';
import { expectHydrated } from './fixtures/hydration';

/**
 * The console must be clean of React's "Encountered a script tag" warning.
 *
 * That warning was reported four times and survived three attempted fixes
 * (next/script beforeInteractive, an inline dangerouslySetInnerHTML node, a plain
 * `src` script — in <head> and in <body>). React's condition is not the shape of
 * the script: it is a script node in the tree it is hydrating that it cannot match.
 * The only fix is to have no script node at all, which is why the theme is now
 * resolved from a cookie on the server (src/app/layout.tsx).
 *
 * This spec is the gate that keeps it gone. Re-introduce a <script> into the root
 * layout and it goes red.
 */
for (const locale of ['tr', 'en']) {
  test(`no React script-tag warning on /${locale}`, async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));

    await page.goto(`http://localhost:3000/${locale}`);
    // The warning is emitted during hydration, so wait for hydration itself: <body>
    // carrying React's props key (fixtures/hydration.ts). Then give React the room
    // to finish the rest of the tree.
    await expectHydrated(page.locator('body'));
    await page.waitForTimeout(1500);

    const offenders = logs.filter((line) => line.includes('Encountered a script tag'));
    expect(offenders.length, offenders.join('\n')).toBe(0);
  });
}
