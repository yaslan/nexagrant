import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { presentIds } from '../helpers/teardown-guard';

/**
 * K4 outreach on the M1 partner card (TASK-MULQLF067H75P) — real browser, real DB.
 *
 * Covers what the unit tests cannot: the section renders inside the M1 page, every
 * external link opens a new tab on the right host with `noopener noreferrer`, the
 * copy buttons put the expected text on the clipboard, and the mailto link has no
 * recipient. Fixture rows use their own PIC / project ids and are removed afterwards.
 */

const SHOTS = shotsDir('TASK-MULQLF067H75P-screenshots');
const WORKSPACE = 'main';
const EMAIL = 'alice@fabrika.test';
const PIC = 'K4E2E-PIC-1';
const PROJECT = 'K4E2E-PROJ-1';
const TOPIC = 'HORIZON-CL5-2024-D3-01-05';
const ORG_NAME = 'K4 Test Hydrogen Institute';

const pageUrl = (locale: string) => `/${locale}/${WORKSPACE}/partners/${PIC}`;

async function rollback() {
  await prisma.cordisParticipation.deleteMany({ where: { organisationId: { in: presentIds([PIC]) } } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: { in: presentIds([PIC]) } } });
  await prisma.cordisProject.deleteMany({ where: { id: { in: presentIds([PROJECT]) } } });
}

async function seed() {
  await rollback();
  await prisma.cordisOrganization.create({
    data: { organisationId: PIC, name: ORG_NAME, country: 'DE', activityType: 'REC' },
  });
  await prisma.cordisProject.create({
    data: {
      id: PROJECT,
      acronym: 'K4E2E',
      title: 'K4 outreach e2e fixture project',
      framework: 'HORIZON',
      topics: { create: [{ topicCode: TOPIC, topicTitle: 'Hydrogen valleys' }] },
    },
  });
  await prisma.cordisParticipation.create({
    data: { projectId: PROJECT, organisationId: PIC, role: 'participant' },
  });
}

async function signIn(page: Page, locale: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  const url = pageUrl(locale);
  await page.goto(`/${locale}/giris?callbackUrl=${encodeURIComponent(url)}`);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${url}`, { timeout: 30_000 });
}

const EXPECTED_HOSTS: Record<string, string> = {
  ft: 'ec.europa.eu',
  een: 'een.ec.europa.eu',
  idealist: 'www.ideal-ist.eu',
  greenet: 'greenet-partner-search-tool.b2match.io',
  linkedin: 'www.linkedin.com',
};

test.describe('M1 partner card — K4 outreach', () => {
  test.beforeAll(seed);
  test.afterAll(async () => {
    await rollback();
    await prisma.$disconnect();
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`external search links and e-mail templates work (${locale})`, async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await signIn(page, locale);

      const search = page.getByTestId('partner-outreach-search');
      await expect(search).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/01-outreach-${locale}.png`, fullPage: true });

      // Every link: right host, new tab, no opener/referrer, no personal data.
      for (const [id, host] of Object.entries(EXPECTED_HOSTS)) {
        const a = page.getByTestId(`outreach-link-${id}`).locator('a');
        await expect(a).toHaveAttribute('target', '_blank');
        await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
        const href = (await a.getAttribute('href')) ?? '';
        expect(new URL(href).host).toBe(host);
        expect(decodeURIComponent(href)).not.toContain('@');
      }
      await expect(page.getByTestId('outreach-link-ft').locator('a')).toHaveAttribute(
        'href',
        /partner-search\?keywords=K4%20Test%20Hydrogen%20Institute$/,
      );
      await expect(page.getByTestId('outreach-link-idealist').locator('a')).toHaveAttribute(
        'href',
        `https://www.ideal-ist.eu/partner-search?topic_id=${TOPIC}`,
      );

      // A real click opens a new tab on the F&T Portal.
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        page.getByTestId('outreach-link-ft').locator('a').click(),
      ]);
      await popup.waitForURL(/ec\.europa\.eu/, { timeout: 30_000, waitUntil: 'commit' });
      expect(new URL(popup.url()).host).toBe('ec.europa.eu');
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      await popup.close();

      // EEN takes no query: its copy button puts topic + English country on the clipboard.
      await page.getByTestId('outreach-link-een').getByTestId('outreach-copy').click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Hydrogen valleys Germany');

      // E-mail template: fill, switch language, copy, check mailto.
      const email = page.getByTestId('partner-outreach-email');
      await email.scrollIntoViewIfNeeded();
      await email.locator('input').nth(1).fill('HORIZON-CL5-2025-D3-01');
      await email.locator('input').nth(2).fill('H2 Valley Twin');
      const body = page.getByTestId('outreach-body');
      await expect(body).toHaveValue(new RegExp(ORG_NAME));
      await expect(body).toHaveValue(/HORIZON-CL5-2025-D3-01/);
      await expect(body).toHaveValue(/H2 Valley Twin/);
      await expect(body).toHaveValue(locale === 'tr' ? /Sayın/ : /Dear/);

      await email.locator('select').nth(1).selectOption(locale === 'tr' ? 'en' : 'tr');
      await expect(body).toHaveValue(locale === 'tr' ? /Dear/ : /Sayın/);
      await email.locator('select').first().selectOption('followup');
      await expect(page.getByTestId('outreach-subject')).toHaveValue(/HORIZON-CL5-2025-D3-01/);

      await email.getByTestId('outreach-copy').click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain('H2 Valley Twin');
      expect(copied).toContain(ORG_NAME);

      const mailto = (await page.getByTestId('outreach-mailto').getAttribute('href')) ?? '';
      expect(mailto.startsWith('mailto:?subject=')).toBe(true);
      await page.screenshot({ path: `${SHOTS}/02-email-${locale}.png`, fullPage: true });
    });
  }

  test('fits a 390px phone without horizontal scroll (tr)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'tr');
    await expect(page.getByTestId('partner-outreach-search')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId('partner-outreach-search').screenshot({ path: `${SHOTS}/03-outreach-tr-390.png` });
    await page.getByTestId('partner-outreach-email').screenshot({ path: `${SHOTS}/04-email-tr-390.png` });
  });
});
