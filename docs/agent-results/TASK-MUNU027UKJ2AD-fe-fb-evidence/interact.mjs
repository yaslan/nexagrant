// Real clicks at phone width: mobile drawer, feedback sheet, pilot banner, a table page.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/macbook/alan/FONBRIDGE/package.json');
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3477';
const S = '/private/tmp/claude-501/-Users-macbook-alan/67ea8610-e078-4f3e-9ab0-b7a1f285a700/scratchpad';
const out = `${S}/shots/interact`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const log = (...a) => console.log(...a);
for (const w of [360, 472]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, storageState: `${S}/state.json` });
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })); } catch {} });
  const p = await ctx.newPage();
  const sw = () => p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);

  await p.goto(`${BASE}/tr/fabrika-beta/dashboard`, { waitUntil: 'load' });
  await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const banner = p.locator('[role=status]').filter({ hasText: /pilot/i }).first();
  const bb = await banner.boundingBox().catch(() => null);
  log(w, 'pilot-banner', bb ? `x=${bb.x} w=${bb.width}` : 'not shown', 'sw', await sw());
  await p.screenshot({ path: `${out}/dashboard-banner-${w}.png` });

  await p.getByLabel('Open Mobile Menu').click();
  await p.getByLabel('Close Mobile Menu').waitFor();
  log(w, 'drawer open', 'sw', await sw());
  await p.screenshot({ path: `${out}/drawer-${w}.png` });
  await p.getByLabel('Close Mobile Menu').click();
  await p.getByLabel('Close Mobile Menu').waitFor({ state: 'detached' });

  const fb = p.locator('button.fixed.bottom-5.right-5');
  await fb.click();
  const dlg = p.locator('[aria-labelledby="feedback-dialog-title"]');
  await dlg.waitFor();
  const db = await dlg.boundingBox();
  log(w, 'feedback sheet', `x=${db.x} w=${db.width}`, 'sw', await sw());
  await p.screenshot({ path: `${out}/feedback-${w}.png` });
  await p.keyboard.press('Escape');

  await p.goto(`${BASE}/tr/admin/tenants`, { waitUntil: 'load' });
  await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const t = await p.evaluate(() => {
    const tb = document.querySelector('main table');
    if (!tb) return 'no table';
    const r = tb.getBoundingClientRect();
    let sc = tb.parentElement; while (sc && getComputedStyle(sc).overflowX === 'visible') sc = sc.parentElement;
    const sr = sc?.getBoundingClientRect();
    return `table w=${Math.round(r.width)} scroller=${sc?.tagName}.${(sc?.className || '').toString().slice(0, 40)} left=${sr && Math.round(sr.left)} right=${sr && Math.round(innerWidth - sr.right)}`;
  });
  log(w, 'admin/tenants', t, 'sw', await sw());
  await p.screenshot({ path: `${out}/admin-tenants-${w}.png` });
  await ctx.close();
}
await browser.close();
