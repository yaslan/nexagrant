import { chromium } from '@playwright/test';
const S = process.argv[2];
const b = await chromium.launch({ channel: 'chrome' });
for (const [loc, w] of [['tr',1280],['en',1280],['tr',375]]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(`http://localhost:3000/${loc}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Gerekli Çerezler|Essential Only/ }).click();
  await p.getByRole('button', { name: /Gerekli Çerezler|Essential Only/ }).waitFor({ state: 'detached' });
  const f = p.locator('footer').last();
  await f.scrollIntoViewIfNeeded();
  await f.screenshot({ path: `${S}/footer-${loc}-${w}.png` });
  const txt = await f.innerText();
  const hero = await p.locator('body').innerText();
  const mail = await f.locator('a[href^="mailto:"]').getAttribute('href');
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(loc, w, JSON.stringify({ residency: txt.match(/.*(Türkiye).*/g), frankfurt: /frankfurt|eu cloud|data cent/i.test(hero), mail, heroCompliance: hero.match(/.*KVKK.*/g), scrollWidth: sw }));
}
await b.close();
