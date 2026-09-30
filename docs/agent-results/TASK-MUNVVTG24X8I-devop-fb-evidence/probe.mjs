// İNCELEME-72 (devop-fb) — mobile 2px edge probe. Usage: node probe.mjs <label> <widths> [landscape]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const S = '/private/tmp/claude-501/-Users-macbook-alan/1ff7f1b5-3a91-4a3c-a7ab-ffefb0291564/scratchpad';
const require = createRequire(`${S}/wt/package.json`);
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:3172';
const [label = 'run', widthsArg = '320,360,390,472', landscape] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const outDir = `${S}/shots/${label}`;
fs.mkdirSync(outDir, { recursive: true });
const WS = '/tr/fabrika-beta';

// [name, path, auth, action?]
const SCEN = [
  ['portal-partner', '/tr/portal/partner/devopfb72-portal-token', false],
  ['blog-post', '/tr/blog/horizon-europe-basarili-konsorsiyum-rehberi', false],
  ['calls-germany', '/tr/calls/germany', false],
  ['kayit-form-hata', '/tr/kayit', false, 'submitEmpty'],
  ['giris-form-hata', '/tr/giris', false, 'badEmail'],
  ['cookie-sheet', '/tr', false, 'cookie'],
  ['privacy-modal', `${WS}/settings/privacy`, true, 'privacyModal'],
  ['daterange-popover', `${WS}/dashboard`, true, 'dateRange'],
  ['tablo-audit', '/tr/admin/audit', true],
  ['tablo-person-days', `${WS}/reports/person-days`, true],
  ['tablo-cordis', '/tr/admin/cordis', true],
  ['bos-relationships', `${WS}/relationships`, true],
  ['detay-firsat', `${WS}/firsatlar/demo-opp-1`, true],
  ['detay-cagri', `${WS}/cagrilar/CALL_ID`, true],
  ['admin-plans', '/tr/admin/billing/plans', true],
];
const ids = JSON.parse(fs.readFileSync(`${S}/ids.json`, 'utf8'));
for (const s of SCEN) s[1] = s[1].replace('CN_ID', ids.cn).replace('CALL_ID', ids.call);

const browser = await chromium.launch({ channel: 'chrome' });
const statePath = `${S}/state.json`;
const consent = () => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ essential: true, analytics: false, v: 1 })); } catch {} };
if (!fs.existsSync(statePath)) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(consent);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/tr/giris`, { waitUntil: 'networkidle', timeout: 120000 });
  await p.locator('input[type=email]:visible').first().fill('admin@yasinaslan.com.tr');
  await p.locator('input[type=email]:visible').first().press('Enter');
  await p.waitForURL((u) => !u.pathname.includes('giris'), { timeout: 60000 });
  await ctx.storageState({ path: statePath });
  await ctx.close();
}

// in-page measurement
const measure = () => {
  const iw = window.innerWidth;
  const de = document.documentElement;
  const skip = (el) => el.closest('header,nav,footer,[data-bar]');
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const boxy = (cs) => (parseFloat(cs.borderLeftWidth) > 0 && cs.borderLeftStyle !== 'none') || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.boxShadow !== 'none';
  // is el clipped horizontally by a scrolling/hidden ancestor (i.e. inside a scroll box)?
  const inScroller = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const ox = getComputedStyle(e).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return e; } return null; };
  const dialog = document.querySelector('[role=dialog],[role=alertdialog]');
  const root = dialog || document.querySelector('main') || document.body;
  let minBox = Infinity, maxBox = -Infinity, minText = Infinity, maxText = -Infinity;
  const over = []; const hug = [];
  let first = null;
  for (const el of root.querySelectorAll('*')) {
    if (!dialog && skip(el)) continue;
    const cs = getComputedStyle(el);
    if (!dialog && (cs.position === 'fixed' || cs.position === 'sticky')) continue;
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight * 4) continue;
    const sc = inScroller(el);
    // overflow outside viewport not contained by a scroller
    if (!sc && (r.left < -0.5 || r.right > iw + 0.5) && r.width < iw * 3) over.push(`${el.tagName.toLowerCase()}.${(el.className?.baseVal ?? el.className ?? '').toString().slice(0, 50)} L=${r.left.toFixed(1)} R=${(iw - r.right).toFixed(1)}`);
    if (sc && sc !== root) { const sr = sc.getBoundingClientRect(); if (r.left < sr.left - 0.5 || r.right > sr.right + 0.5) continue; }
    if (boxy(cs) && r.width >= iw * 0.3) {
      minBox = Math.min(minBox, r.left); maxBox = Math.max(maxBox, r.right);
      if (!first && r.width >= iw * 0.5 && el !== root) first = el;
      if (r.left > -0.5 && r.left < 1.5 && r.width < iw - 1) hug.push(`${el.tagName.toLowerCase()} L=${r.left.toFixed(1)}`);
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n, cnt = 0;
  while ((n = walker.nextNode()) && cnt++ < 5000) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || (!dialog && skip(el))) continue;
    const cs = getComputedStyle(el); if (!dialog && cs.position === 'fixed') continue;
    if (!vis(el)) continue;
    const sc = inScroller(el);
    const rg = document.createRange(); rg.selectNodeContents(n); const rr = rg.getBoundingClientRect();
    if (!(rr.width > 0 && rr.height > 0) || rr.top > innerHeight * 4) continue;
    if (sc && sc !== root) { const sr = sc.getBoundingClientRect(); if (rr.left < sr.left - 0.5 || rr.right > sr.right + 0.5) continue; }
    minText = Math.min(minText, rr.left); maxText = Math.max(maxText, rr.right);
  }
  const fr = first?.getBoundingClientRect();
  const mainEl = document.querySelector('main');
  const mcs = mainEl && getComputedStyle(mainEl);
  return {
    iw, sw: de.scrollWidth, bsw: document.body.scrollWidth,
    card: fr ? [+fr.left.toFixed(1), +(iw - fr.right).toFixed(1)] : null,
    cardTag: first ? `${first.tagName.toLowerCase()}.${String(first.className).slice(0, 60)}` : null,
    box: [isFinite(minBox) ? +minBox.toFixed(1) : null, isFinite(maxBox) ? +(iw - maxBox).toFixed(1) : null],
    text: [isFinite(minText) ? +minText.toFixed(1) : null, isFinite(maxText) ? +(iw - maxText).toFixed(1) : null],
    mainPad: mcs ? [mcs.paddingLeft, mcs.paddingRight] : null,
    dialog: !!dialog, over: over.slice(0, 6), hug: hug.slice(0, 4),
  };
};

// focus ring clipping: tab through focusables, record ring extent vs viewport / clipping ancestor
const focusProbe = async (page) => {
  const res = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const iw = innerWidth;
      if (r.bottom < 0 || r.top > innerHeight) return { skip: true };
      let ext = 0;
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ext = Math.max(ext, parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset || '0'));
      for (const m of cs.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g)) ext = Math.max(ext, parseFloat(m[4]));
      if (!ext) return { tag: el.tagName, noring: true };
      let clipL = 0, clipR = iw;
      for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        const ox = getComputedStyle(e).overflowX;
        if (ox !== 'visible') { const er = e.getBoundingClientRect(); clipL = Math.max(clipL, er.left); clipR = Math.min(clipR, er.right); }
      }
      const cutL = clipL - (r.left - ext), cutR = (r.right + ext) - clipR;
      if (cutL > 0.5 || cutR > 0.5) return { tag: el.tagName, txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), L: +r.left.toFixed(1), ext, cutL: +cutL.toFixed(1), cutR: +cutR.toFixed(1) };
      return { ok: true };
    });
    if (r && !r.ok && !r.skip && !r.noring) res.push(r);
  }
  return res;
};

const actions = {
  async submitEmpty(p) { const b = p.locator('form button[type=submit]:visible').first(); await b.click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(800); },
  async badEmail(p) { const i = p.locator('input[type=email]:visible').first(); await i.fill('yanlis@'); await i.press('Enter'); await p.waitForTimeout(800); },
  async cookie(p) { await p.waitForSelector('[role=alertdialog]', { timeout: 8000 }).catch(() => {}); },
  async privacyModal(p) { await p.locator('button:has-text("Sil"), button:has-text("sil"), button:has-text("Delete")').last().click({ timeout: 8000 }).catch(() => {}); await p.waitForSelector('[role=dialog]', { timeout: 5000 }).catch(() => {}); },
  async dateRange(p) { await p.locator('main button[aria-haspopup], main button[aria-expanded]').first().click({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(600); },
};

const out = [];
const vps = widths.map((w) => (landscape ? { width: w, height: Math.round(w * 0.46) } : { width: w, height: 800 }));
for (const [name, path, auth, action] of SCEN) {
  for (const vp of vps) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: false, ...(auth ? { storageState: statePath } : {}) });
    if (action !== 'cookie') await ctx.addInitScript(consent);
    const p = await ctx.newPage();
    let st;
    try { st = (await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 120000 }))?.status(); } catch (e) { st = 'ERR ' + e.message.split('\n')[0]; }
    if (action) await actions[action](p);
    await p.waitForTimeout(300);
    const m = await p.evaluate(measure);
    const shot = `${outDir}/${name}-${vp.width}${landscape ? 'L' : ''}.png`;
    await p.screenshot({ path: shot, fullPage: false });
    let focus = [];
    if (!landscape && vp.width === 320) focus = await focusProbe(p);
    const row = { name, w: vp.width, h: vp.height, st, ...m, focus };
    out.push(row);
    console.log(`${String(vp.width).padEnd(4)} ${name.padEnd(20)} st=${st} sw=${m.sw}/${m.iw}${m.bsw !== m.iw ? ' BODYsw=' + m.bsw : ''} card=${m.card?.join('/')} box=${m.box.join('/')} text=${m.text.join('/')} main=${m.mainPad?.join(',')}${m.dialog ? ' DIALOG' : ''}${m.over.length ? ' OVER=' + JSON.stringify(m.over) : ''}${m.hug.length ? ' HUG=' + JSON.stringify(m.hug) : ''}${focus.length ? ' FOCUSCUT=' + JSON.stringify(focus) : ''}`);
    await ctx.close();
  }
}
fs.writeFileSync(`${S}/probe-${label}.json`, JSON.stringify(out, null, 1));
await browser.close();
