import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
import fs from 'fs';
const S = process.argv[2]; const B = 'http://localhost:3512';
const ck = JSON.parse(fs.readFileSync(S + '/cookies.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const log = (o) => console.log(JSON.stringify(o));
const errors = [];
async function ctxFor(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  if (user) await ctx.addCookies([{ name: 'authjs.session-token', value: ck[user], url: B }]);
  return ctx;
}
const h1 = (p) => p.locator('h1').first().innerText().catch(() => null);
// 1) signed-out: click card -> login (callbackUrl = topic route) -> "sign in" -> detail in the member's workspace
for (const [loc, user] of [['tr', 'restr'], ['en', 'del']]) {
  const ctx = await ctxFor(null); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e)));
  await p.goto(`${B}/${loc}/calls`);
  const link = p.locator('a[href*="/calls/topic/"]').first(); const href = await link.getAttribute('href');
  await link.click(); await p.waitForLoadState('networkidle');
  log({ step: 'signed-out-click', loc, href, url: p.url().replace(B, ''), h1: await h1(p) });
  await p.screenshot({ path: `${S}/ev/shots/01-${loc}-signed-out-click-login.png` });
  const cb = new URL(p.url()).searchParams.get('callbackUrl');
  await ctx.addCookies([{ name: 'authjs.session-token', value: ck[user], url: B }]);
  const r = await p.goto(B + cb); await p.waitForLoadState('networkidle');
  log({ step: 'after-login', loc, user, callbackUrl: cb, url: p.url().replace(B, ''), status: r.status(), h1: await h1(p) });
  await p.screenshot({ path: `${S}/ev/shots/02-${loc}-${user}-after-login-detail.png` });
  await ctx.close();
}
// 2) signed-in: click card, add to pipeline
for (const [user, loc] of [['alice', 'tr'], ['owner', 'en'], ['restr', 'tr'], ['del', 'tr'], ['restr', 'en'], ['none', 'tr']]) {
  const ctx = await ctxFor(user); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(user + ': ' + String(e)));
  await p.goto(`${B}/${loc}/calls`);
  const link = p.locator('a[href*="/calls/topic/"]').nth(3);
  const href = await link.getAttribute('href'); await link.click(); await p.waitForLoadState('networkidle');
  log({ step: 'signed-in-click', user, loc, href, url: p.url().replace(B, ''), h1: await h1(p) });
  await p.screenshot({ path: `${S}/ev/shots/03-${user}-${loc}-detail.png` });
  if (user === 'none') { await ctx.close(); continue; }
  const btn = p.getByRole('button', { name: /Fırsat|Pipeline|Add|Ekle/i }).first();
  const btnText = await btn.innerText().catch(() => null);
  await btn.click(); await p.waitForURL(/firsatlar|pipeline/, { timeout: 20000 }).catch(() => {});
  await p.waitForLoadState('networkidle');
  log({ step: 'add-to-pipeline', user, loc, btnText, url: p.url().replace(B, ''), alert: await p.locator('[role=alert]').first().innerText().catch(() => null) });
  await p.screenshot({ path: `${S}/ev/shots/04-${user}-${loc}-after-add.png` });
  await ctx.close();
}
// 3) attack: restr on ws-b detail, server-action body rewritten to ws-a
{
  const ctx = await ctxFor('restr'); const p = await ctx.newPage(); p.on('pageerror', e => errors.push('attack: ' + String(e)));
  let rewrote = 0;
  await p.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() || '').includes('"ws-b"')) {
      rewrote++; return route.continue({ postData: req.postData().replaceAll('"ws-b"', '"ws-a"') });
    }
    return route.continue();
  });
  await p.goto(`${B}/tr/ws-b/cagrilar/HORIZON-CL6-2026-D3-01`); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /Fırsat|Ekle/i }).first().click();
  await p.locator('[role=alert]').first().waitFor({ timeout: 15000 }).catch(() => {});
  log({ step: 'attack-ws-a', rewrote, url: p.url().replace(B, ''), alert: await p.locator('[role=alert]').first().innerText().catch(() => null) });
  await p.screenshot({ path: `${S}/ev/shots/05-restr-tr-attack-ws-a-refused.png` });
  await ctx.close();
}
log({ pageerrors: errors });
await browser.close();
