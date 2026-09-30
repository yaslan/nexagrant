// be-fb İNCELEME-96: veri dolu durum + kırpılma (overflow-hidden ile GİZLEME) denetimi
import { chromium } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import fs from 'node:fs';
const [port, label, widthsArg, routesFile] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const routes = fs.readFileSync(routesFile, 'utf8').split('\n').filter(Boolean);
const BASE = `http://localhost:${port}`;
const token = await encode({ token: { sub: 'demo-user-superadmin', id: 'demo-user-superadmin', name: 'Yasin Aslan (Süperadmin)', email: 'admin@yasinaslan.com.tr', tenantId: 'demo-tenant', role: 'TENANT_OWNER' }, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out: any[] = [];
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, url: BASE }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })); } catch {} });
  const p = await ctx.newPage();
  for (const r of routes) {
    const st = (await p.goto(BASE + r, { waitUntil: 'load', timeout: 90000 }))?.status();
    await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => {
      const main = document.querySelector('main')!;
      const mr = main.getBoundingClientRect();
      const clipped: string[] = [], unreachable: string[] = [];
      let innerScrollers = 0;
      for (const el of main.querySelectorAll<HTMLElement>('*')) {
        const cs = getComputedStyle(el);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) innerScrollers++;
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!hasText || el.closest('[aria-hidden=true],.sr-only')) continue;
        const rr = el.getBoundingClientRect(); if (!rr.width) continue;
        let ok = false;
        for (let a = el.parentElement; a && a !== main; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.overflowX === 'auto' || acs.overflowX === 'scroll') { ok = true; break; }
          if (acs.overflowX === 'hidden' || acs.overflowX === 'clip') {
            const ar = a.getBoundingClientRect();
            const trunc = cs.textOverflow === 'ellipsis' || getComputedStyle(el.parentElement!).textOverflow === 'ellipsis' || acs.textOverflow === 'ellipsis';
            if (!trunc && (rr.right > ar.right + 1 || rr.left < ar.left - 1)) { clipped.push(`${el.tagName.toLowerCase()} "${el.textContent!.trim().slice(0, 28)}" +${Math.round(rr.right - ar.right)} in ${a.tagName.toLowerCase()}.${String(a.className).slice(0, 40)}`); ok = true; break; }
          }
        }
        if (!ok && rr.right > mr.right + 1) unreachable.push(`${el.tagName.toLowerCase()} "${el.textContent!.trim().slice(0, 28)}" +${Math.round(rr.right - mr.right)}`);
      }
      return { msw: main.scrollWidth, mcw: main.clientWidth, dsw: document.documentElement.scrollWidth, iw: innerWidth, clipped, unreachable, innerScrollers };
    });
    const mo = m.msw - m.mcw;
    out.push({ w, r, st, mo, ...m });
    console.log(`${label} ${w} ${r} st=${st} over=${mo} doc=${m.dsw - m.iw} innerScrollers=${m.innerScrollers} clipped=${m.clipped.length} offMain=${m.unreachable.length}${mo ? ' TASMA' : ''}`);
    for (const c of m.clipped.slice(0, 3)) console.log('    KIRPIK ' + c);
    for (const c of m.unreachable.slice(0, 2)) console.log('    MAIN-DISI ' + c);
  }
  await ctx.close();
}
fs.writeFileSync(`${process.env.OUT}/scan2-${label}.json`, JSON.stringify(out, null, 1));
await browser.close();
