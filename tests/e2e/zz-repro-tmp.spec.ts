import { test } from '@playwright/test';

const SHOTS = 'docs/agent-results/TASK-MTR4CH9IDK4D7-screenshots';
const URL = '/tr/main/opportunities/demo-opp-1/matching';

test('repro: M8 matching page + Find Candidates', async ({ page }) => {
  const statuses: string[] = [];
  page.on('response', (r) => {
    if (r.request().resourceType() === 'document' || r.status() >= 400) {
      statuses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }));
  });

  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(URL)}`);
  await page.locator('input[type="email"]').fill('alice@fabrika.test');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${URL}`, { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle');

  // Next dev overlay: read the error title + message out of the DOM.
  const overlay = await page.locator('nextjs-portal').count();
  console.log('OVERLAY PRESENT:', overlay);
  const errText = await page.evaluate(() => {
    const portal = document.querySelector('nextjs-portal');
    const root = portal?.shadowRoot;
    return root ? (root.textContent || '').replace(/\s+/g, ' ').slice(0, 900) : '(no overlay)';
  });
  console.log('OVERLAY TEXT:', errText);
  console.log('DOCUMENT RESPONSES:', JSON.stringify(statuses, null, 2));

  const btn = page.getByRole('button', { name: /Find Candidates|Aday Bul/i }).first();
  console.log('FIND-CANDIDATES BUTTON COUNT:', await btn.count());
  await page.screenshot({ path: `${SHOTS}/01-before-page-500.png`, fullPage: true });
});
