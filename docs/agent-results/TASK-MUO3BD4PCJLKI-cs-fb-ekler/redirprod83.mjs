import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
const B = 'http://localhost:3583';
const payloads = ['/tr/calls/topic/HORIZON-CL5-2026-D4-01', 'https://evil.com/x', '//evil.com/x', '/\\evil.com/x', 'javascript:alert(document.domain)', 'http://localhost:3583@evil.com/', ' //evil.com', '/a/../..//evil.com', '/%2F%2Fevil.com', '%2F%2Fevil.com', '/\t/evil.com'];
const browser = await chromium.launch({ channel: 'chrome' });
for (const cb of payloads) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  const p = await ctx.newPage(); let dialog = null; let google = null; const navs = [];
  p.on('dialog', async d => { dialog = d.message(); await d.dismiss(); });
  p.on('framenavigated', f => { if (f === p.mainFrame()) navs.push(f.url()); });
  await ctx.route(u => /(^|\.)(google\.com|evil\.com)$/.test(u.hostname), r => { if (/google/.test(r.request().url())) google = r.request().url(); navs.push('BLOCKED:' + r.request().url().slice(0, 80)); r.abort(); });
  await p.goto(`${B}/tr/giris?callbackUrl=${encodeURIComponent(cb)}`); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /Google/ }).first().click();
  await p.waitForTimeout(3000);
  const cookies = await ctx.cookies(B); const cbc = cookies.find(c => /callback-url/.test(c.name));
  console.log(JSON.stringify({ callbackUrl: cb, authjsCallbackCookie: cbc ? decodeURIComponent(cbc.value) : null, googleRedirectUri: google ? new URL(google).searchParams.get('redirect_uri') : null, dialog, finalUrl: p.url().slice(0, 100), navs: navs.slice(-2) }));
  await ctx.close();
}
await browser.close();
