import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
const B = 'http://localhost:3513'; const S = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome' });
for (const cb of ['https://evil.com/x', '//evil.com/x', '/\\evil.com/x', ' //evil.com/x', '/a/../..//evil.com', 'javascript:alert(document.domain)', '/tr/calls/topic/HORIZON-CL5-2026-D4-01']) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  const p = await ctx.newPage(); let dialog = null; const blocked = [];
  p.on('dialog', async d => { dialog = d.message(); await d.dismiss(); });
  await ctx.route(u => /(^|\.)evil\.com$/.test(u.hostname), r => { blocked.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>EVIL</h1>' }); });
  await p.goto(`${B}/tr/giris?callbackUrl=${encodeURIComponent(cb)}`, { timeout: 90000 }); await p.waitForLoadState('networkidle');
  await p.locator('input[type=email]').first().fill('alice@fabrika.test');
  await p.locator('input[type=password]').first().fill('demo1234');
  await p.locator('form button[type=submit]').first().click();
  await p.waitForURL(u => !u.pathname.endsWith('/giris'), { timeout: 60000 }).catch(() => {}); await p.waitForLoadState('networkidle').catch(() => {});
  console.log(JSON.stringify({ callbackUrl: cb, dialog, blockedEvilNav: blocked, finalUrl: p.url() }));
  await p.screenshot({ path: `${S}/ev/shots/06-dev-demo-${encodeURIComponent(cb).slice(0,40)}.png` });
  await ctx.close();
}
await browser.close();
