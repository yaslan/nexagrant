// usage: node measure.cjs <label> <port>   (cwd = worktree)
const WT = '/Users/macbook/alan/FONBRIDGE-wt-fefb-theme';
const { chromium } = require(WT + '/node_modules/@playwright/test');
const { encode } = require(WT + '/node_modules/next-auth/jwt');
const fs = require('fs');
const AXE = fs.readFileSync('/Users/macbook/alan/FONBRIDGE-wt-crwfb-review-MTVTQTJIQ5SDB/node_modules/.pnpm/axe-core@4.13.0/node_modules/axe-core/axe.min.js', 'utf8');
const [label, port] = process.argv.slice(2);
const BASE = `http://localhost:${port}`;
const OUT = __dirname + '/' + label;
fs.mkdirSync(OUT, { recursive: true });
const PAGES = [
 ['app/admin-tenants','/tr/admin/tenants'],['app/ayarlar','/tr/main/ayarlar'],['app/bildirimler','/tr/main/bildirimler'],
 ['app/cagrilar','/tr/main/cagrilar'],['app/dashboard','/tr/main/dashboard'],['app/faturalama','/tr/main/ayarlar/faturalama'],
 ['app/firsatlar','/tr/main/firsatlar'],['app/kanitlar','/tr/main/kanitlar'],['app/onay-merkezi','/tr/main/onay-merkezi'],
 ['app/ortaklar','/tr/main/ortaklar'],['app/pipeline','/tr/main/pipeline'],['app/profil','/tr/main/ayarlar/profil'],
 ['app/uyeler','/tr/main/ayarlar/uyeler'],['public/404','/tr/olmayan-sayfa-xyz'],['public/acik-cagrilar','/tr/acik-cagrilar'],
 ['public/belediye-cagrilari','/tr/belediye-cagrilari'],['public/blog','/tr/blog'],
 ['public/blog-yazi','/tr/blog/horizon-europe-basarili-konsorsiyum-rehberi'],['public/calls','/tr/calls'],
 ['public/dpa','/tr/compliance/dpa'],['public/fiyatlandirma','/tr/fiyatlandirma'],['public/fon-hazirlik','/tr/fon-hazirlik'],
 ['public/giris','/tr/giris'],['public/gizlilik','/tr/privacy'],['public/home-en','/en'],['public/home-tr','/tr'],
 ['public/kayit','/tr/kayit'],['public/kosullar','/tr/terms'],['public/turkiyeye-acik','/tr/turkiyeye-acik-cagrilar'],
];
const SHOT = new Set(['app/dashboard','app/faturalama','app/onay-merkezi','public/home-tr','public/fiyatlandirma','app/ayarlar']);
(async () => {
  const browser = await chromium.launch();
  const all = {};
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, bypassCSP: true });
    const value = await encode({ token: { sub: 'demo-user-superadmin', id: 'demo-user-superadmin', name: 'Demo', email: 'superadmin@demo.local',
      tenantId: 'demo-tenant', role: 'TENANT_OWNER', isPlatformAdmin: true }, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token', maxAge: 3600 });
    await ctx.addCookies([{ name: 'authjs.session-token', value, url: BASE }, { name: 'fabrika-theme', value: theme, url: BASE }]);
    await ctx.addInitScript(() => localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false })));
    const page = await ctx.newPage();
    for (const [name, path] of PAGES) {
      const resp = await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(e => null);
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => ({ url: location.pathname, dark: document.documentElement.classList.contains('dark'), h1: document.querySelector('h1')?.textContent?.trim().slice(0,40) }));
      await page.evaluate(AXE);
      const res = await page.evaluate(async () => {
        const r = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations'] });
        return (r.violations[0]?.nodes || []).map(n => { const d = n.any[0]?.data || {}; return { fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, html: n.html.slice(0, 120) }; });
      });
      all[`${theme}|${name}`] = { status: resp?.status(), ...info, nodes: res };
      if (SHOT.has(name)) await page.screenshot({ path: `${OUT}/${name.replace('/', '-')}-1024-${theme}.png`, fullPage: false });
      process.stdout.write(`${theme} ${name} ${resp?.status()} ${info.url} dark=${info.dark} h1=${info.h1} cc=${res.length}\n`);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/axe.json`, JSON.stringify(all, null, 1));
})();
