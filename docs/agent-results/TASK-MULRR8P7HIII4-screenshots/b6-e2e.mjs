import { chromium } from '/Users/macbook/alan/FONBRIDGE/node_modules/@playwright/test/index.mjs';
const S = process.env.S, BASE = 'http://localhost:3000';
const run = async (tag, tick) => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/tr/fon-hazirlik`, { waitUntil: 'networkidle' });
  // A first visit shows the cookie dialog; answer it as a visitor would.
  await page.locator('[aria-labelledby=cookie-title] button').first().click();
  await page.locator('label[for=org-municipality], label:has(#org-municipality)').first().click();
  await page.selectOption('#province', 'Samsun');
  await page.getByRole('button', { name: 'Teste başla' }).click();
  for (let step = 0; step < 10; step++) {
    const radios = page.locator('form input[type=radio]');
    await radios.first().waitFor();
    const names = [...new Set(await radios.evaluateAll((els) => els.map((e) => e.name)))];
    for (const [i, n] of names.entries()) await page.locator(`input[name="${n}"][value="${(i + step) % 3}"]`).check();
    const fin = page.getByRole('button', { name: 'Sonucu gör' });
    if (await fin.count()) { await fin.click(); break; }
    await page.getByRole('button', { name: 'İleri' }).click();
  }
  const cta = page.getByRole('link', { name: 'Ücretsiz hesap aç' });
  await cta.waitFor();
  console.log(tag, 'CTA href:', await cta.getAttribute('href'));
  if (tag === 'A') await page.screenshot({ path: `${S}/shots/1-karne-sonuc.png`, fullPage: true });
  await cta.click();
  await page.waitForURL(/\/tr\/kayit/); await page.waitForLoadState('networkidle');
  const box = page.getByTestId('readiness-import');
  await box.waitFor();
  console.log(tag, 'register URL:', page.url(), '| box checked by default:', await box.isChecked());
  const email = `b6-${tag.toLowerCase()}-${Date.now()}@example.com`;
  await page.getByPlaceholder('ad.soyad@kurum.com').fill(email);
  await page.getByTestId('disclosure-ack').check();
  if (tick) await box.check();
  await page.screenshot({ path: `${S}/shots/2${tag}-kayit-onay-${tick ? 'isaretli' : 'isaretsiz'}.png`, fullPage: true });
  await page.getByRole('button', { name: /Çalışma Alanı Oluştur/ }).click();
  await page.waitForURL(/dashboard/, { timeout: 60000 });
  await page.waitForLoadState('networkidle');
  const card = page.getByTestId('readiness-card');
  const has = await card.count();
  console.log(tag, 'email:', email, '| dashboard:', page.url(), '| readiness-card:', has, has ? '| score: ' + (await page.getByTestId('readiness-card-score').innerText()) : '');
  if (has) console.log(tag, 'retake href:', await page.getByTestId('readiness-card-retake').getAttribute('href'), '| gaps:', await page.getByTestId('readiness-card-gaps').locator('li').count());
  await page.screenshot({ path: `${S}/shots/3${tag}-pano-${tick ? 'kartli' : 'kartsiz'}.png`, fullPage: true });
  if (tag === 'A') { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `${S}/shots/4A-pano-mobil.png`, fullPage: true }); }
  await browser.close();
};
await run('A', true);
await run('B', false);
