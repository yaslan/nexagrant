import { createRequire } from 'node:module';
const S = '/private/tmp/claude-501/-Users-macbook-alan/e02033fe-cc89-4662-a995-e418fb05206a/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 320, height: 800 }, storageState: `${S}/state-3406.json`, hasTouch: true });
const p = await ctx.newPage();
for (const [url, last, marker] of [
  ['/tr/fabrika-beta/opportunities/demo-opp-1/evaluations', 'ESR Kalibrasyonu', null],
  ['/tr/admin/cordis', 'Vector RAG Lab', null],
]) {
  await p.goto('http://localhost:3406' + url, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const tab = p.getByRole('button', { name: last });
  const strip = tab.locator('xpath=..');
  const before = await tab.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; });
  // keyboard: focus previous tab, press Tab to move onto the last one
  await tab.evaluate((el) => el.previousElementSibling.focus());
  await p.keyboard.press('Tab');
  await p.waitForTimeout(800);
  const focused = await p.evaluate(() => document.activeElement?.textContent?.trim());
  const after = await tab.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), sl: el.parentElement.scrollLeft, sw: el.parentElement.scrollWidth, cw: el.parentElement.clientWidth }; });
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  const pressedClass = await tab.getAttribute('class');
  const mainOver = await p.evaluate(() => { const m = document.querySelector('main'); return m.scrollWidth - m.clientWidth; });
  await p.screenshot({ path: `${S}/wt/docs/agent-results/TASK-MUNZ06XM2OIL2-fe-fb-evidence/kareler/sekme-klavye-320-${url.split('/').pop()}.png` });
  // scroll back and click first tab by real tap
  await strip.evaluate((el) => (el.scrollLeft = 0));
  const first = strip.locator('button').first(); await first.tap();
  const firstActive = /border-(blue|purple)-600/.test(await first.getAttribute('class'));
  console.log(JSON.stringify({ url, before, focused, after, lastActive: /border-(blue|purple)-600/.test(pressedClass), mainOver, firstActiveAfterTap: firstActive }));
}
await b.close();
