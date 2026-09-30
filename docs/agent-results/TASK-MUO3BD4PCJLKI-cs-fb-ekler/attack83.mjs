import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
import fs from 'fs';
const S = process.argv[2]; const B = 'http://localhost:3583';
const ck = JSON.parse(fs.readFileSync(S + '/cookies.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const log = (o) => console.log(JSON.stringify(o));
// [user, page slug, locale, label, payload-mutator]
const ALL = [
  ['restr', 'ws-b', 'tr', 'ws-a (üyelik dışı)', (a) => { a.workspaceSlug = 'ws-a'; }],
  ['restr', 'ws-b', 'en', 'ws-c (silinmiş)', (a) => { a.workspaceSlug = 'ws-c'; }],
  ['restr', 'ws-b', 'tr', 'WS-B (büyük harf)', (a) => { a.workspaceSlug = 'WS-B'; }],
  ['restr', 'ws-b', 'tr', '"" (boş → en eski izinli)', (a) => { a.workspaceSlug = ''; }],
  ['restr', 'ws-b', 'tr', 'NUL: ws-a\\u0000', (a) => { a.workspaceSlug = 'ws-a\u0000'; }],
  ['restr', 'ws-b', 'en', 'nesne {contains:"ws"}', (a) => { a.workspaceSlug = { contains: 'ws' }; }],
  ['restr', 'ws-b', 'tr', 'nesne {foo:1} (geçersiz filtre)', (a) => { a.workspaceSlug = { foo: 1 }; }],
  ['restr', 'ws-b', 'tr', 'dizi ["ws-a"]', (a) => { a.workspaceSlug = ['ws-a']; }],
  ['restr', 'ws-b', 'tr', 'sayı 7', (a) => { a.workspaceSlug = 7; }],
  ['restr', 'ws-b', 'tr', 'ek alan workspaceId/tenantId', (a) => { a.workspaceId = 'o83-ws-a'; a.tenantId = 'o83-t3'; }],
  ['del', 'yeni', 'en', 'default (silinmiş default) → yeni', (a) => { a.workspaceSlug = 'default'; }],
  ['t7u', 'eski', 'tr', 'default (gerçek default alanı)', (a) => { a.workspaceSlug = 'default'; }],
];
const only = (process.argv[3]||'').split(',').filter(Boolean).map(Number);
const cases = ALL.map((c,i)=>[...c,i+1]).filter(c=>!only.length||only.includes(c[5]));
let n = 0;
for (const [user, from, loc, label, mut, idx] of cases) {
  n = idx;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: ck[user], url: B }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(String(e)));
  let sent = null, body = null, raw = null;
  const marker = `CSFB83-${n}`;
  await p.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() || '').includes('workspaceSlug')) {
      raw = req.postData(); fs.writeFileSync(S + '/action-hdr.json', JSON.stringify({ headers: req.headers(), url: req.url(), raw }));
      try { const args = JSON.parse(raw); mut(args[0]); args[0].title = `${marker} ${args[0].title}`; sent = JSON.stringify(args); }
      catch (e) { sent = raw; }
      const resp = await route.fetch({ postData: sent }); body = (await resp.text()).split('\n').filter(l => l.includes('success')).join(' | ').slice(0, 260);
      return route.fulfill({ response: resp });
    }
    return route.continue();
  });
  const seg = loc === 'tr' ? 'cagrilar' : 'calls';
  await p.goto(`${B}/${loc}/${from}/${seg}/HORIZON-CL2-2026-D1-01`); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /Fırsat|Ekle|Add/i }).first().click();
  await p.waitForTimeout(2500);
  const alert = await p.locator('div[role=alert]').allInnerTexts().catch(() => []);
  log({ n, user, loc, label, sent: sent && sent.replace(/"title":"[^"]*"/, '"title":"…"').slice(0, 200), actionResponse: body, url: p.url().replace(B, ''), alert: alert.filter(Boolean).join(' / ').slice(0, 120), pageerrors: errors });
  await p.screenshot({ path: `${S}/shots/05-${String(n).padStart(2, '0')}-${user}-${loc}.png` });
  await ctx.close();
}
await browser.close();
