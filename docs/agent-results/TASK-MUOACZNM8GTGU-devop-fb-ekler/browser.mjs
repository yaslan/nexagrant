import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: process.env.CHR });
const out = [];
for (const p of process.env.PATHS.split(',')) {
  const page = await b.newPage();
  let v = 0;
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) v++; });
  const res = await page.goto('http://127.0.0.1:' + process.env.PORT + p, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<img src="/nope-x" onerror="window.pwned=1">'));
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ pwned: window.pwned === 1, nextRan: Array.isArray(window.__next_f) && typeof window.next !== 'undefined', text: document.body.innerText.slice(0, 40).replace(/\s+/g, ' ') }));
  await page.screenshot({ path: process.env.SHOTS + '/' + p.replace(/[^a-z0-9]/gi, '_') + '.png' });
  out.push({ path: p, status: res.status(), csp: res.headers()['content-security-policy']?.slice(0, 30) ?? null, ...r, cspViolations: v });
  await page.close();
}
for (const o of out) console.log(JSON.stringify(o));
await b.close();
