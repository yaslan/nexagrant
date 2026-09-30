import { chromium } from '@playwright/test';
import { encode } from 'next-auth/jwt';
const [port, label] = process.argv.slice(2);
const BASE = `http://localhost:${port}`; const SHOTS = process.env.OUT + '/kareler';
const token = await encode({ token: { sub: 'demo-user-superadmin', id: 'demo-user-superadmin', name: 'Y', email: 'admin@yasinaslan.com.tr', tenantId: 'demo-tenant', role: 'TENANT_OWNER' }, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token', maxAge: 3600 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: false });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, url: BASE }]);
await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })); } catch {} });
const p = await ctx.newPage();
const measure = (sel?: string) => p.evaluate((sel) => {
  const main = document.querySelector('main')!; const r: any = { mainOver: main.scrollWidth - main.clientWidth, docOver: document.documentElement.scrollWidth - innerWidth, mainScrollLeft: main.scrollLeft };
  if (sel) { const panel = document.querySelector(sel) as HTMLElement | null; if (panel) { const b = panel.getBoundingClientRect(); r.panel = { left: Math.round(b.left), right: Math.round(b.right), iw: innerWidth, fits: b.left >= 0 && b.right <= innerWidth, innerOver: panel.scrollWidth - panel.clientWidth }; } else r.panel = 'YOK'; }
  return r;
}, sel);
// 1) approvals modalları
for (const tab of ['Taleplerim']) {
  await p.goto(BASE + '/tr/fabrika-beta/approvals', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: new RegExp(tab) }).first().click();
  await p.waitForTimeout(300);
  console.log(label, 'approvals liste', JSON.stringify(await measure()));
  await p.getByRole('button', { name: /Detay/ }).first().click();
  await p.waitForTimeout(300);
  console.log(label, 'approvals DETAY modalı açık', JSON.stringify(await measure('div.fixed.inset-0 > div')));
  await p.screenshot({ path: `${SHOTS}/${label}-320-approvals-detay-modal.png` });
  await p.locator('div.fixed.inset-0 button').first().click();
  await p.getByRole('button', { name: /Yeni/ }).first().click();
  await p.waitForTimeout(300);
  console.log(label, 'approvals YENİ TALEP modalı açık', JSON.stringify(await measure('div.fixed.inset-0 > div')));
  await p.screenshot({ path: `${SHOTS}/${label}-320-approvals-yeni-modal.png` });
}
// 2) cordis + evaluations şeridi: klavye Tab gezinmesi + yatay kaydırma şeridin içinde mi
for (const route of ['/tr/admin/cordis', '/tr/fabrika-beta/opportunities/demo-opp-1/evaluations']) {
  await p.goto(BASE + route, { waitUntil: 'networkidle' });
  const strip = p.locator('main div.overflow-x-auto').filter({ has: p.locator('button') }).first();
  const n = await strip.locator('button').count();
  if (!n) { console.log(label, route, 'şerit yok (overflow-x-auto kapsayıcı bulunamadı)'); continue; }
  const sw = await strip.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  await strip.locator('button').first().focus();
  const vis: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i) await p.keyboard.press('Tab');
    await p.waitForTimeout(350);
    const v = await p.evaluate(() => { const a = document.activeElement as HTMLElement; const s = a.parentElement!.getBoundingClientRect(); const b = a.getBoundingClientRect(); return `${a.textContent!.trim().slice(0, 18)}:${b.left >= s.left - 1 && b.right <= s.right + 1 ? 'tam' : 'YARIM(l=' + Math.round(b.left) + ',r=' + Math.round(b.right) + ',şerit=' + Math.round(s.right) + ')'}`; });
    vis.push(v);
  }
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const m1 = await measure();
  // dokunma: şerit başa, ilk sekmeye tap
  await strip.evaluate((el) => (el.scrollLeft = 0));
  const fb = await strip.locator('button').first().boundingBox();
  await p.touchscreen.tap(fb!.x + fb!.width / 2, fb!.y + fb!.height / 2); await p.waitForTimeout(300);
  const firstActive = await strip.locator('button').first().evaluate((el) => el.className.includes('border-blue-600') || el.className.includes('border-purple-600'));
  // yatay tekerlek: şerit kayar, main kaymaz
  await strip.hover(); await p.mouse.wheel(300, 0); await p.waitForTimeout(300);
  const after = await strip.evaluate((el) => el.scrollLeft); const m2 = await measure();
  await p.screenshot({ path: `${SHOTS}/${label}-320-${route.split('/').pop()}-serit.png` });
  console.log(label, route, `şerit sw/cw=${sw.sw}/${sw.cw} sekme=${n} odak: ${vis.join(' | ')} ; Enter sonrası ${JSON.stringify(m1)} ; tap ilk sekme etkin=${firstActive} ; tekerlek sonrası şerit.scrollLeft=${after} main=${JSON.stringify(m2)}`);
}
await browser.close();
