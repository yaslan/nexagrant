import { test, expect, type Page } from '@playwright/test';

import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import {
  ME_EMAIL,
  ME_OPPORTUNITY,
  ME_OPPORTUNITY_TITLE,
  ME_TENANT,
  ME_USER_ID,
  ME_WORKSPACE,
  setModule,
  setPlan,
  setupModuleEntryTenant,
  teardownModuleEntryTenant,
} from './fixtures/module-entry-tenant';

/**
 * TASK-MVBCE3QTT3X67 (FO-6) — every paid module has a way in that a user can click.
 *
 * The gap report (TASK-MVBB4FCX2Q24T K-1) found M2, M6, M8 matching, M9, M10, M11,
 * the M1 leaders page and the M5 person-days report reachable only by typing the
 * address, and a sidebar that was a fixed list. Every test here therefore starts at
 * the dashboard and gets to each module by CLICKING: the sidebar, the opportunity's
 * module tabs, or the /partners cross-links. A `goto` straight to a module page would
 * prove the page exists, which nobody doubted.
 *
 * "Arrived" means the module's own page rendered, not the module gate's refusal.
 */

const SHOTS = shotsDir('TASK-MVBCE3QTT3X67-screenshots');
const LOCKED = /Bu modül şu anda kullanılamıyor/;

async function signIn(page: Page) {
  await signInAs(page, { id: ME_USER_ID, email: ME_EMAIL, tenantId: ME_TENANT, role: 'TENANT_OWNER' });
  await page.goto(`/tr/${ME_WORKSPACE}/panel`);
  await expect(page.locator('aside nav')).toBeVisible();
}

const sidebar = (page: Page) => page.locator('aside nav');

async function expectArrived(page: Page, url: RegExp, heading: RegExp) {
  await page.waitForURL(url);
  const main = page.getByRole('main');
  // Any level: the M2 editor titles itself with an <h2>.
  await expect(main.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 30_000 });
  await expect(main).not.toContainText(LOCKED);
}

/** Dashboard → sidebar "Fırsatlar" → board card → "İncele": the opportunity detail. */
async function openOpportunityByClicking(page: Page) {
  await sidebar(page).getByRole('link', { name: 'Fırsatlar' }).click();
  await page.waitForURL(/\/firsatlar$/);
  const card = page.getByTestId(`pipeline-card-${ME_OPPORTUNITY}`);
  await card.getByRole('heading', { name: ME_OPPORTUNITY_TITLE }).click();
  await card.getByRole('link', { name: /İncele/ }).click();
  await page.waitForURL(new RegExp(`/pipeline/${ME_OPPORTUNITY}$`));
  await expect(page.getByTestId('opportunity-module-tabs')).toBeVisible();
}

test.describe('module entry points — reached by clicking', () => {
  test.beforeAll(async () => {
    await setupModuleEntryTenant();
  });

  test.afterAll(async () => {
    await teardownModuleEntryTenant();
  });

  test.beforeEach(async () => {
    // Each test states the ultra / M7-off baseline; the closed-module test moves away from it.
    await setPlan('ultra');
    await setModule('M7', 'OFF');
    await setModule('M9', 'ON');
  });

  test('sidebar: every module entry comes from a manifest and opens its page (M5, M1, M2, M3, M4)', async ({ page }) => {
    await signIn(page);

    await expect(sidebar(page).getByRole('link')).toHaveText([
      'Panel',
      'Çağrılar',
      'Fırsatlar',
      'Ortaklar',
      'Konsept Notlar',
      'Kanıtlar',
      'İlişkiler',
      'Onay Merkezi (4-Eyes)',
      'Partner REST API',
      'Üyeler',
      'Ayarlar',
    ]);
    await page.screenshot({ path: `${SHOTS}/e2e-01-sidebar-ultra-m7-off.png` });

    const entries: [string, RegExp, RegExp][] = [
      ['Fırsatlar', /\/firsatlar$/, /Fırsat/],
      ['Ortaklar', /\/ortaklar$/, /Partner Intelligence/],
      ['Konsept Notlar', /\/konsept-notlar$/, /Konsept|Concept/],
      ['Kanıtlar', /\/kanitlar$/, /Kanıt|Evidence/],
      ['İlişkiler', /\/iliskiler$/, /Odak Noktası/],
    ];
    for (const [label, url, heading] of entries) {
      await sidebar(page).getByRole('link', { name: label }).click();
      await expectArrived(page, url, heading);
    }
  });

  test('opportunity tabs: M2, M6, M8 (matrix + builder), M9, M10, M11 open by clicking', async ({ page }) => {
    await signIn(page);
    await openOpportunityByClicking(page);
    await page.screenshot({ path: `${SHOTS}/e2e-02-opportunity-tabs-ultra.png` });

    const tabs: [string, RegExp, RegExp][] = [
      ['conceptNote', /\/opportunities\/[^/]+\/m2$/, /Concept Note/],
      ['evaluations', /\/opportunities\/[^/]+\/evaluations$/, /İç Ön Değerlendirme/],
      ['matching', /\/opportunities\/[^/]+\/matching$/, /Konsorsiyum Rol Matrisi/],
      ['consortium', /\/pipeline\/[^/]+\/consortium$/, /Consortium Builder/],
      ['briefs', /\/opportunities\/[^/]+\/briefs$/, /Görüşme Brifingi/],
      ['documents', /\/opportunities\/[^/]+\/documents$/, /Takip Belgeleri/],
      ['application', /\/opportunities\/[^/]+\/application$/, /Başvuru/],
    ];
    for (const [tab, url, heading] of tabs) {
      await page.getByTestId(`opportunity-module-tab-${tab}`).click();
      await expectArrived(page, url, heading);
      await page.goBack();
      await expect(page.getByTestId('opportunity-module-tabs')).toBeVisible();
    }
  });

  test('/partners: leaders (M1) and person-days (M5) open by clicking', async ({ page }) => {
    await signIn(page);
    await sidebar(page).getByRole('link', { name: 'Ortaklar' }).click();
    await page.waitForURL(/\/ortaklar$/);
    await page.screenshot({ path: `${SHOTS}/e2e-03-partners-cross-links.png` });

    await page.getByTestId('partners-link-leaders').click();
    await expectArrived(page, /\/partners\/leaders$/, /Lider/i);

    await page.goBack();
    await page.getByTestId('partners-link-person-days').click();
    await expectArrived(page, /\/reports\/person-days$/, /Adam-Gün Raporu/);
  });

  test('a closed module offers no way in: OFF switch and plan both hide its entries', async ({ page }) => {
    // Status: M9 switched OFF on a plan that sells it.
    await setModule('M9', 'OFF');
    await signIn(page);
    await expect(sidebar(page).getByRole('link', { name: /TTO/ })).toHaveCount(0);
    await openOpportunityByClicking(page);
    await expect(page.getByTestId('opportunity-module-tab-briefs')).toHaveCount(0);
    await expect(page.getByTestId('opportunity-module-tab-documents')).toBeVisible();

    // Plan: `pro` does not sell M9, M10 or M11 — their rows stay ON, the tabs go.
    await setModule('M9', 'ON');
    await setPlan('pro');
    await page.reload();
    await expect(page.getByTestId('opportunity-module-tabs')).toBeVisible();
    for (const gone of ['briefs', 'documents', 'application']) {
      await expect(page.getByTestId(`opportunity-module-tab-${gone}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('opportunity-module-tab-matching')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/e2e-04-opportunity-tabs-pro.png` });

    // And M2 leaves the sidebar the moment it is switched off.
    await setModule('M2', 'OFF');
    await page.reload();
    await expect(sidebar(page).getByRole('link', { name: 'Konsept Notlar' })).toHaveCount(0);
    await expect(page.getByTestId('opportunity-module-tab-conceptNote')).toHaveCount(0);
    await setModule('M2', 'ON');
  });
});
