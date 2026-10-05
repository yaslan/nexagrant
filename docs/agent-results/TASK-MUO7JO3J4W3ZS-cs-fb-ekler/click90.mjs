import { chromium } from '@playwright/test';
import fs from 'fs';
const S = process.argv[2]; const B = 'http://localhost:3590';
const ck = JSON.parse(fs.readFileSync(S + '/cookies.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const log = (o) => { const l = JSON.stringify(o); console.log(l); };
const CASES = [
  ['gerçek tıklama (değiştirilmemiş)', null],
  ['NUL ws-a\\u0000', (a) => { a.workspaceSlug = 'ws-a\u0000'; }],
  ['nesne {foo:1}', (a) => { a.workspaceSlug = { foo: 1 }; }],
  ['dizi ["ws-a"]', (a) => { a.workspaceSlug = ['ws-a']; }],
  ['sayı 7', (a) => { a.workspaceSlug = 7; }],
  ['çok uzun 64', (a) => { a.workspaceSlug = 'a'.repeat(64); }],
  ['tam genişlik ｗｓ-ｂ', (a) => { a.workspaceSlug = 'ｗｓ-ｂ'; }],
  ['__proto__', (a) => { a.workspaceSlug = '__proto__'; }],
  ['boş ""', (a) => { a.workspaceSlug = ''; }],
  ['ws-a (üyelik dışı)', (a) => { a.workspaceSlug = 'ws-a'; }],
];
let n = 0;
for (const [label, mut] of CASES) {
  n++;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: ck.restr, url: B }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, ts: Date.now() })); } catch {} });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  let body = null;
  await p.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() || '').includes('workspaceSlug')) {
      const args = JSON.parse(req.postData()); args[0].title = `CSFB90-C${n} ${args[0].title}`; if (mut) mut(args[0]);
      const resp = await route.fetch({ postData: JSON.stringify(args) });
      body = (await resp.text()).split('\n').filter((l) => l.includes('success')).join(' | ').slice(0, 140);
      return route.fulfill({ response: resp });
    }
    return route.continue();
  });
  await p.goto(`${B}/tr/ws-b/cagrilar/HORIZON-CL2-2026-D1-01`); await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: /Fırsat|Ekle/i }).first().click();
  await p.waitForTimeout(2500);
  const alert = (await p.locator('div[role=alert]').allInnerTexts().catch(() => [])).filter(Boolean).join(' / ').slice(0, 100);
  log({ n, label, actionResponse: body, url: p.url().replace(B, ''), alert, pageerrors: errors.length });
  await p.screenshot({ path: `${S}/shots/c${String(n).padStart(2, '0')}.png` });
  await ctx.close();
}
// O-1 Chrome gezintisi
for (const [u, path] of [['t8u', '/tr/calls/topic/HORIZON-CL2-2026-D1-01'], ['t8u', '/en/default/calls/HORIZON-CL2-2026-D1-01'], ['t9u', '/tr/default/cagrilar/HORIZON-CL2-2026-D1-01'], ['owner', '/tr/%E2%84%AAalite/cagrilar/HORIZON-CL2-2026-D1-01']]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: ck[u], url: B }]);
  const p = await ctx.newPage(); let err = null, status = null;
  try { const r = await p.goto(B + path); status = r?.status(); } catch (e) { err = String(e).slice(0, 80); }
  log({ nav: u, path, status, final: p.url().replace(B, ''), err });
  await p.screenshot({ path: `${S}/shots/nav-${u}-${path.split('/')[2].slice(0, 12).replace(/%/g, '')}.png` });
  await ctx.close();
}
await browser.close();
