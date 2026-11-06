import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * FO-157 — FO-41 grants M1 read only on Discover, and `generateApiKey` refuses
 * there with READ_ONLY_PLAN. The api-keys form says so before the click: locked
 * fields, the READ_ONLY_PLAN sentence and an upgrade link. On Pro the form is
 * open. A plan that drops under an open page still ends in words, not silence.
 *
 * M1 stays `ON` throughout; the only switch is the subscription's plan.
 */
const TENANT = 'fo157-e2e-tenant';
const WS = 'fo157-e2e';
const WORKSPACE = { id: 'fo157-e2e-workspace', slug: WS, name: 'FO-157 e2e' };
const OWNER = { id: 'fo157-e2e-owner', email: 'fo157-owner@fabrika.test' };
const SHOTS = shotsDir('TASK-MVP5XXVKAVA1R-evidence');

const TR_PAGE = `/tr/${WS}/ayarlar/api-anahtarlari`;
const EN_PAGE = `/en/${WS}/settings/api-keys`;
const CREATE = 'API Key Oluştur (fp_live_...)';

const notice = (page: Page) => page.getByTestId('api-keys-read-only');
const nameInput = (page: Page) => page.locator(`input[placeholder="${trMessages.ApiKeysSettings.page.namePlaceholder}"]`);
const nameInputEn = (page: Page) => page.locator(`input[placeholder="${enMessages.ApiKeysSettings.page.namePlaceholder}"]`);

async function setPlan(planId: 'free' | 'pro') {
  await prisma.subscription.upsert({
    where: { tenantId: TENANT },
    create: { tenantId: TENANT, planId, status: 'ACTIVE' },
    update: { planId, status: 'ACTIVE', planVersionId: null },
  });
}

test.describe('API keys on a read-only M1 plan (FO-157)', () => {
  test.beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'FO-157 e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M1' } },
      create: { tenantId: TENANT, moduleId: 'M1', status: 'ON', changedBy: 'fo157 e2e' },
      update: { status: 'ON' },
    });
    await seedIdentity({ userId: OWNER.id, email: OWNER.email, role: 'TENANT_OWNER', tenantId: TENANT }, WORKSPACE);
  });

  test.beforeEach(async () => {
    await prisma.apiKey.deleteMany({ where: { tenantId: TENANT } });
  });

  test.afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { tenantId: TENANT } });
    await cleanupIdentity([OWNER.id]);
  });

  test('Discover: the form is locked, says why, and the upgrade link goes to billing', async ({ page }) => {
    await setPlan('free');
    await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });

    await page.goto(TR_PAGE);
    await expect(notice(page)).toContainText(trMessages.ApiKeysSettings.readOnly.title);
    await expect(notice(page)).toContainText('modülü planınızda salt okunur');
    await expect(notice(page)).toContainText('Pro, Ultra');
    await expect(nameInput(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: CREATE })).toBeDisabled();
    // A real attempt: the field takes no text and nothing is written.
    await nameInput(page).fill('denenmez', { force: true, timeout: 2000 }).catch(() => {});
    await expect(nameInput(page)).toHaveValue('');
    await page.getByRole('button', { name: CREATE }).click({ force: true });
    expect(await prisma.apiKey.count({ where: { tenantId: TENANT } })).toBe(0);
    await page.screenshot({ path: `${SHOTS}/discover-locked-tr.png`, fullPage: true });

    await page.getByRole('link', { name: trMessages.ApiKeysSettings.readOnly.upgrade }).click();
    await expect(page).toHaveURL(/\/(settings\/billing|ayarlar\/faturalama)/);

    await page.goto(EN_PAGE);
    await expect(notice(page)).toContainText(enMessages.ApiKeysSettings.readOnly.title);
    await expect(notice(page)).toContainText('module read only');
    await expect(page.getByRole('link', { name: enMessages.ApiKeysSettings.readOnly.upgrade })).toBeVisible();
    await expect(nameInputEn(page)).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/discover-locked-en.png`, fullPage: true });

    // 390 px: the notice wraps inside the form column, no sideways scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TR_PAGE);
    await notice(page).scrollIntoViewIfNeeded();
    await expect(notice(page)).toBeVisible();
    const box = await notice(page).boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${SHOTS}/discover-locked-tr-390.png` });
  });

  test('Pro: the form is open and creates a key', async ({ page }) => {
    await setPlan('pro');
    await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });

    await page.goto(EN_PAGE);
    await expect(notice(page)).toHaveCount(0);
    await expect(nameInputEn(page)).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/pro-open-en.png`, fullPage: true });

    await page.goto(TR_PAGE);
    await expect(notice(page)).toHaveCount(0);
    await nameInput(page).fill('FO-157 pro anahtarı');
    await page.getByRole('button', { name: CREATE }).click();
    await expect(page.locator('span.select-all')).toContainText('fp_live_');
    expect(await prisma.apiKey.count({ where: { tenantId: TENANT, name: 'FO-157 pro anahtarı' } })).toBe(1);
    await page.screenshot({ path: `${SHOTS}/pro-open-tr.png`, fullPage: true });
  });

  test('plan drops to Discover under an open page: the refusal is explained and the form locks', async ({ page }) => {
    await setPlan('pro');
    await signInAs(page, { id: OWNER.id, email: OWNER.email, tenantId: TENANT, role: 'TENANT_OWNER' });
    await page.goto(TR_PAGE);
    await nameInput(page).fill('FO-157 yarış');

    await setPlan('free');
    await page.getByRole('button', { name: CREATE }).click();

    await expect(page.getByRole('alert').filter({ hasText: trMessages.Common.moduleUnavailable })).toBeVisible();
    await expect(notice(page)).toContainText('modülü planınızda salt okunur');
    await expect(nameInput(page)).toBeDisabled();
    expect(await prisma.apiKey.count({ where: { tenantId: TENANT } })).toBe(0);
    await page.screenshot({ path: `${SHOTS}/race-refused-tr.png`, fullPage: true });
  });
});
