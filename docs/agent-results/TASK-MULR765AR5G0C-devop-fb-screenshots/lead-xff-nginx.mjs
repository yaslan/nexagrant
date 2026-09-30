// devop-fb TASK-MULR765AR5G0C — B-1 through a REAL nginx 1.30.5 with the docs/SMTP-SUNUCU.md
// directive ($proxy_add_x_forwarded_for) in front of `next dev :3950`. The client sends a
// different forged X-Forwarded-For each time; nginx appends the real peer. Every row the
// run creates is deleted by its own id (WHERE id=$1, rowCount=1).
import 'dotenv/config';
import { chromium } from '@playwright/test';
import pg from 'pg';

const APP = 'http://localhost:3950';
const NGINX = process.env.NGINX ?? 'http://127.0.0.1:18963';
const RUN = Date.now().toString(36);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext()).newPage();
let cap = null;
page.on('request', (r) => {
  if (r.method() === 'POST' && r.headers()['next-action'] && r.postData()?.includes('consentVersion')) cap = { url: r.url(), headers: r.headers(), body: r.postData() };
});
await page.goto(`${APP}/tr/fon-hazirlik?kurum=municipality&cevap=111111111111111&il=Samsun`, { waitUntil: 'networkidle' });
const dialog = page.getByRole('alertdialog');
if (await dialog.count()) await dialog.getByRole('button').first().click();
await page.locator('#lead-name').pressSequentially('Devop İnceleme');
await page.locator('#lead-email').pressSequentially(`devopfb-cap-${RUN}@example.test`);
await page.locator('#lead-organisation').pressSequentially('İnceleme Belediyesi');
await page.locator('#lead-consent').check();
await page.locator('section[aria-labelledby="lead-heading"] button[type=submit]').click();
await page.locator('#lead-heading:focus').waitFor({ timeout: 15000 }).catch(() => {});
console.log(`captured action POST: ${cap ? 'yes' : 'NO'}`);

const ids = new Set();
const verdicts = [];
for (let i = 0; i < 12; i++) {
  const email = `devopfb-ngx${i}-${RUN}@example.test`;
  const h = { ...cap.headers };
  delete h['content-length'];
  h['x-forwarded-for'] = `10.9.${i}.1`; // forged by the client; nginx appends the real peer
  const res = await fetch(cap.url.replace(APP, NGINX), { method: 'POST', headers: h, body: cap.body.replace(/devopfb-cap-[a-z0-9]+@example\.test/, email) });
  const text = await res.text();
  verdicts.push(/rate_limited/.test(text) ? 'rate_limited' : /"ok":true/.test(text) ? 'ok' : `other(${res.status})`);
}
console.log(`via nginx, 12 requests, forged first hop 10.9.<i>.1 each time: ${verdicts.join(',')}`);
const r = await db.query(`SELECT id, "ipHash" FROM "PublicLead" WHERE email LIKE 'devopfb-%-${RUN}@example.test'`);
r.rows.forEach((x) => ids.add(x.id));
const ngx = await db.query(`SELECT count(*)::int c, count(DISTINCT "ipHash")::int n FROM "PublicLead" WHERE email LIKE 'devopfb-ngx%-${RUN}@example.test'`);
console.log(`  stored rows=${ngx.rows[0].c} distinct ipHash=${ngx.rows[0].n}`);
for (const id of ids) {
  const d = await db.query('DELETE FROM "PublicLead" WHERE id=$1', [id]);
  if (d.rowCount !== 1) console.log(`cleanup id=${id} deleted=${d.rowCount} (!)`);
}
const left = await db.query(`SELECT count(*)::int n FROM "PublicLead" WHERE email LIKE 'devopfb-%-${RUN}@example.test'`);
console.log(`cleanup: ${ids.size} ids deleted one by one · left with run tag=${left.rows[0].n}`);
await browser.close();
await db.end();
