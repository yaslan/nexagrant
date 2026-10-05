// crw-fb İNCELEME-50 — PublicLead: real submit + XFF spoof replay + 390/1280 + admin gate.
// Every row it creates is deleted by its own id at the end.
import 'dotenv/config';
import { chromium } from '@playwright/test';
import pg from 'pg';

const BASE = 'http://localhost:3950';
const OUT = process.argv[2];
const RUN = Date.now().toString(36);
const log = (...a) => console.log(...a);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const browser = await chromium.launch({ channel: 'chrome' });
const ids = new Set();
const track = async (email) => {
  const r = await db.query('SELECT id FROM "PublicLead" WHERE email=$1', [email]);
  r.rows.forEach((x) => ids.add(x.id));
  return r.rows.length;
};

async function dismissCookies(page) {
  const dialog = page.getByRole('alertdialog');
  if (await dialog.count()) await dialog.getByRole('button').first().click();
}

async function realSubmit({ locale, viewport, email, capture }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  let captured = null;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.headers()['next-action'] && req.postData()?.includes('consentVersion')) {
      captured = { url: req.url(), headers: req.headers(), body: req.postData() };
    }
  });
  await page.goto(`${BASE}/${locale}/fon-hazirlik?kurum=municipality&cevap=111111111111111&il=Samsun`, { waitUntil: 'networkidle' });
  await dismissCookies(page);
  const form = page.locator('section[aria-labelledby="lead-heading"]');
  await form.scrollIntoViewIfNeeded();
  const consent = page.locator('#lead-consent');
  log(`[${locale} ${viewport.width}] consent default checked=${await consent.isChecked()}`);
  await form.screenshot({ path: `${OUT}/${locale}-form-${viewport.width}.png` });
  await page.locator('#lead-name').pressSequentially('Crw İnceleme');
  await page.locator('#lead-email').pressSequentially(email);
  await page.locator('#lead-organisation').pressSequentially('İnceleme Belediyesi');
  await form.locator('button[type=submit]').click();
  log(`  without consent: ${(await form.locator('[id$="-error"]').allInnerTexts()).join(' | ')} · rows=${await track(email)}`);
  await consent.check();
  await form.locator('button[type=submit]').click();
  await page.locator('#lead-heading:focus').waitFor({ timeout: 15000 }).catch(() => {});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log(`  after consent: "${await form.locator('h2').innerText()}" · overflow px=${overflow} · rows=${await track(email)}`);
  await form.screenshot({ path: `${OUT}/${locale}-success-${viewport.width}.png` });
  await ctx.close();
  return captured;
}

const cap = await realSubmit({ locale: 'tr', viewport: { width: 1280, height: 900 }, email: `crwfb-tr-${RUN}@example.test`, capture: true });
await realSubmit({ locale: 'en', viewport: { width: 390, height: 844 }, email: `crwfb-en-${RUN}@example.test` });
log(`captured action POST: ${cap ? 'yes' : 'NO'} (next-action header ${cap?.headers['next-action']?.slice(0, 8)}…)`);

// Replay the exact server-action request with a new e-mail each time.
async function replay(email, xff) {
  const body = cap.body.replace(/crwfb-tr-[a-z0-9]+@example\.test/, email);
  const h = { ...cap.headers };
  delete h['content-length'];
  if (xff) h['x-forwarded-for'] = xff;
  else delete h['x-forwarded-for'];
  const res = await fetch(cap.url, { method: 'POST', headers: h, body });
  const text = await res.text();
  const verdict = /rate_limited/.test(text) ? 'rate_limited' : /"ok":true/.test(text) ? 'ok' : `other(${res.status})`;
  await track(email);
  return verdict;
}

// A) The documented nginx appends the real peer: "<client-sent>, <real ip>".
const REAL = '198.51.100.77';
const spoof = [];
for (let i = 0; i < 12; i++) spoof.push(await replay(`crwfb-xff${i}-${RUN}@example.test`, `10.9.${i}.1, ${REAL}`));
log(`A spoofed first hop, same real IP ${REAL}, 12 requests: ${spoof.join(',')}`);
const hashes = await db.query(`SELECT count(DISTINCT "ipHash")::int n, count(*)::int c FROM "PublicLead" WHERE email LIKE 'crwfb-xff%-${RUN}@example.test'`);
log(`  stored rows=${hashes.rows[0].c} distinct ipHash=${hashes.rows[0].n}`);

// B) Control: the same real IP without a forged first hop.
const ctl = [];
for (let i = 0; i < 11; i++) ctl.push(await replay(`crwfb-ctl${i}-${RUN}@example.test`, `${REAL}`));
log(`B honest header, 11 requests: ${ctl.join(',')}`);

// C) Honeypot and consent over raw HTTP.
const hpBody = cap.body.replace('"website":""', '"website":"http://spam"').replace(/crwfb-tr-[a-z0-9]+@example\.test/, `crwfb-hp-${RUN}@example.test`);
const h1 = { ...cap.headers };
delete h1['content-length'];
h1['x-forwarded-for'] = '203.0.113.200';
const hpText = await (await fetch(cap.url, { method: 'POST', headers: h1, body: hpBody })).text();
log(`C raw POST honeypot filled (body changed=${hpBody !== cap.body}) → ${/"ok":true/.test(hpText) ? 'ok' : hpText.slice(-80)} · rows=${await track(`crwfb-hp-${RUN}@example.test`)}`);
const bodyNoConsent = cap.body.replace('"consent":true', '"consent":false').replace(/crwfb-tr-[a-z0-9]+@example\.test/, `crwfb-nc-${RUN}@example.test`);
const h2 = { ...cap.headers };
delete h2['content-length'];
h2['x-forwarded-for'] = '203.0.113.201';
const nc = await (await fetch(cap.url, { method: 'POST', headers: h2, body: bodyNoConsent })).text();
log(`C raw POST consent:false → ${/consent_required/.test(nc) ? 'consent_required' : nc.slice(-120)} · rows=${await track(`crwfb-nc-${RUN}@example.test`)}`);

// Admin gate: anonymous and signed-in.
async function adminAs(email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (email) {
    const csrf = await (await page.request.get(`${BASE}/api/auth/csrf`)).json();
    await page.request.post(`${BASE}/api/auth/callback/credentials`, { form: { email, csrfToken: csrf.csrfToken, callbackUrl: `${BASE}/tr` } });
  }
  const res = await page.goto(`${BASE}/tr/admin/leads`);
  const h1 = res.status() === 200 ? await page.locator('h1').first().innerText() : '';
  const exportLinks = await page.locator('a[href*="csv"], a[href*="export"], a[download], button:has-text("CSV")').count();
  log(`admin /tr/admin/leads as ${email ?? 'anonymous'} → ${res.status()} ${h1} · export controls=${exportLinks}`);
  await ctx.close();
}
await adminAs(null);
await adminAs('alice@fabrika.test');
await adminAs('admin@yasinaslan.com.tr');

// Cleanup: one id at a time.
for (const id of ids) {
  const r = await db.query('DELETE FROM "PublicLead" WHERE id=$1', [id]);
  if (r.rowCount !== 1) log(`cleanup id=${id} deleted=${r.rowCount} (!)`);
}
const left = await db.query(`SELECT count(*)::int n FROM "PublicLead" WHERE email LIKE 'crwfb-%-${RUN}@example.test'`);
log(`cleanup: ${ids.size} ids deleted one by one · left with run tag=${left.rows[0].n}`);
await browser.close();
await db.end();
