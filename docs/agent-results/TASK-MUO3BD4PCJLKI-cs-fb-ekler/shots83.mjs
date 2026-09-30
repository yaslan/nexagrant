import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
import fs from 'fs';
const S = process.argv[2]; const B = 'http://localhost:3583'; const ID = 'HORIZON-CL5-2026-D4-01';
const ck = JSON.parse(fs.readFileSync(S + '/cookies.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const log = (o) => console.log(JSON.stringify(o));
async function ctxFor(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (user) await ctx.addCookies([{ name: 'authjs.session-token', value: ck[user], url: B }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  return ctx;
}
for (const loc of ['tr', 'en']) {
  // 1. girişsiz: /calls → kart tıkla → giriş sayfası
  { const ctx = await ctxFor(null); const p = await ctx.newPage();
    await p.goto(`${B}/${loc}/calls`); await p.waitForLoadState('networkidle');
    const link = p.locator('a[href*="/calls/topic/"]').first(); const href = await link.getAttribute('href');
    await link.click(); await p.waitForURL(/giris|login/, { timeout: 15000 }).catch(() => {});
    log({ step: 'signed-out-card', loc, href, url: decodeURIComponent(p.url().replace(B, '')) });
    await p.screenshot({ path: `${S}/shots/01-${loc}-anon-card-to-login.png` }); await ctx.close(); }
  // 2. kısıtlı üye: kart → ws-b detay
  { const ctx = await ctxFor('restr'); const p = await ctx.newPage();
    await p.goto(`${B}/${loc}/calls`); await p.waitForLoadState('networkidle');
    await p.locator('a[href*="/calls/topic/"]').first().click(); await p.waitForURL(/ws-b/, { timeout: 15000 }).catch(() => {});
    await p.waitForLoadState('networkidle');
    log({ step: 'restr-card', loc, url: p.url().replace(B, '') });
    await p.screenshot({ path: `${S}/shots/02-${loc}-restr-card-to-ws-b.png` }); await ctx.close(); }
  // 3. alansız: /no-workspace
  { const ctx = await ctxFor('t5u'); const p = await ctx.newPage();
    await p.goto(`${B}/${loc}/calls/topic/${ID}`); await p.waitForLoadState('networkidle');
    log({ step: 't5u-topic', loc, url: p.url().replace(B, '') });
    await p.screenshot({ path: `${S}/shots/03-${loc}-t5u-no-workspace.png` }); await ctx.close(); }
  // 4. ASCII dışı slug → döngü
  { const ctx = await ctxFor('t8u'); const p = await ctx.newPage(); let err = null;
    await p.goto(`${B}/${loc}/calls/topic/${ID}`).catch(e => { err = String(e).split('\n')[0]; });
    log({ step: 't8u-topic-loop', loc, err });
    await p.screenshot({ path: `${S}/shots/04-${loc}-t8u-redirect-loop.png` }).catch(() => {}); await ctx.close(); }
  // 5. sahip ws-a panosu: tampondaki sahte kartlar
  { const ctx = await ctxFor('owner'); const p = await ctx.newPage();
    await p.goto(`${B}/${loc}/ws-a/${loc === 'tr' ? 'firsatlar' : 'pipeline'}`); await p.waitForLoadState('networkidle');
    const cards = await p.locator('text=/CSFB83-[0-9N]/').allInnerTexts();
    log({ step: 'owner-ws-a-board', loc, cardsWithMarker: cards.map(c => c.slice(0, 40)) });
    const first = p.locator('text=/CSFB83-5/').first(); await first.scrollIntoViewIfNeeded().catch(() => {});
    await p.screenshot({ path: `${S}/shots/06-${loc}-owner-ws-a-board-buffer-cards.png` }); await ctx.close(); }
}
await browser.close();
