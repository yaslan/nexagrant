import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: process.env.CHR });
const out = [];
for (const p of (process.env.PATHS||'').split(',')) {
  const page = await b.newPage();
  const violations = [];
  page.on('console', (m) => { if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violations.push(m.text().slice(0, 90)); });
  const res = await page.goto('http://127.0.0.1:3606' + p, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent ?? null,
    hydrated: typeof window.__next_f !== 'undefined' && Array.isArray(window.__next_f),
    // parser-inserted inline handler — what a reflected payload would be
    injected: (() => { document.body.insertAdjacentHTML('beforeend', '<img src="/nope-x" onerror="window.pwned=1">'); return true; })(),
  }));
  await page.waitForTimeout(500);
  const pwned = await page.evaluate(() => window.pwned === 1);
  const name = p.replace(/[^a-z0-9]/gi, '_');
  await page.screenshot({ path: `../shots/${name}.png` });
  out.push({ path: p, status: res.status(), h1: r.h1, nextScriptsRan: r.hydrated, pwned, cspViolations: violations.length, firstViolation: violations[0] ?? '' });
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await b.close();
