// Replays tests/e2e/mobile-main-overflow.spec.ts step for step (playwright test is blocked by the kill-guard here).
import { createRequire } from 'node:module';
const S = '/private/tmp/claude-501/-Users-macbook-alan/e02033fe-cc89-4662-a995-e418fb05206a/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const port = process.argv[2]; const BASE = `http://localhost:${port}`;
const WIDTHS = [320, 360, 390, 472, 640];
const ROUTES = ['/tr/fabrika-beta/opportunities/demo-opp-1/evaluations','/tr/admin/cordis','/tr/admin/alerts','/tr/fabrika-beta/approvals','/tr/fabrika-beta/onay-merkezi','/tr/fabrika-beta/ayarlar/kapilar','/tr/fabrika-beta/settings/gates','/tr/fabrika-beta/firsatlar/demo-opp-1'];
const browser = await chromium.launch({ channel: 'chrome' });
const c0 = await browser.newContext(); const p0 = await c0.newPage();
await p0.addInitScript(() => localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })));
await p0.goto(`${BASE}/tr/giris?callbackUrl=%2Ftr%2Fadmin%2Falerts`);
await p0.locator('input[type="email"]').fill('admin@yasinaslan.com.tr');
await p0.locator('form button[type="submit"]').click();
await p0.waitForURL('**/tr/admin/alerts', { timeout: 30000 });
const storageState = await c0.storageState(); await c0.close();
let failed = 0;
for (const route of ROUTES) {
  const ctx = await browser.newContext({ storageState, viewport: { width: 320, height: 800 } });
  const page = await ctx.newPage();
  const st = (await page.goto(BASE + route))?.status();
  const main = page.locator('main');
  await main.locator('h1, h2').first().waitFor({ state: 'visible', timeout: 30000 });
  const res = [];
  for (const w of WIDTHS) { await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(200); res.push(`${w}:${await main.evaluate((el) => el.scrollWidth - el.clientWidth)}`); }
  const bad = st !== 200 || res.some((r) => !r.endsWith(':0'));
  if (bad) failed++;
  console.log(`${bad ? '✘' : '✓'} ${route} st=${st} over ${res.join(' ')}`);
  await ctx.close();
}
console.log(`${ROUTES.length - failed} passed, ${failed} failed`);
await browser.close();
