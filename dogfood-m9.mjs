import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const OUT = 'docs/agent-results/TASK-MTQU053U24RYH-screenshots';
fs.mkdirSync(OUT, { recursive: true });
const log = [];
const say = (id, msg) => { console.log(`[${id}] ${msg}`); log.push(`[${id}] ${msg}`); };

const OPP1 = 'demo-opp-1';
const OPP2 = 'demo-opp-2';
const WS = 'fabrika-beta';
const briefsUrl = (opp, locale = 'tr') => `${BASE}/${locale}/${WS}/opportunities/${opp}/briefs`;

async function login(page, email, targetUrl) {
  await page.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: true, marketing: true }));
  });
  await page.goto(`${BASE}/tr/giris?callbackUrl=${encodeURIComponent(targetUrl)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/briefs', { timeout: 45000 });
  await page.waitForLoadState('networkidle');
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 200)));
let dialogText = null;
page.on('dialog', async d => { dialogText = `${d.type()}: ${d.message()}`; await d.dismiss(); });

const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); };

const nameInput = () => page.locator('input[placeholder="Görüşülecek Ortak / Kurum Adı"]');
const dateInput = () => page.locator('input[type="date"]').first();
const timeInput = () => page.locator('input[type="time"]').first();
const submitBtn = () => page.locator('form button[type="submit"]').first();
const recordsHeading = () => page.locator('h3', { hasText: 'GÖRÜŞME KAYITLARI' }).first();

// ---------- D01 ----------
await login(page, 'owner@demo.fabrika.test', briefsUrl(OPP1));
say('D01', 'login + briefs page: ' + (await page.locator('h1').innerText()));
say('D01', 'records header: ' + (await page.locator('h3').first().innerText()));
await shot('D01-loaded');

// ---------- D02 whitespace-only partner name ----------
await nameInput().fill('   ');
await submitBtn().click();
await page.waitForTimeout(2500);
say('D02', `whitespace-only name submitted. visible feedback dialog=${dialogText} | button text now="${(await submitBtn().innerText()).trim()}" | records="${(await page.locator('h3').first().innerText())}"`);
await shot('D02-whitespace-name');

// ---------- D03 date without time ----------
await nameInput().fill('Sadece Tarih Ortağı');
await dateInput().fill('2026-10-24');
await page.waitForTimeout(500);
const brusselsBoxVisible1 = await page.locator('text=Brüksel Saati').count();
say('D03', `date filled, no time -> Brussels preview blocks visible: ${brusselsBoxVisible1}`);
await shot('D03-date-without-time');

// ---------- D04 DST check: 2026-10-24 (CEST, UTC+2) ----------
await timeInput().fill('14:00');
await page.waitForTimeout(500);
const preview1 = await page.locator('.font-mono.text-blue-800').first().innerText().catch(() => 'n/a');
say('D04', `local 2026-10-24 14:00 -> preview "${preview1}" (browser TZ ${await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)})`);

// ---------- D05 DST boundary: 2026-11-01 (CET, UTC+1) ----------
await dateInput().fill('2026-11-01');
await page.waitForTimeout(500);
const preview2 = await page.locator('.font-mono.text-blue-800').first().innerText().catch(() => 'n/a');
say('D05', `local 2026-11-01 14:00 -> preview "${preview2}"`);
await shot('D05-dst-preview');

// ---------- D06 create a real brief ----------
await dateInput().fill('2026-10-24');
await nameInput().fill('Fraunhofer IWES');
await submitBtn().click();
await page.waitForTimeout(12000);
say('D06', `after generate: records="${await page.locator('h3').first().innerText()}"`);
await shot('D06-brief-created');

// ---------- D07 XSS payload as partner name ----------
await nameInput().fill('<img src=x onerror="document.title=\'XSS\'">');
await submitBtn().click();
await page.waitForTimeout(12000);
say('D07', `XSS payload brief -> page title="${await page.title()}" (unchanged title = escaped)`);
say('D07', `records="${await page.locator('h3').first().innerText()}"`);
await shot('D07-xss-payload');

// ---------- D08 very long partner name ----------
await nameInput().fill('Ç'.repeat(600));
await submitBtn().click();
await page.waitForTimeout(12000);
say('D08', `600-char name -> records="${await page.locator('h3').first().innerText()}"`);
await shot('D08-long-name');

// ---------- D09 double submit (double click) ----------
await nameInput().fill('Çift Tık Ortağı');
await submitBtn().click({ clickCount: 2, delay: 40 });
await page.waitForTimeout(14000);
say('D09', `double click -> records="${await page.locator('h3').first().innerText()}"`);
await shot('D09-double-click');

// ---------- D10 .ics download ----------
const icsBtn = page.locator('button', { hasText: 'Takvim (.ics)' });
say('D10', `.ics button count on active brief: ${await icsBtn.count()}`);
if (await icsBtn.count()) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), icsBtn.first().click()]);
  if (dl) {
    const p = path.join(OUT, 'downloaded.ics');
    await dl.saveAs(p);
    say('D10', `downloaded as ${dl.suggestedFilename()} -> saved ${p}`);
    say('D10', 'content:\n' + fs.readFileSync(p, 'utf8'));
  } else say('D10', 'no download event fired');
}
await shot('D10-ics');

// ---------- D11 action item with empty input ----------
const addBtn = page.locator('button', { hasText: 'Ekle' }).first();
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(400);
  say('D11', `empty action item add -> list items: ${await page.locator('ul li').count()}, feedback dialog=${dialogText}`);
}

// ---------- D12 post-meeting notes on the real brief ----------
const notesArea = page.locator('textarea').first();
if (await notesArea.count()) {
  await page.locator('input[placeholder^="Örn: Fraunhofer"]').fill('WP3 liderliği kabul edildi.');
  await notesArea.fill('BU NOT KAYBOLMAMALI — 20 dakikalık toplantı özeti.');
  await page.locator('button', { hasText: 'Toplantı Sonrası Notlarını' }).first().click();
  await page.waitForTimeout(8000);
  say('D12', `after saving notes: textarea value="${await notesArea.inputValue()}"`);
  const body = await page.locator('main, body').first().innerText();
  say('D12', `brief body contains the note: ${body.includes('BU NOT KAYBOLMAMALI')}`);
  await shot('D12-post-meeting-notes');
}

// ---------- D13 reload: did it persist ----------
await page.reload();
await page.waitForLoadState('networkidle');
const afterReload = await page.locator('main, body').first().innerText();
say('D13', `after reload records="${await page.locator('h3').first().innerText()}" | note persisted: ${afterReload.includes('BU NOT KAYBOLMAMALI')}`);
await shot('D13-after-reload');

// ---------- D14 briefs scoped to opportunity? ----------
await page.goto(briefsUrl(OPP2));
await page.waitForLoadState('networkidle');
say('D14', `opportunity 2 page: title="${await page.locator('p.text-muted, p').first().innerText().catch(()=>'')}"`);
say('D14', `opportunity 2 records="${await page.locator('h3').first().innerText()}"`);
await shot('D14-other-opportunity-same-briefs');

// ---------- D15 nonexistent opportunity ----------
await page.goto(briefsUrl('kedi-kopek-42'));
await page.waitForLoadState('networkidle');
say('D15', `bogus opportunity -> "${(await page.locator('h1').innerText())}" / call="${await page.locator('p').filter({hasText:'Çağrı Fırsatı'}).first().innerText().catch(()=>'')}"`);
await shot('D15-bogus-opportunity');

// ---------- D16 EN locale ----------
await page.goto(briefsUrl(OPP1, 'en'));
await page.waitForLoadState('networkidle');
say('D16', `EN locale h1="${await page.locator('h1').innerText()}" submit="${(await submitBtn().innerText()).trim()}"`);
await shot('D16-en-locale');

// ---------- D17 cross-tenant user ----------
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page2 = await ctx2.newPage();
await page2.addInitScript(() => window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: true, marketing: true })));
await page2.goto(`${BASE}/tr/giris?callbackUrl=${encodeURIComponent(briefsUrl(OPP1))}`);
await page2.locator('input[type="email"]').fill('partner01@example.invalid');
await page2.locator('form button[type="submit"]').click();
await page2.waitForURL('**/briefs', { timeout: 45000 }).catch(()=>{});
await page2.waitForLoadState('networkidle');
const p2text = await page2.locator('body').innerText();
say('D17', `other-tenant user on demo-opp-1: call="${p2text.match(/Çağrı Fırsatı:.*/)?.[0] ?? 'n/a'}"`);
say('D17', `sees "Fraunhofer IWES" (our tenant's brief): ${p2text.includes('Fraunhofer IWES')} | sees "Çift Tık": ${p2text.includes('Çift Tık')}`);
await page2.screenshot({ path: path.join(OUT, 'D17-cross-tenant.png'), fullPage: true });
await ctx2.close();

say('CONSOLE', 'browser console errors: ' + (consoleErrors.length ? JSON.stringify([...new Set(consoleErrors)], null, 1) : 'none'));
fs.writeFileSync(path.join(OUT, 'run-log.txt'), log.join('\n'));
await browser.close();
