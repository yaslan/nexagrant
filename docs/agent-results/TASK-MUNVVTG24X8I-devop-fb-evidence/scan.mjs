import { createRequire } from 'node:module';
import fs from 'node:fs';
const S = '/private/tmp/claude-501/-Users-macbook-alan/1ff7f1b5-3a91-4a3c-a7ab-ffefb0291564/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const [port, label, widthsArg = '320'] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const routes = fs.readFileSync(`${S}/routes.txt`, 'utf8').split('\n').filter(Boolean);
const browser = await chromium.launch({ channel: 'chrome' });
const consent = () => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })); } catch {} };
const out = [];
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, storageState: `${S}/state.json` });
  await ctx.addInitScript(consent);
  const p = await ctx.newPage();
  for (const r of routes) {
    let st; try { st = (await p.goto(`http://localhost:${port}${r}`, { waitUntil: 'networkidle', timeout: 120000 }))?.status(); } catch (e) { st = 'ERR'; }
    await p.waitForTimeout(200);
    const m = await p.evaluate(() => {
      const iw = innerWidth; const main = document.querySelector('main');
      const mo = main ? main.scrollWidth - main.clientWidth : null;
      const cs = main && getComputedStyle(main);
      // widest overflowing descendant of main (who pushes it)
      let culprit = null;
      if (main && mo > 0) {
        const mr = main.getBoundingClientRect(); let best = 0;
        for (const el of main.querySelectorAll('*')) {
          const r = el.getBoundingClientRect(); const over = r.right - mr.right;
          let inner = false; for (let e = el.parentElement; e && e !== main; e = e.parentElement) { const ox = getComputedStyle(e).overflowX; if (ox !== 'visible') { inner = true; break; } }
          if (!inner && over > best + 0.5) { best = over; culprit = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)} (+${over.toFixed(0)})`; }
        }
      }
      return { iw, sw: document.documentElement.scrollWidth, mo, ox: cs?.overflowX, culprit };
    });
    out.push({ r, w, st, ...m });
    console.log(`${w} ${r} st=${st} sw=${m.sw}/${m.iw} mainOverX=${m.mo} ox=${m.ox}${m.culprit ? ' <- ' + m.culprit : ''}`);
  }
  await ctx.close();
}
fs.writeFileSync(`${S}/scan-${label}.json`, JSON.stringify(out));
await browser.close();
