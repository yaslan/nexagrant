// TASK-MULR765AR5G0C — real-click walkthrough of the readiness contact form (tr 1280 + en 390),
// then the platform-admin list. Every lead it creates is deleted by its own id at the end.
import 'dotenv/config';
import { chromium } from '@playwright/test';
import pg from 'pg';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.argv[2];
const RUN = Date.now().toString(36);
const log = (...a) => console.log(...a);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const browser = await chromium.launch({ channel: 'chrome' });
const createdIds = [];

async function dismissCookies(page) {
  const dialog = page.getByRole('alertdialog');
  if (await dialog.count()) await dialog.getByRole('button').first().click();
}
const focused = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

async function runLocale({ locale, path, viewport, L }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const events = [];
  page.on('console', (m) => {
    if (m.text().includes('[Analytics Track]')) events.push(m.text().replace(/\s+/g, ' ').slice(0, 160));
    if (m.type() === 'error') log(`  [console.error] ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/${locale}/${path}?kurum=municipality&cevap=111111111111111&il=Samsun`, { waitUntil: 'networkidle' });
  await dismissCookies(page);
  const form = page.locator('section[aria-labelledby="lead-heading"]');
  await form.scrollIntoViewIfNeeded();
  log(`[${locale} ${viewport.width}] heading: ${await form.locator('h2').innerText()}`);
  log(`  province prefilled: ${await page.locator('#lead-province').inputValue()}`);
  await form.screenshot({ path: `${OUT}/${locale}-01-form-${viewport.width}.png` });

  // 1. Empty submit → field errors, focus on the first one.
  await form.getByRole('button', { name: L.submit }).click();
  log(`  empty submit errors: ${(await form.locator('[id$="-error"]').allInnerTexts()).join(' | ')}`);
  log(`  focus after empty submit: ${await focused(page)}`);
  await form.screenshot({ path: `${OUT}/${locale}-02-errors-${viewport.width}.png` });

  // 2. Fields filled by typing, bad e-mail, no consent.
  await page.locator('#lead-name').fill('');
  await page.locator('#lead-name').pressSequentially('Test Kişi');
  await page.locator('#lead-email').pressSequentially('bozuk-adres');
  await page.locator('#lead-organisation').pressSequentially('Test Belediyesi');
  await page.locator('#lead-district').pressSequentially('İlkadım');
  await form.getByRole('button', { name: L.submit }).click();
  log(`  bad email errors: ${(await form.locator('[id$="-error"]').allInnerTexts()).join(' | ')} · focus=${await focused(page)}`);
  log(`  aria-invalid email=${await page.locator('#lead-email').getAttribute('aria-invalid')} describedby=${await page.locator('#lead-email').getAttribute('aria-describedby')}`);

  const email = `fefb-e2e-${locale}-${RUN}@example.test`;
  await page.locator('#lead-email').fill(email);
  await form.getByRole('button', { name: L.submit }).click();
  log(`  no-consent errors: ${(await form.locator('[id$="-error"]').allInnerTexts()).join(' | ')} · focus=${await focused(page)}`);
  const before = (await db.query('SELECT count(*)::int n FROM "PublicLead" WHERE email=$1', [email])).rows[0].n;
  log(`  rows before consent: ${before}`);

  // 3. Consent by keyboard (Space on the focused checkbox), then send.
  await page.locator('#lead-consent').focus();
  await page.keyboard.press('Space');
  log(`  consent checked: ${await page.locator('#lead-consent').isChecked()}`);
  const box = await page.locator('#lead-consent').boundingBox();
  const btn = await form.getByRole('button', { name: L.submit }).boundingBox();
  log(`  target sizes: checkbox ${box?.width}x${box?.height} · submit ${Math.round(btn?.width)}x${btn?.height}`);
  await form.getByRole('button', { name: L.submit }).click();
  await page.getByRole('heading', { name: L.success }).waitFor();
  log(`  success: "${await form.locator('h2').innerText()}" focus=${await focused(page)}`);
  await form.screenshot({ path: `${OUT}/${locale}-03-success-${viewport.width}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log(`  horizontal overflow px: ${overflow}`);
  log(`  analytics: ${events.filter((e) => e.includes('lead')).join(' | ')}`);

  const rows = (await db.query('SELECT id,name,email,organisation,province,district,"readinessCode","readinessTotal","readinessLevel","consentVersion",source,locale,(length("ipHash")) iphashlen FROM "PublicLead" WHERE email=$1', [email])).rows;
  log(`  db rows: ${rows.length} ${JSON.stringify(rows[0])}`);
  for (const r of rows) createdIds.push(r.id);
  await page.screenshot({ path: `${OUT}/${locale}-04-page-${viewport.width}.png`, fullPage: true });
  await ctx.close();
}

await runLocale({
  locale: 'tr', path: 'fon-hazirlik', viewport: { width: 1280, height: 900 },
  L: { submit: 'Gönder', success: 'Teşekkürler, talebiniz alındı.' },
});
await runLocale({
  locale: 'en', path: 'funding-readiness', viewport: { width: 390, height: 844 },
  L: { submit: 'Send', success: 'Thank you, we have your request.' },
});

// Admin list (demo sign-in as the platform admin; DEMO_LOGIN_ENABLED=true locally).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const anon = await page.goto(`${BASE}/tr/admin/leads`);
  log(`[admin] anonymous /tr/admin/leads → HTTP ${anon?.status()}`);
  await page.goto(`${BASE}/tr/giris`, { waitUntil: 'networkidle' });
  await dismissCookies(page);
  await page.locator('input[type=email]').first().fill('admin@yasinaslan.com.tr');
  const pw = page.locator('input[type=password]');
  if (await pw.count()) await pw.first().fill('demo');
  await page.locator('form button[type=submit]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const res = await page.goto(`${BASE}/tr/admin/leads`, { waitUntil: 'networkidle' });
  log(`[admin] signed-in /tr/admin/leads → HTTP ${res?.status()} h1="${await page.locator('main h1').first().innerText().catch(() => '-')}"`);
  log(`  nav item: ${await page.locator('nav a[href="/tr/admin/leads"]').first().innerText().catch(() => '-')}`.replace(/\n/g, ' / '));
  log(`  rows with e2e emails: ${await page.locator('tbody tr', { hasText: RUN }).count()}`);
  log(`  export/csv links: ${await page.locator('a[download], a[href*="csv"], button:has-text("CSV")').count()}`);
  await page.screenshot({ path: `${OUT}/admin-01-leads-1280.png`, fullPage: true });
  await ctx.close();
}

// Cleanup: each test row by its own id.
for (const id of createdIds) {
  const r = await db.query('DELETE FROM "PublicLead" WHERE id=$1', [id]);
  log(`cleanup id=${id} deleted=${r.rowCount}`);
}
log(`left with run tag: ${(await db.query(`SELECT count(*)::int n FROM "PublicLead" WHERE email LIKE $1`, [`%${RUN}@example.test`])).rows[0].n}`);
await browser.close();
await db.end();
