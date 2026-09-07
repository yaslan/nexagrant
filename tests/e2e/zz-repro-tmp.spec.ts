import { test, expect } from '@playwright/test';

const SHOTS = 'docs/agent-results/TASK-MTR4CH9IDK4D7-screenshots';
const URL = '/tr/main/opportunities/demo-opp-1/matching';

test('repro: M8 matching page + Find Candidates', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });

  await page.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }));
  });

  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(URL)}`);
  await page.locator('input[type="email"]').fill('alice@fabrika.test');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${URL}`, { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  console.log('URL AFTER LOGIN:', page.url());
  await page.screenshot({ path: `${SHOTS}/repro-01-page.png`, fullPage: true });
  console.log('BODY:', (await page.textContent('body'))?.slice(0, 1200));

  const btn = page.getByRole('button', { name: /Find Candidates|Aday Bul/i }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/repro-02-after-click.png`, fullPage: true });
    console.log('AFTER CLICK BODY:', (await page.textContent('body'))?.slice(0, 1200));
  } else {
    console.log('BUTTON NOT FOUND');
  }
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
});
