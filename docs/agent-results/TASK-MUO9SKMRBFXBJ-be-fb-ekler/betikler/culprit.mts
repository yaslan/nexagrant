import { chromium } from '@playwright/test';
import { encode } from 'next-auth/jwt';
const [port, w, ...routes] = process.argv.slice(2);
const BASE = `http://localhost:${port}`;
const token = await encode({ token: { sub: 'demo-user-superadmin', id: 'demo-user-superadmin', name: 'Y', email: 'admin@yasinaslan.com.tr', tenantId: 'demo-tenant', role: 'TENANT_OWNER' }, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: 800 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, url: BASE }]);
await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })); } catch {} });
const p = await ctx.newPage();
for (const r of routes) {
  await p.goto(BASE + r, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  const res = await p.evaluate(() => {
    const main = document.querySelector('main')!; const mr = main.getBoundingClientRect(); const out: string[] = [];
    for (const el of main.querySelectorAll<HTMLElement>('*')) {
      const rr = el.getBoundingClientRect(); const over = rr.right - mr.right; if (over <= 0.5) continue;
      let inner = false; for (let e = el.parentElement; e && e !== main; e = e.parentElement) { if (getComputedStyle(e).overflowX !== 'visible') { inner = true; break; } }
      if (inner) continue;
      const par = el.parentElement!; if (par !== main && par.getBoundingClientRect().right - mr.right >= over - 0.5) continue;
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 110)} w=${Math.round(rr.width)} +${Math.round(over)} "${(el.textContent || '').trim().slice(0, 50)}"`);
    }
    return { over: main.scrollWidth - main.clientWidth, out: out.slice(0, 6) };
  });
  console.log(`${w} ${r} over=${res.over}`); for (const c of res.out) console.log('   <- ' + c);
}
await browser.close();
