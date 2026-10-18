import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * TASK-MVC9MCXKVMDN7 — the Approval Centre (M5) and the partner API keys (M1)
 * were locked in the sidebar only. Typing the URL opened the list and the key
 * generator. Both pages now run `moduleGate`.
 *
 * The tenant is owned here and sits on `pro`, which sells both M1 and M5, so the
 * only thing that changes between the two halves of each test is the
 * `ModuleState` switch: a refusal can only be `MODULE_OFF`, never the plan.
 */
const TENANT = 'fmg-e2e-tenant';
const WORKSPACE_ID = 'fmg-e2e-workspace';
const WS = 'fmg-e2e';
const USER_ID = 'fmg-e2e-user';
const EMAIL = 'fmg-e2e@fabrika.test';
const SHOTS = shotsDir('TASK-MVC9MCXKVMDN7');

async function setModule(moduleId: 'M1' | 'M5', status: 'ON' | 'OFF') {
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId } },
    create: { tenantId: TENANT, moduleId, status, changedBy: 'feature-module-gate e2e' },
    update: { status },
  });
}

async function signIn(page: Page) {
  await signInAs(page, { id: USER_ID, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' });
}

const gate = (page: Page) => page.locator('section[role="alert"]');

test.describe('feature pages behind M5 / M1 — the URL is a door, not just the menu', () => {
  test.beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'feature module gate e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.subscription.upsert({
      where: { tenantId: TENANT },
      create: { tenantId: TENANT, planId: 'pro', status: 'ACTIVE' },
      update: { planId: 'pro', status: 'ACTIVE', planVersionId: null },
    });
    await prisma.workspace.upsert({
      where: { id: WORKSPACE_ID },
      create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'feature module gate e2e', slug: WS },
      update: { slug: WS },
    });
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: EMAIL, name: 'Feature Gate E2E', locale: 'tr' },
      update: { email: EMAIL },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: TENANT, userId: USER_ID } },
      create: { tenantId: TENANT, userId: USER_ID, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
      update: { role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
    });
  });

  test.afterAll(async () => {
    await prisma.membership.deleteMany({ where: { tenantId: TENANT } });
    await prisma.moduleState.deleteMany({ where: { tenantId: TENANT } });
    await prisma.subscription.deleteMany({ where: { tenantId: TENANT } });
    await prisma.workspace.deleteMany({ where: { tenantId: TENANT } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  test('M5 OFF: /tr/…/onay-merkezi and /en/…/approvals show the lock; M5 ON opens them', async ({ page }) => {
    await setModule('M5', 'OFF');
    await signIn(page);

    for (const [url, messages, locale] of [
      [`/tr/${WS}/onay-merkezi`, trMessages, 'tr'],
      [`/en/${WS}/approvals`, enMessages, 'en'],
    ] as const) {
      await page.goto(url);
      await expect(gate(page)).toContainText(messages.ModuleGate.title);
      await expect(gate(page)).toContainText(
        messages.ModuleGate.reason.MODULE_OFF.replace('{module}', 'Proposal Production Workflows'),
      );
      await expect(page.locator('body')).not.toContainText(messages.Approvals.title);
      await page.screenshot({ path: `${SHOTS}/m5-off-${locale}.png`, fullPage: true });
    }

    await setModule('M5', 'ON');
    for (const [url, messages, locale] of [
      [`/tr/${WS}/onay-merkezi`, trMessages, 'tr'],
      [`/en/${WS}/approvals`, enMessages, 'en'],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(messages.Approvals.title);
      await expect(gate(page)).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/m5-on-${locale}.png`, fullPage: true });
    }
  });

  test('M1 OFF: the API keys page shows the lock in both locales; M1 ON opens it', async ({ page }) => {
    await setModule('M1', 'OFF');
    await signIn(page);

    // There is no Turkish slug for this page (src/lib/modules/route-catalog.ts has
    // no `ayarlar/api-anahtarlari`), so both locales use `settings/api-keys`.
    for (const [url, messages, locale] of [
      [`/tr/${WS}/settings/api-keys`, trMessages, 'tr'],
      [`/en/${WS}/settings/api-keys`, enMessages, 'en'],
    ] as const) {
      await page.goto(url);
      await expect(gate(page)).toContainText(messages.ModuleGate.title);
      await expect(gate(page)).toContainText(
        messages.ModuleGate.reason.MODULE_OFF.replace('{module}', 'Partner Intelligence Database'),
      );
      await expect(page.locator('body')).not.toContainText('Yeni API Anahtarı Oluştur');
      await page.screenshot({ path: `${SHOTS}/m1-off-${locale}.png`, fullPage: true });
    }

    await setModule('M1', 'ON');
    await page.goto(`/tr/${WS}/settings/api-keys`);
    await expect(page.locator('body')).toContainText('Yeni API Anahtarı Oluştur');
    await expect(gate(page)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/m1-on-tr.png`, fullPage: true });
  });
});
