// İNCELEME-57 extra pass: editor typing, blog images, fonts, many pages, 404.
const { createRequire } = require('module');
const req = createRequire(process.env.W + '/package.json');
const { chromium } = req('@playwright/test');
const fs = require('fs');
const SP = process.env.SP, BASE = process.env.BASE;
const tok = fs.readFileSync(`${SP}/tok.txt`, 'utf8').trim();
const violations = [], errors = [], log = []; const step = { name: '' };
const note = (s) => { log.push(s); console.log(s); };
async function wire(page) {
  await page.exposeFunction('__csp', (v) => violations.push({ step: step.name, ...v }));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp({ directive: e.violatedDirective, blocked: e.blockedURI, disposition: e.disposition })));
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push({ step: step.name, console: m.text().slice(0, 250) }); });
  page.on('pageerror', (e) => errors.push({ step: step.name, msg: e.message.slice(0, 200) }));
}
async function consent(page) {
  const d = page.locator('[aria-labelledby="cookie-title"]');
  if (await d.isVisible().catch(() => false)) await d.locator('button').first().click().catch(() => {});
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.EX });
  const anon = await (await browser.newContext()).newPage(); await wire(anon);
  for (const path of ['/tr/blog/horizon-europe-basarili-konsorsiyum-rehberi', '/en/fiyatlandirma', '/tr/giris', '/tr/acik-cagrilar', '/tr/yok-boyle-sayfa', '/en/nope']) {
    step.name = path;
    const r = await anon.goto(BASE + path, { waitUntil: 'networkidle' }); await consent(anon);
    await anon.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } });
    await anon.waitForTimeout(1500);
    const imgs = await anon.evaluate(() => [...document.images].map((i) => ({ src: i.currentSrc.slice(0, 60), ok: i.complete && i.naturalWidth > 0 })));
    const fonts = await anon.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\.woff2/.test(e.name)).map((e) => e.name.split('/').pop().slice(0, 12) + ':' + (e.responseStatus || '?')));
    note(`${path} ${r.status()} imgs=${imgs.length} broken=${JSON.stringify(imgs.filter((i) => !i.ok))} fontsLoaded=${[...new Set(fonts)].join('|')}`);
  }
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addCookies([{ name: 'authjs.session-token', value: tok, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  const p = await ctx.newPage(); await wire(p);
  for (const path of ['/tr/main/panel', '/tr/main/firsatlar', '/tr/main/cagrilar', '/tr/main/ortaklar', '/tr/main/iliskiler', '/tr/main/onay-merkezi', '/tr/main/ayarlar/moduller', '/tr/main/ayarlar/api-anahtarlari', '/tr/main/opportunities/demo-opp-1/application', '/tr/main/opportunities/demo-opp-1/m2', '/en/main/pipeline', '/tr/admin/tenants', '/tr/main/yok']) {
    step.name = path;
    const r = await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(1500); await consent(p);
    note(`${path} ${r.status()}`);
  }
  step.name = 'editor';
  await p.goto(`${BASE}/tr/main/concept-notes/fefb-i57-cn`, { waitUntil: 'networkidle' }); await consent(p);
  const pm = p.locator('.ProseMirror, [contenteditable=true]').first();
  await pm.click(); await p.keyboard.type('fefb i57 editör CSP metni ');
  await p.keyboard.press('Meta+b'); await p.keyboard.type('kalın');
  const html = await pm.innerHTML();
  note(`editor typed: contains text=${html.includes('fefb i57 editör')} bold=${/<strong>kalın<\/strong>/.test(html)}`);
  const save = p.getByRole('button', { name: /kaydet|save/i }).first();
  if (await save.count()) { await save.click(); await p.waitForTimeout(1500); note('editor save clicked'); }
  await p.screenshot({ path: `${SP}/shots/8-editor.png` });
  step.name = 'cn-docx';
  const dlp = new Promise((res) => { p.on('download', res); ctx.on('page', (np) => np.on('download', res)); });
  await p.locator('a[href$="/export"]').first().click();
  const dl = await Promise.race([dlp, new Promise((r) => setTimeout(() => r(null), 20000))]);
  if (dl) { await dl.saveAs(`${SP}/cn.docx`); note(`concept-note docx ${dl.suggestedFilename()} PK=${fs.readFileSync(`${SP}/cn.docx`).subarray(0, 2).toString() === 'PK'}`); } else note('concept-note docx: no download');
  await browser.close();
  note(`violations=${violations.length} pageerrors=${errors.length}`);
  for (const v of violations) note(JSON.stringify(v)); for (const e of errors) note('ERR ' + JSON.stringify(e));
  fs.writeFileSync(`${SP}/extra57.json`, JSON.stringify({ log, violations, errors }, null, 2));
})().catch((e) => { console.error('EXTRA FAILED', e); process.exit(1); });
