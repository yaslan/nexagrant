import { createRequire } from 'node:module';
const S = '/private/tmp/claude-501/-Users-macbook-alan/e02033fe-cc89-4662-a995-e418fb05206a/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const [port] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
for (const w of [320, 640, 768, 1024, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, storageState: `${S}/state-${port}.json` });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${port}/tr/fabrika-beta/opportunities/demo-opp-1/evaluations`, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const card = document.querySelector('[data-testid=m6-internal-badge]').closest('.rounded-2xl');
    const cr = card.getBoundingClientRect(); const bad = [];
    for (const el of card.querySelectorAll('*')) {
      if (el.classList.contains('blur-3xl') || el.closest('svg')) continue;
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      const pr = el.parentElement.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth) bad.push(`${el.tagName} "${(el.textContent||'').trim().slice(0,20)}" icerik>kutu +${el.scrollWidth-el.clientWidth}`);
      if (r.right > cr.right + 0.5 || r.right > pr.right + 0.5) bad.push(`${el.tagName} "${(el.textContent||'').trim().slice(0,20)}" +${Math.max(r.right-cr.right, r.right-pr.right).toFixed(0)}`);
    }
    return bad.slice(0, 5);
  });
  console.log(w, r.length ? 'KIRPILMA: ' + r.join(' | ') : 'baslik karti icinde tasan yok');
  await ctx.close();
}
await b.close();
