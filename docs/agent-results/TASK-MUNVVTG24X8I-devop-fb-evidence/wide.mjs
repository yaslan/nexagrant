import { createRequire } from 'node:module';
import fs from 'node:fs';
const S = '/private/tmp/claude-501/-Users-macbook-alan/1ff7f1b5-3a91-4a3c-a7ab-ffefb0291564/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const PAGES = [['dashboard','/tr/fabrika-beta/dashboard'],['opp-documents','/tr/fabrika-beta/opportunities/demo-opp-1/documents'],['admin-audit','/tr/admin/audit'],['home','/tr'],['portal','/tr/portal/partner/devopfb72-portal-token'],['blog-post','/tr/blog/horizon-europe-basarili-konsorsiyum-rehberi'],['settings-privacy','/tr/fabrika-beta/settings/privacy']];
const browser = await chromium.launch({ channel: 'chrome' });
const consent = () => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })); } catch {} };
for (const [label, port] of [['once', 3173], ['sonra', 3172]]) {
  fs.mkdirSync(`${S}/wide/${label}`, { recursive: true });
  for (const w of [768, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, storageState: `${S}/state.json`, reducedMotion: 'reduce' });
    await ctx.addInitScript(consent);
    const p = await ctx.newPage();
    for (const [n, path] of PAGES) {
      await p.goto(`http://localhost:${port}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
      await p.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} nextjs-portal{display:none!important}' });
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${S}/wide/${label}/${n}-${w}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
