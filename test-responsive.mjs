import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const baseUrl = 'http://localhost:3000';
const screenshotsDir = '/tmp/person-days-screenshots';

// Create screenshots directory
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.createContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to person-days page...');
    // Try the default locale first
    await page.goto(`${baseUrl}/tr/workspace/default/reports/person-days`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    }).catch(() => {
      console.log('Could not load person-days page - might need to set up test data');
    });

    // Test at 390px (mobile)
    console.log('Capturing 390px viewport...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(screenshotsDir, 'person-days-390px.png'),
      fullPage: true,
    });
    console.log('✓ Saved: person-days-390px.png');

    // Test at 1280px (desktop)
    console.log('Capturing 1280px viewport...');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({
      path: path.join(screenshotsDir, 'person-days-1280px.png'),
      fullPage: false,
    });
    console.log('✓ Saved: person-days-1280px.png');

    console.log(`\nScreenshots saved to: ${screenshotsDir}`);
  } catch (error) {
    console.error('Error during screenshot capture:', error);
  } finally {
    await browser.close();
  }
}

captureScreenshots();
