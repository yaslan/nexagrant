// be-fb İNCELEME-96 bağımsız tarayıcı ölçümü
import { chromium } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import fs from 'node:fs';
const [port, label, widthsArg, routesFile] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const routes = fs.readFileSync(routesFile, 'utf8').split('\n').filter(Boolean);
const BASE = `http://localhost:${port}`;
const token = await encode({
  token: { sub: 'demo-user-superadmin', id: 'demo-user-superadmin', name: 'Yasin Aslan (Süperadmin)', email: 'admin@yasinaslan.com.tr', tenantId: 'demo-tenant', role: 'TENANT_OWNER' },
  secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token', maxAge: 3600,
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out: any[] = [];
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, url: BASE }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })); } catch {} });
  const p = await ctx.newPage();
  for (const r of routes) {
    let st: any;
    try { st = (await p.goto(BASE + r, { waitUntil: 'load', timeout: 90000 }))?.status(); await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); } catch { st = 'ERR'; }
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => {
      const main = document.querySelector('main');
      const hidden: string[] = [];
      // taşmayı gizleyen ata var mı (html/body/main zinciri)
      for (let e: Element | null = main; e; e = e.parentElement) {
        const ox = getComputedStyle(e).overflowX;
        if (ox === 'hidden' || ox === 'clip') hidden.push(`${e.tagName.toLowerCase()}:${ox}`);
      }
      const clipped: string[] = []; let innerScroll = 0;
      if (main) for (const el of main.querySelectorAll<HTMLElement>('*')) {
        const cs = getComputedStyle(el);
        if (el.scrollWidth - el.clientWidth <= 1 || el.clientWidth === 0) continue;
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') { innerScroll++; continue; }
        if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis' && !el.closest('[aria-hidden=true]')) {
          clipped.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} +${el.scrollWidth - el.clientWidth}`);
        }
      }
      return { iw: innerWidth, dsw: document.documentElement.scrollWidth, msw: main?.scrollWidth, mcw: main?.clientWidth, h: !!main?.querySelector('h1,h2'), hidden, clipped, innerScroll };
    });
    const mo = m.msw == null ? null : m.msw - m.mcw!;
    const d = m.dsw - m.iw;
    out.push({ w, r, st, mo, d, ...m });
    console.log(`${label} ${w} ${r} st=${st} main=${m.msw}/${m.mcw} over=${mo} doc=${m.dsw}/${m.iw} d=${d} h=${m.h} innerScroll=${m.innerScroll} clipped=${m.clipped.length}${m.hidden.length ? ' HIDDEN-ANCESTOR=' + m.hidden.join(',') : ''}${mo || d ? ' TASMA' : ''}`);
  }
  await ctx.close();
}
fs.writeFileSync(`${process.env.OUT}/scan-${label}.json`, JSON.stringify(out, null, 1));
await browser.close();
