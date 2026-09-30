import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
import fs from 'fs';
const S = process.argv[2]; const B = 'http://localhost:3476';
const ck = JSON.parse(fs.readFileSync(S + '/cookies76.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const log = (o) => console.log(JSON.stringify(o));
async function ctxFor(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  if (user) await ctx.addCookies([{ name: 'authjs.session-token', value: ck[user], url: B }]);
  return ctx;
}
const errors = [];
// 1) signed-out click tr/en
for (const loc of ['tr', 'en']) {
  const ctx = await ctxFor(null); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e)));
  await p.goto(`${B}/${loc}/calls`); const cards = await p.locator('a[href*="callbackUrl"]').count();
  await p.locator('a[href*="callbackUrl"]').first().click(); await p.waitForLoadState('networkidle');
  log({ step: 'signed-out-click', loc, cards, url: p.url().replace(B, ''), h1: await p.locator('h1').first().innerText().catch(() => null) });
  await p.screenshot({ path: `${S}/shots76/01-${loc}-signed-out-click-login.png` });
  // simulate sign-in completing: add cookie then follow callbackUrl like AuthCard
  const cb = new URL(p.url()).searchParams.get('callbackUrl');
  await ctx.addCookies([{ name: 'authjs.session-token', value: ck.owner, url: B }]);
  const r = await p.goto(B + cb); await p.waitForLoadState('networkidle');
  log({ step: 'after-login', loc, url: p.url().replace(B, ''), status: r.status(), h1: await p.locator('h1').first().innerText() });
  await p.screenshot({ path: `${S}/shots76/02-${loc}-after-login-detail.png` });
  await ctx.close();
}
// 2) signed-in users: click card, add to pipeline
for (const [user, loc] of [['alice', 'tr'], ['owner', 'en'], ['restr', 'tr'], ['del', 'tr']]) {
  const ctx = await ctxFor(user); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(user + ': ' + String(e)));
  await p.goto(`${B}/${loc}/calls`);
  const link = p.locator(`a[href*="/${loc === 'tr' ? 'cagrilar' : 'calls'}/"]`).nth(3);
  const href = await link.getAttribute('href'); await link.click(); await p.waitForLoadState('networkidle');
  const h1 = await p.locator('h1').first().innerText();
  log({ step: 'signed-in-click', user, loc, href, url: p.url().replace(B, ''), h1 });
  await p.screenshot({ path: `${S}/shots76/03-${user}-${loc}-detail.png` });
  const btn = p.getByRole('button', { name: /Fırsat|Pipeline|Add|Ekle/i }).first();
  const btnText = await btn.innerText().catch(() => null);
  await btn.click(); await p.waitForURL(/firsatlar|opportunities|pipeline/, { timeout: 20000 }).catch(() => {});
  await p.waitForLoadState('networkidle');
  const alert = await p.locator('[role=alert]').first().innerText().catch(() => null);
  log({ step: 'add-to-pipeline', user, btnText, url: p.url().replace(B, ''), alert });
  await p.screenshot({ path: `${S}/shots76/04-${user}-${loc}-after-add.png` });
  await ctx.close();
}
log({ pageerrors: errors });
await browser.close();
