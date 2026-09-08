import { test, expect } from '@playwright/test';

const OUT = 'docs/agent-results/TASK-MTS6MRKDP168Q-screenshots';

test('TASK-MTS6MRKDP168Q — no unsourced figure on any public marketing surface', async ({ page }) => {
  const banned = [
    '150.000+', '150k+', '150K+', '150,000+', '€60B+', '60 milyar', '4.8/5.0', '10 kat', '50+ teklif',
    // The M1 preview panel: invented figures published under a real institution's name.
    'Fraunhofer', '999984059', '0.9412', '342 Proje', '1.840 Proje', '€940M+', '+1.8 puan',
  ];

  const pages: [string, string][] = [
    ['/tr', '01-landing-tr.png'],
    ['/en', '02-landing-en.png'],
    ['/tr/blog', '03-blog-list-tr.png'],
    ['/tr/blog/horizon-europe-basarili-konsorsiyum-rehberi', '04-blog-post-tr.png'],
    ['/tr/fiyatlandirma', '05-pricing-tr.png'],
    ['/en/pricing', '06-pricing-en.png'],
  ];

  for (const [path, file] of pages) {
    await page.goto(path, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(500);
    // What the reader actually sees, not the i18n payload in the script tags.
    const visible = await page.locator('body').innerText();
    for (const lit of banned) {
      expect(visible, `${path} still shows "${lit}"`).not.toContain(lit);
    }
    await page.screenshot({ path: `${OUT}/${file}` });
    console.log(`OK  ${path.padEnd(48)} clean of all ${banned.length} figures -> ${file}`);
  }

  // The network-analytics section, where the two fabricated stat tiles stood.
  await page.goto('/tr', { waitUntil: 'networkidle' });
  const heading = page.getByRole('heading', { name: /CORDIS Ağ Verisiyle/ });
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/07-landing-network-section.png` });
  const column = await heading.locator('xpath=ancestor::div[1]').innerText();
  expect(column).not.toMatch(/150|60B|€60/);
  expect(column).toContain('eigenvector');
  console.log('OK  network column: the two invented stat tiles are gone');

  // The M1 preview panel says it is a sample, and asserts no figure at all.
  // The panel root: two divs up from the "CORDIS Node Analytics" label span.
  const panel = page.getByText('CORDIS Node Analytics', { exact: true }).locator('xpath=ancestor::div[2]');
  const panelText = await panel.innerText();
  // The badge is CSS-uppercased, so innerText returns "ÖRNEK GÖRÜNÜM".
  expect(panelText).toMatch(/Örnek Görünüm/i);
  expect(panelText).toContain('Örnek Araştırma Merkezi');
  expect(panelText).not.toMatch(/Fraunhofer|999984059|0\.9412/);
  expect(panelText).not.toMatch(/\d[\d.,]*\s*(Proje|puan)/);
  expect(panelText).not.toMatch(/€\s?\d/);
  console.log('OK  M1 panel: labelled a sample, names no institution, states no figure');

  // The blog body, where "60 milyar Avro", "150.000'den fazla" and "ortalama
  // 4.8/5.0" stood, so the evidence shows the prose and not just the hero.
  await page.goto('/tr/blog/horizon-europe-basarili-konsorsiyum-rehberi', { waitUntil: 'networkidle' });
  const metrics = page.getByRole('heading', { name: /Önemli Metrikler/ });
  await metrics.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/08-blog-post-body-metrics.png` });
  const article = await page.locator('article, main').first().innerText();
  expect(article).not.toMatch(/60 milyar|150\.000|4[.,]8\s*\/\s*5|%\s?\d+\s*(artır|yüksel)/);
  console.log('OK  blog body: the CORDIS-scale and reviewer-score claims are gone -> 08-blog-post-body-metrics.png');
  console.log('     panel text ->', JSON.stringify(panelText));
});
