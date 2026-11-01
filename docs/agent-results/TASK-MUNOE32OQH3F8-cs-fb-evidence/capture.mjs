// cs-fb İNCELEME-61: capture the real server-action POST the readiness form sends (one real click), for replay via nginx.
import 'dotenv/config';
import { chromium } from '@playwright/test';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
const APP = 'http://localhost:3961';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext()).newPage();
let cap = null;
page.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action'] && r.postData()?.includes('consentVersion')) cap = { path: new URL(r.url()).pathname + new URL(r.url()).search, headers: r.headers(), body: r.postData() }; });
await page.goto(`${APP}/tr/fon-hazirlik?kurum=municipality&cevap=111111111111111&il=Samsun`, { waitUntil: 'networkidle' });
const dialog = page.getByRole('alertdialog'); if (await dialog.count()) await dialog.getByRole('button').first().click();
await page.locator('#lead-name').pressSequentially('CS İnceleme');
await page.locator('#lead-email').pressSequentially('csfb-cap-i61@example.test');
await page.locator('#lead-organisation').pressSequentially('İnceleme Belediyesi');
await page.locator('#lead-consent').check();
await page.locator('section[aria-labelledby="lead-heading"] button[type=submit]').click();
await page.waitForTimeout(4000);
console.log('ui text:', (await page.locator('section[aria-labelledby="lead-heading"]').innerText()).slice(0, 80).replace(/\n/g, ' | '));
writeFileSync('.i61/cap.json', JSON.stringify(cap));
console.log('captured:', cap ? 'yes' : 'NO');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const r = await db.query(`SELECT id, "ipHash" FROM "PublicLead" WHERE email='csfb-cap-i61@example.test'`);
console.log('row ipHash (direct, no proxy → Next adds socket addr):', r.rows.map((x) => (x.ipHash ?? 'null').slice(0, 12)));
for (const x of r.rows) { const d = await db.query('DELETE FROM "PublicLead" WHERE id=$1', [x.id]); console.log('deleted id', x.id, d.rowCount); }
await db.end(); await browser.close();
