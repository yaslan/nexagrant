import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
import fs from 'fs';
const S = process.argv[2]; const B = 'http://localhost:3512';
const ck = JSON.parse(fs.readFileSync(S + '/cookies.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const log = (o) => console.log(JSON.stringify(o));
for (const [user, from, to, loc] of [['restr', 'ws-b', 'ws-a', 'tr'], ['del', 'yeni', 'default', 'en'], ['owner', 'ws-b', 'nope', 'tr']]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: ck[user], url: B }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(String(e)));
  let sent = null, body = null;
  await p.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() || '').includes(`"${from}"`)) {
      sent = req.postData().replaceAll(`"${from}"`, `"${to}"`);
      const resp = await route.fetch({ postData: sent }); body = (await resp.text()).split('\n').filter(l => l.includes('success')).join(' | ');
      return route.fulfill({ response: resp });
    }
    return route.continue();
  });
  const seg = loc === 'tr' ? 'cagrilar' : 'calls';
  await p.goto(`${B}/${loc}/${from}/${seg}/HORIZON-CL2-2026-D1-01`); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /Fırsat|Ekle|Add/i }).first().click();
  const alert = p.locator('div[role=alert].rounded-xl');
  await alert.waitFor({ timeout: 15000 }).catch(() => {});
  log({ user, loc, page: from, actionSlugSent: to, actionResponse: body, url: p.url().replace(B, ''), alert: await alert.innerText().catch(() => null), pageerrors: errors });
  await p.screenshot({ path: `${S}/ev/shots/05-${user}-${loc}-action-slug-${to}-refused.png` });
  await ctx.close();
}
await browser.close();
