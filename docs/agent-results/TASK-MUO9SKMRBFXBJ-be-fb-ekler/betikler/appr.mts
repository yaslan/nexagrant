import { chromium } from '@playwright/test';
import { encode } from 'next-auth/jwt';
const [port, label] = process.argv.slice(2);
const BASE = `http://localhost:${port}`;
const token = await encode({ token: { sub: 'demo-user-superadmin', id: 'demo-user-superadmin', name: 'Y', email: 'admin@yasinaslan.com.tr', tenantId: 'demo-tenant', role: 'TENANT_OWNER' }, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const w of [320, 390, 640, 768, 1280]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 700 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, url: BASE }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })); } catch {} });
  const p = await ctx.newPage();
  await p.goto(BASE + '/tr/fabrika-beta/approvals', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Taleplerim/ }).first().click(); await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const main = document.querySelector('main')!; const mr = main.getBoundingClientRect(); const out: string[] = [];
    for (const el of main.querySelectorAll<HTMLElement>('*')) { const rr = el.getBoundingClientRect(); const over = rr.right - mr.right; if (over <= 0.5) continue;
      let inner = false; for (let e = el.parentElement; e && e !== main; e = e.parentElement) if (getComputedStyle(e).overflowX !== 'visible') { inner = true; break; } if (inner) continue;
      const par = el.parentElement!; if (par !== main && par.getBoundingClientRect().right - mr.right >= over - 0.5) continue;
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)} +${Math.round(over)} "${(el.textContent || '').trim().slice(0, 40)}"`); }
    return { over: main.scrollWidth - main.clientWidth, out: out.slice(0, 3) };
  });
  let modal = '';
  if ((await p.getByRole('button', { name: /Detay/ }).count()) > 0) {
    await p.getByRole('button', { name: /Detay/ }).first().click(); await p.waitForTimeout(300);
    modal = await p.evaluate(() => { const x = [...document.querySelectorAll('div.fixed.inset-0 button')].find((b) => b.textContent!.trim() === '×')!.getBoundingClientRect(); return `× düğmesi right=${Math.round(x.right)} iw=${innerWidth} ${x.right <= innerWidth ? 'görünür' : 'EKRAN DIŞI'}`; });
  }
  console.log(label, w, 'Taleplerim over=' + r.over, modal); for (const c of r.out) console.log('   <- ' + c);
  await ctx.close();
}
await browser.close();
