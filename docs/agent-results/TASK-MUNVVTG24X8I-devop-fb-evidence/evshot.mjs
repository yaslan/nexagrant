import { createRequire } from 'node:module';
const S = '/private/tmp/claude-501/-Users-macbook-alan/1ff7f1b5-3a91-4a3c-a7ab-ffefb0291564/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const b = await chromium.launch({ channel: 'chrome' });
for (const [lbl, port] of [['once', 3173], ['sonra', 3172]]) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, storageState: `${S}/state.json` });
  await ctx.addInitScript(() => localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })));
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${port}/tr/fabrika-beta/opportunities/demo-opp-1/evaluations`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: `${S}/shots/evaluations-360-${lbl}.png` });
  await p.evaluate(() => { const m = document.querySelector('main'); m.scrollLeft = 9999; });
  await p.waitForTimeout(300);
  console.log(lbl, await p.evaluate(() => { const m = document.querySelector('main'); return { scrollLeft: m.scrollLeft, sw: m.scrollWidth, cw: m.clientWidth, docSw: document.documentElement.scrollWidth }; }));
  await p.screenshot({ path: `${S}/shots/evaluations-360-${lbl}-kaydirilmis.png` });
  await ctx.close();
}
await b.close();
