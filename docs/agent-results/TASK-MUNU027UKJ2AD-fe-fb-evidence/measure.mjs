// Usage: node measure.mjs <label> <widths,comma> <routesFile> [shots=1]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/macbook/alan/FONBRIDGE/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3477';
const S = '/private/tmp/claude-501/-Users-macbook-alan/67ea8610-e078-4f3e-9ab0-b7a1f285a700/scratchpad';
const [label, widthsArg, routesFile, shotsArg = '1'] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const routes = fs.readFileSync(routesFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const outDir = `${S}/shots/${label}`;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const statePath = `${S}/state.json`;
const consent = () => {
  try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })); } catch {}
};

if (!fs.existsSync(statePath)) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(consent);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/tr/giris`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]:visible').first().fill('admin@yasinaslan.com.tr');
  await p.locator('input[type=email]:visible').first().press('Enter');
  await p.waitForURL((u) => !u.pathname.includes('giris') && !u.pathname.includes('login'), { timeout: 30000 });
  await ctx.storageState({ path: statePath });
  await ctx.close();
}

const measure = () => {
  const iw = window.innerWidth;
  const root = document.querySelector('main') || document.body;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const boxy = (el) => {
    const cs = getComputedStyle(el);
    const border = parseFloat(cs.borderLeftWidth) > 0 && cs.borderLeftStyle !== 'none' && !/rgba\(.*, 0\)/.test(cs.borderLeftColor);
    const bg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    return border || bg || cs.boxShadow !== 'none';
  };
  // first "card": first boxy visible descendant of root at least half the viewport wide,
  // not position:fixed (widgets), not inside header/nav/footer
  let card = null;
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('header,nav,footer,[role=dialog],[role=alertdialog]')) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') continue;
    if (!vis(el) || !boxy(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < iw * 0.5 || r.top > window.innerHeight * 3) continue;
    if (el === root) continue;
    card = el; break;
  }
  const r = card?.getBoundingClientRect();
  // text edge: min left of visible text among non-fixed content
  let textLeft = Infinity;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; let count = 0;
  while ((n = walker.nextNode()) && count < 4000) {
    count++;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('[role=dialog],[role=alertdialog]')) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rr = range.getBoundingClientRect();
    if (rr.width > 0 && rr.height > 0 && rr.top < window.innerHeight * 3) textLeft = Math.min(textLeft, rr.left);
  }
  // padding chain from root to card
  const chain = [];
  if (card) {
    for (let e = card; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const pl = parseFloat(cs.paddingLeft); const pr = parseFloat(cs.paddingRight);
      const ml = parseFloat(cs.marginLeft);
      if (pl || pr) chain.push(`${e.tagName.toLowerCase()}.${(e.getAttribute('class') || '').split(' ').slice(0, 6).join('.')} pl=${pl} pr=${pr}${ml ? ' ml=' + ml : ''}`);
      if (e === document.body) break;
    }
  }
  return {
    iw,
    sw: document.documentElement.scrollWidth,
    cardLeft: r ? Math.round(r.left * 10) / 10 : null,
    cardRight: r ? Math.round((iw - r.right) * 10) / 10 : null,
    card: card ? `${card.tagName.toLowerCase()}.${(card.getAttribute('class') || '').split(' ').slice(0, 5).join('.')}` : null,
    textLeft: textLeft === Infinity ? null : Math.round(textLeft * 10) / 10,
    chain,
  };
};

const results = [];
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, storageState: statePath, deviceScaleFactor: 1 });
  await ctx.addInitScript(consent);
  const page = await ctx.newPage();
  for (const route of routes) {
    const [name, path] = route.split(/\s+/);
    let res;
    try {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      res = { status: resp?.status(), url: new URL(page.url()).pathname, ...(await page.evaluate(measure)) };
      if (shotsArg === '1') await page.screenshot({ path: `${outDir}/${name}-${w}.png` });
    } catch (e) {
      res = { error: String(e).slice(0, 160) };
    }
    results.push({ name, path, w, ...res });
    const ok = res.sw === res.iw ? '' : ' OVERFLOW';
    console.log(`${w} ${name} st=${res.status} card=${res.cardLeft}/${res.cardRight} text=${res.textLeft} sw=${res.sw}${ok}${res.error ? ' ERR ' + res.error : ''}`);
  }
  await ctx.close();
}
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
