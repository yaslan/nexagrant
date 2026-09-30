import { createRequire } from 'node:module';
const S = '/private/tmp/claude-501/-Users-macbook-alan/1ff7f1b5-3a91-4a3c-a7ab-ffefb0291564/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const b = await chromium.launch({ channel: 'chrome' });
for (const w of [320, 472]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })));
  const p = await ctx.newPage();
  await p.goto('http://localhost:3172/tr/giris', { waitUntil: 'networkidle' });
  await p.locator('input[type=email]:visible').first().fill('yok-boyle-biri@ornek.com');
  await p.locator('input[type=password]:visible').first().fill('yanlis-sifre-123');
  await p.locator('input[type=password]:visible').first().press('Enter');
  const al = p.locator('[role=alert]:visible, .text-red-600:visible, .text-red-700:visible').first();
  await al.waitFor({ timeout: 20000 }).catch(() => {});
  const r = await al.boundingBox().catch(() => null);
  const txt = await al.textContent().catch(() => null);
  await al.scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${S}/shots/sonra/giris-sunucu-hata-${w}.png` });
  console.log(w, 'alert', r && { L: r.x, R: w - r.x - r.width }, (txt || '').trim().slice(0, 80), 'sw', await p.evaluate(() => document.documentElement.scrollWidth));
  await ctx.close();
}
await b.close();
