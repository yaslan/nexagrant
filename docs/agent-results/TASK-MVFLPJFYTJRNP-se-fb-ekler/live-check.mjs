// FO-102 throwaway live check (not committed): KVKK v2 notice in the real modal, tr + en.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2];
const BASE = 'http://localhost:3122';
const pages = [
  { path: '/tr/uzman', link: 'KVKK Aydınlatma Metni', expect: ['Toplama yöntemi ve hukuki sebepler', 'zararın giderilmesini talep etme', 'Başvuru yöntemi', 'KEP adresi: [KEP ADRESİ — patron]', 'Adres: [ADRES — patron]', 'KVKK m.14', 'Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.'] },
  { path: '/en/experts', link: /KVKK|Privacy Notice/i, expect: ['Collection method and legal bases', 'claim compensation', 'How to apply', 'Address: [ADDRESS — owner]', 'KVKK Art. 14'] },
];
const log = [];
const browser = await chromium.launch();
for (const p of pages) {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
  });
  await page.goto(BASE + p.path, { waitUntil: 'load' });
  await page.getByRole('button', { name: p.link }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const text = await dialog.innerText();
  log.push(`== ${p.path} dialog chars=${text.length}`);
  for (const e of p.expect) log.push(`${text.includes(e) ? 'OK  ' : 'MISS'} ${e}`);
  const rights = await dialog.locator('ul').nth(-2).locator('li').count();
  log.push(`rights list items=${rights}`);
  await page.screenshot({ path: OUT.replace('.txt', `${p.path.replaceAll('/', '_')}.png`), fullPage: false });
  await page.close();
}
await browser.close();
writeFileSync(OUT, log.join('\n') + '\n');
console.log(log.join('\n'));
