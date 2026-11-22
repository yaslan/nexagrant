import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = 'http://localhost:3000';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = path.join(REPO_ROOT, 'docs/agent-results/TASK-MTQ602Y8V5QOK-screenshots');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const PAGES = [
  { locale: 'tr', path: '/tr/', name: 'home-tr' },
  { locale: 'en', path: '/en/', name: 'home-en' },
  { locale: 'tr', path: '/tr/pricing', name: 'pricing-tr' },
  { locale: 'en', path: '/en/pricing', name: 'pricing-en' },
  { locale: 'tr', path: '/tr/privacy', name: 'privacy-tr' },
  { locale: 'en', path: '/en/privacy', name: 'privacy-en' },
  { locale: 'tr', path: '/tr/terms', name: 'terms-tr' },
  { locale: 'en', path: '/en/terms', name: 'terms-en' },
  { locale: 'tr', path: '/tr/compliance/dpa', name: 'dpa-tr' },
  { locale: 'en', path: '/en/compliance/dpa', name: 'dpa-en' },
  { locale: 'tr', path: '/tr/calls/turkey', name: 'calls-turkey-tr' },
  { locale: 'en', path: '/en/calls/turkey', name: 'calls-turkey-en' },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  console.log('📸 Taking screenshots...\n');

  for (const p of PAGES) {
    const url = `${BASE_URL}${p.path}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const filename = `${p.name}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);
      await page.screenshot({ path: filepath });

      // Get title & meta description
      const title = await page.title();
      const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');

      console.log(`✓ ${filename}`);
      console.log(`  Title: ${title}`);
      console.log(`  Meta:  ${metaDesc?.substring(0, 60)}...`);
      console.log();
    } catch (e) {
      console.error(`✗ ${p.name}: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\n✅ Screenshots saved to ${OUTPUT_DIR}`);
})();
