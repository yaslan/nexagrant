import { createRequire } from 'node:module';
import fs from 'node:fs';
const S = '/private/tmp/claude-501/-Users-macbook-alan/e02033fe-cc89-4662-a995-e418fb05206a/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const [port, label] = process.argv.slice(2);
const routes = fs.readFileSync(`${S}/routes-px.txt`, 'utf8').split('\n').filter(Boolean);
const browser = await chromium.launch({ channel: 'chrome' });
const consent = () => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })); } catch {} };
fs.mkdirSync(`${S}/px/${label}`, { recursive: true });
for (const w of [768, 1280]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, storageState: `${S}/state-${port}.json`, reducedMotion: 'reduce' });
  await ctx.addInitScript(consent);
  const p = await ctx.newPage();
  for (const r of routes) {
    await p.goto(`http://localhost:${port}${r}`, { waitUntil: 'load', timeout: 120000 }); await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await p.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${S}/px/${label}/${w}-${r.split('/').filter(Boolean).slice(-2).join('_')}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
