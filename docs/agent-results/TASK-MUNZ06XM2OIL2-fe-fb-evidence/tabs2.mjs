import { createRequire } from 'node:module';
const S = '/private/tmp/claude-501/-Users-macbook-alan/e02033fe-cc89-4662-a995-e418fb05206a/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 320, height: 800 }, storageState: `${S}/state-3406.json` });
const p = await ctx.newPage();
for (const port of [3406]) for (const [url, firstName] of [['/tr/admin/cordis', 'K2 Ingestion'], ['/tr/fabrika-beta/opportunities/demo-opp-1/evaluations', 'Değerlendirmeler']]) {
  await p.goto(`http://localhost:${port}${url}`, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const first = p.getByRole('button', { name: firstName }); await first.focus();
  for (let i = 0; i < 4; i++) {
    const info = await p.evaluate(() => { const el = document.activeElement; const r = el.getBoundingClientRect(); const s = el.parentElement; return `${el.textContent.trim().slice(0,22)} l=${Math.round(r.left)} r=${Math.round(r.right)} stripSL=${s.scrollLeft} mainSL=${document.querySelector('main').scrollLeft} tamGorunur=${r.left >= 0 && r.right <= innerWidth}`; });
    console.log(url.split('/').pop(), info);
    await p.keyboard.press('Tab'); await p.waitForTimeout(600);
  }
}
await b.close();
