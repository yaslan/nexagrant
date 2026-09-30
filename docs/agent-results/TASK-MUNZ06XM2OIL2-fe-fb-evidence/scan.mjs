import { createRequire } from 'node:module';
import fs from 'node:fs';
const S = '/private/tmp/claude-501/-Users-macbook-alan/e02033fe-cc89-4662-a995-e418fb05206a/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const [port, label, widthsArg = '320', routesFile = 'routes7.txt', shots = ''] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const routes = fs.readFileSync(`${S}/${routesFile}`, 'utf8').split('\n').filter(Boolean);
const BASE = `http://localhost:${port}`;
const browser = await chromium.launch({ channel: 'chrome' });
const consent = () => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })); } catch {} };
const statePath = `${S}/state-${port}.json`;
if (!fs.existsSync(statePath)) {
  const ctx = await browser.newContext(); await ctx.addInitScript(consent);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/tr/giris`, { waitUntil: 'load', timeout: 120000 });
  await p.locator('input[type=email]:visible').first().fill('admin@yasinaslan.com.tr');
  await p.locator('input[type=email]:visible').first().press('Enter');
  await p.waitForURL((u) => !u.pathname.includes('giris'), { timeout: 60000 });
  await ctx.storageState({ path: statePath }); await ctx.close();
}
fs.mkdirSync(`${S}/shots`, { recursive: true });
const out = [];
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, storageState: statePath });
  await ctx.addInitScript(consent);
  const p = await ctx.newPage();
  for (const r of routes) {
    let st; try { st = (await p.goto(BASE + r, { waitUntil: 'load', timeout: 120000 }))?.status(); await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); } catch { st = 'ERR'; }
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const iw = innerWidth; const main = document.querySelector('main');
      const mo = main ? main.scrollWidth - main.clientWidth : null;
      const culprits = [];
      if (main && mo > 0) {
        const mr = main.getBoundingClientRect();
        for (const el of main.querySelectorAll('*')) {
          const rr = el.getBoundingClientRect(); const over = rr.right - mr.right;
          if (over <= 0.5) continue;
          let inner = false; for (let e = el.parentElement; e && e !== main; e = e.parentElement) { if (getComputedStyle(e).overflowX !== 'visible') { inner = true; break; } }
          if (inner) continue;
          // only report outermost: skip if a parent also overflows by >= same amount
          const par = el.parentElement; const pr = par.getBoundingClientRect();
          if (par !== main && pr.right - mr.right >= over - 0.5) continue;
          culprits.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} w=${rr.width.toFixed(0)} +${over.toFixed(0)} "${(el.textContent||'').trim().slice(0,30)}"`);
        }
      }
      return { iw, sw: document.documentElement.scrollWidth, mw: main?.clientWidth, msw: main?.scrollWidth, mo, culprits: culprits.slice(0, 6) };
    });
    out.push({ r, w, st, ...m });
    console.log(`${w} ${r} st=${st} doc=${m.sw}/${m.iw} main.scrollWidth=${m.msw} main.clientWidth=${m.mw} over=${m.mo}${m.mo === null ? ' (main yok)' : m.mo === 0 ? ' OK' : ' TASMA'}`);
    for (const c of m.culprits) console.log('    <- ' + c);
    if (shots) { await p.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollLeft = m.scrollWidth; }); await p.screenshot({ path: `${S}/shots/${label}-${w}-${r.split('/').filter(Boolean).slice(-1)[0]}.png` }); }
  }
  await ctx.close();
}
fs.writeFileSync(`${S}/scan-${label}.json`, JSON.stringify(out, null, 1));
await browser.close();
