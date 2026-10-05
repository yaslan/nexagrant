import { createRequire } from 'node:module';
const S = '/private/tmp/claude-501/-Users-macbook-alan/e02033fe-cc89-4662-a995-e418fb05206a/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const b = await chromium.launch({ channel: 'chrome' });
for (const w of [320, 360, 472, 640, 768, 1024, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, storageState: `${S}/state-3406.json` }); const p = await ctx.newPage();
  await p.goto('http://localhost:3406/tr/admin/alerts', { waitUntil: 'load' }); await p.waitForTimeout(1000);
  const r = await p.evaluate(() => { const dl = document.querySelector('main dl'); const card = dl.parentElement.getBoundingClientRect(); const boxes = [...dl.children].map((c) => c.getBoundingClientRect()); const maxR = Math.max(...boxes.map((x) => x.right)); const m = document.querySelector('main'); return { kartSag: Math.round(card.right), kutuSag: Math.round(maxR), tasma: Math.round(maxR - (card.right - 1)), mainOver: m.scrollWidth - m.clientWidth, satir: new Set(boxes.map((x) => Math.round(x.top))).size }; });
  console.log(w, JSON.stringify(r)); await ctx.close();
}
await b.close();
