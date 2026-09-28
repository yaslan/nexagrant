// TASK-MULR3TQ24ZZ7N — real-click walkthrough of /tr/fon-hazirlik (scratch, not committed).
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.argv[2];
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chrome' });

async function dismissCookies(page) {
  const dialog = page.getByRole('alertdialog');
  if (await dialog.count()) await dialog.getByRole('button').first().click();
}


async function runProfile({ name, value, orgLabel, province, viewport }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const events = [];
  page.on('console', (m) => {
    if (m.text().includes('[Analytics Track]')) events.push(m.text());
    if (m.type() === 'error') log(`  [console.error] ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${BASE}/tr/fon-hazirlik`, { waitUntil: 'networkidle' });
  await dismissCookies(page);
  if (name === 'low') await page.screenshot({ path: `${OUT}/01-intro.png`, fullPage: true });

  // Start without an org type → validation message.
  await page.getByRole('button', { name: 'Teste başla' }).click();
  log(`  [${name}] empty start alert:`, await page.getByRole('alert').first().innerText());

  await page.getByLabel(orgLabel).check();
  if (province) await page.getByLabel('İliniz (isteğe bağlı)').selectOption(province);
  await page.getByRole('button', { name: 'Teste başla' }).click();

  for (let step = 0; step < 5; step++) {
    const heading = await page.locator('h1').innerText();
    const focused = await page.evaluate(() => document.activeElement?.tagName + '#' + document.activeElement?.id);
    if (step === 0) {
      // Next without answers → alert, then answer.
      await page.getByRole('button', { name: 'İleri' }).click();
      log(`  [${name}] unanswered alert:`, await page.getByRole('alert').first().innerText());
    }
    const fieldsets = page.locator('fieldset');
    const n = await fieldsets.count();
    for (let i = 0; i < n; i++) {
      await fieldsets.nth(i).locator(`input[type=radio][value="${value}"]`).click();
    }
    log(`  [${name}] step ${step + 1}: "${heading}" focus=${focused} questions=${n}`);
    if (name === 'low' && step === 1) await page.screenshot({ path: `${OUT}/02-step-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: step === 4 ? 'Sonucu gör' : 'İleri' }).click();
  }

  await page.getByRole('heading', { name: 'Hazırlık sonucunuz' }).waitFor();
  const url = page.url();
  const score = await page.locator('section').first().innerText();
  const recs = await page.locator('#rec-heading + ol > li h3').allInnerTexts();
  const gaps = await page.locator('#gaps-heading + ul > li').count();
  log(`  [${name}] url=${url}`);
  log(`  [${name}] score block: ${score.replace(/\s+/g, ' ').slice(0, 120)}`);
  log(`  [${name}] recommended: ${JSON.stringify(recs)}`);
  log(`  [${name}] gaps: ${gaps}`);
  await page.screenshot({ path: `${OUT}/03-result-${name}-${viewport.width}.png`, fullPage: true });

  // Share link in a NEW page (fresh context = new tab, no state) must show the same result.
  const shareUrl = await page.locator('#share-url').inputValue();
  const ctx2 = await browser.newContext({ viewport });
  const tab = await ctx2.newPage();
  await tab.goto(shareUrl, { waitUntil: 'networkidle' });
  await dismissCookies(tab);
  const recs2 = await tab.locator('#rec-heading + ol > li h3').allInnerTexts();
  const score2 = await tab.locator('section').first().innerText();
  const notice = await tab.getByText('Paylaşılan bir sonucu görüntülüyorsunuz.').count();
  log(`  [${name}] share link same result: ${JSON.stringify(recs2) === JSON.stringify(recs) && score2 === score} (shared notice=${notice})`);
  await ctx2.close();

  // Sign-up CTA.
  await page.getByRole('link', { name: 'Ücretsiz hesap aç' }).click();
  await page.waitForURL(/kayit/);
  log(`  [${name}] CTA → ${page.url()}`);
  log(`  [${name}] analytics: ${events.map((e) => e.replace('[Analytics Track] ', '')).join(' | ')}`);

  // Horizontal overflow check.
  await page.goBack();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log(`  [${name}] horizontal overflow px: ${overflow}`);
  await ctx.close();
}

async function keyboardOnly() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/tr/fon-hazirlik`, { waitUntil: 'networkidle' });
  await dismissCookies(page);
  await page.locator('#org-municipality').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab'); // → province select
  await page.keyboard.press('Tab'); // → start
  const onStart = await page.evaluate(() => document.activeElement?.textContent);
  await page.keyboard.press('Enter');
  for (let step = 0; step < 5; step++) {
    for (let q = 0; q < 3; q++) {
      await page.keyboard.press('Tab'); // into the next radio group (first option)
      await page.keyboard.press('ArrowDown'); // select value 1
    }
    await page.keyboard.press('Tab'); // back
    await page.keyboard.press('Tab'); // next / finish
    if (step === 0) {
      const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      await page.screenshot({ path: `${OUT}/04-keyboard-focus.png` });
      log(`  [keyboard] focus-visible outline on submit: ${outline}`);
    }
    await page.keyboard.press('Enter');
  }
  await page.getByRole('heading', { name: 'Hazırlık sonucunuz' }).waitFor();
  log(`  [keyboard] reached result via keyboard only; start button had focus: "${onStart}"; url=${page.url()}`);
  await ctx.close();
}

log('PROFILE low (all "0", Samsun, desktop 1280):');
await runProfile({ name: 'low', value: 0, orgLabel: 'İlçe / il belediyesi', province: 'Samsun', viewport: { width: 1280, height: 900 } });
log('PROFILE high (all "2", büyükşehir, no province, desktop 1280):');
await runProfile({ name: 'high', value: 2, orgLabel: 'Büyükşehir belediyesi', province: null, viewport: { width: 1280, height: 900 } });
log('PROFILE mid (all "1", Samsun, mobile 360):');
await runProfile({ name: 'mid', value: 1, orgLabel: 'İlçe / il belediyesi', province: 'Samsun', viewport: { width: 360, height: 780 } });
log('KEYBOARD only:');
await keyboardOnly();
await browser.close();
