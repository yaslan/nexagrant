// tests/e2e/mobile-main-overflow.spec.ts adımlarını BİREBİR tekrarlar; ROUTES/WIDTHS/ADMIN_EMAIL spec dosyasından okunur (sapma olmasın).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [port, specPath] = process.argv.slice(2);
const src = fs.readFileSync(specPath, 'utf8').replace(/^\s*\/\/.*$/gm, '');
const ROUTES = [...src.match(/const ROUTES = \[([\s\S]*?)\];/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const WIDTHS = JSON.parse(src.match(/const WIDTHS = (\[[^\]]*\])/)![1]);
const ADMIN_EMAIL = src.match(/const ADMIN_EMAIL = '([^']+)'/)![1];
const BASE = `http://localhost:${port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx0 = await browser.newContext({ baseURL: BASE });
const page0 = await ctx0.newPage();
await page0.addInitScript(() => { window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })); });
await page0.goto('/tr/giris?callbackUrl=%2Ftr%2Fadmin%2Falerts', { timeout: 180000 });
const emails = await page0.locator('input[type="email"]').count();
const submits = await page0.locator('form button[type="submit"]').count();
console.log(`login-page: input[type=email] count=${emails}, form button[type=submit] count=${submits} (strict locator needs 1)`);
await page0.locator('input[type="email"]').fill(ADMIN_EMAIL);
await page0.locator('form button[type="submit"]').click();
await page0.waitForURL('**/tr/admin/alerts', { timeout: 60000 });
const storageState = await ctx0.storageState(); await ctx0.close();
let pass = 0, fail = 0;
for (const route of ROUTES) {
  const ctx = await browser.newContext({ baseURL: BASE, storageState, viewport: { width: 320, height: 800 } });
  const page = await ctx.newPage();
  const res = await page.goto(route, { timeout: 180000 });
  const errs: string[] = []; const overs: string[] = [];
  if (res?.status() !== 200) errs.push(`status=${res?.status()}`);
  try { await page.locator('main').locator('h1, h2').first().waitFor({ state: 'visible', timeout: 30000 }); } catch { errs.push('no heading'); }
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(200);
    const over = await page.locator('main').evaluate((el) => el.scrollWidth - el.clientWidth);
    overs.push(`${width}:${over}`);
    if (over !== 0) errs.push(`${width}px over=${over}`);
  }
  if (errs.length) { fail++; console.log(`✘ ${route} ${overs.join(' ')} — ${errs[0]}`); } else { pass++; console.log(`✓ ${route} ${overs.join(' ')}`); }
  await ctx.close();
}
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
