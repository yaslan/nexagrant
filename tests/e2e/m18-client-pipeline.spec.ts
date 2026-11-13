import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * NG-135 (M18-F3) — Müşteri Satış Hattı, real clicks through the five screens that exist today:
 * add an organisation, open a deal, move it to LOST with a reason, add and complete a task.
 * Also proves the module is a closed door when `M18` is OFF.
 *
 * Own tenant, so the only switch between the halves is the `ModuleState` row. M18 is an unsold
 * beta: PILOT opens it to the tenant owner, OFF closes it with MODULE_OFF. Auth goes through
 * the shared session fixture (seedIdentity-style rows + signInAs), never the demo button.
 */
const TENANT = 'm18-e2e-tenant';
const WORKSPACE_ID = 'm18-e2e-workspace';
const WS = 'm18-e2e';
const USER_ID = 'm18-e2e-owner';
const EMAIL = 'm18-e2e-owner@e2e.fabrika.test';
const SHOTS = shotsDir('NG-135');
// Unique per run so a re-run never collides with the duplicate-name check.
const RUN = Date.now().toString(36);
const ORG_NAME = `M18 E2E Kurum ${RUN}`;
const DEAL_TITLE = `M18 E2E Fırsat ${RUN}`;
const TASK_TITLE = `M18 E2E Görev ${RUN}`;
const LOST_REASON = `Bütçe yetersiz ${RUN}`;

const gate = (page: Page) => page.locator('section[role="alert"]');

async function setM18(status: 'PILOT' | 'OFF') {
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M18' } },
    create: { tenantId: TENANT, moduleId: 'M18', status, changedBy: 'm18 e2e' },
    update: { status },
  });
}

async function signIn(page: Page) {
  await signInAs(page, { id: USER_ID, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' });
}

test.describe.configure({ mode: 'serial' });

test.describe('M18 Müşteri Satış Hattı — gerçek tıklama', () => {
  test.beforeAll(async () => {
    // Fresh pipeline per run: leftovers from earlier runs would crowd the board and push the
    // LOST column off-screen. Children first (FK order), then the M18 rows of this tenant only.
    await prisma.dealTask.deleteMany({ where: { tenantId: TENANT } });
    await prisma.dealActivity.deleteMany({ where: { tenantId: TENANT } });
    await prisma.deal.deleteMany({ where: { tenantId: TENANT } });
    await prisma.leadContact.deleteMany({ where: { tenantId: TENANT } });
    await prisma.leadOrganization.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'M18 e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
      update: {},
    });
    await prisma.workspace.upsert({
      where: { id: WORKSPACE_ID },
      create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'M18 e2e', slug: WS },
      update: { slug: WS },
    });
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: EMAIL, name: 'M18 E2E Owner', locale: 'tr' },
      update: { email: EMAIL },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: TENANT, userId: USER_ID } },
      create: { tenantId: TENANT, userId: USER_ID, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
      update: { role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
    });
    await setM18('PILOT');
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('tr: kurum ekle, fırsat aç, LOST + neden, görev ekle ve tamamla', async ({ page }) => {
    const m = trMessages.m18;
    await signIn(page);
    const base = `/tr/${WS}/musteri-hatti`;

    // 1. Kurum ekle
    await page.goto(`${base}/leads`);
    const leadForm = page.getByRole('form', { name: m.leads.newLead });
    await leadForm.getByLabel(m.leads.nameLabel).fill(ORG_NAME);
    await leadForm.getByRole('button', { name: m.leads.submit }).click();
    await expect(page.getByRole('status')).toContainText(m.leads.created);
    const orgRow = page.getByRole('row', { name: new RegExp(ORG_NAME) });
    await expect(orgRow).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-01-leads.png'), fullPage: true });

    // 2. Kurumu aç (satırdaki "Aç" bağlantısı), fırsat aç
    await orgRow.getByRole('link', { name: m.leads.openLead }).click();
    await expect(page.getByRole('heading', { name: m.deal.heading })).toBeVisible();
    const dealForm = page.getByRole('form', { name: m.deal.heading });
    await dealForm.getByLabel(m.deal.titleLabel).fill(DEAL_TITLE);
    await dealForm.getByLabel(m.deal.feeLabel).fill('1500,00');
    await dealForm.getByRole('button', { name: m.deal.submit }).click();
    await expect(page.getByRole('status')).toContainText(m.deal.created);
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-02-lead-detail.png'), fullPage: true });

    // 3. Görev ekle ve tamamla (fırsat hâlâ açık: görev formu yalnız açık fırsatla çıkar)
    await page.goto(`${base}/tasks`);
    const taskForm = page.locator('form').filter({ has: page.getByLabel(m.tasks.titleLabel) }).first();
    await taskForm.getByLabel(m.tasks.titleLabel).fill(TASK_TITLE);
    await taskForm.getByRole('button', { name: m.tasks.submit }).click();
    await expect(page.getByRole('status')).toContainText(m.tasks.created);
    const row = page.getByRole('row', { name: new RegExp(TASK_TITLE) });
    await row.getByRole('button', { name: m.tasks.markDone }).click();
    // The outcome is the row's status cell; the notice count is not asserted (the create line lingers).
    await expect(row).toContainText(m.tasks.done);
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-04-tasks.png'), fullPage: true });

    // 4. Satış hattı: aşama değiştir ve LOST + neden
    await page.goto(`${base}/pipeline`);
    // The innermost <li> is the deal card; the stage column <li> also contains it, so exclude columns.
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('link', { name: DEAL_TITLE }) })
      .filter({ hasNot: page.locator('li') });
    const stageSelect = card.getByLabel(m.pipeline.moveLabel);
    // Forward moves are one step at a time (pipeline-rules.ts): NEW → QUALIFIED → CONTACTED.
    // The success line is not asserted: router.refresh() moves the card to another column and
    // remounts StageSelect, which drops its notice. The outcome is the stage the server stored.
    await stageSelect.selectOption('QUALIFIED');
    await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('QUALIFIED');
    await stageSelect.selectOption('CONTACTED');
    await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('CONTACTED');
    await stageSelect.selectOption('LOST');
    await card.getByLabel(m.pipeline.lostReasonLabel).fill(LOST_REASON);
    await card.getByRole('button', { name: m.pipeline.lostReasonLabel }).click();
    await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('LOST');
    // The board is wider than the viewport; bring the LOST card into the frame for the proof shot.
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-03-pipeline-lost.png'), fullPage: true });
  });

  test('en: the same screens render in English', async ({ page }) => {
    const m = enMessages.m18;
    await signIn(page);
    const base = `/en/${WS}/musteri-hatti`;
    await page.goto(`${base}/leads`);
    await expect(page.getByRole('heading', { name: m.leads.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-01-leads.png'), fullPage: true });
    await page.goto(`${base}/pipeline`);
    await expect(page.getByRole('heading', { name: m.pipeline.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-02-pipeline.png'), fullPage: true });
    await page.goto(`${base}/tasks`);
    await expect(page.getByRole('heading', { name: m.tasks.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-03-tasks.png'), fullPage: true });
  });

  test('M18 OFF: the routes show the module lock, not the screens', async ({ page }) => {
    await setM18('OFF');
    await signIn(page);
    for (const [url, messages] of [
      [`/tr/${WS}/musteri-hatti/leads`, trMessages],
      [`/en/${WS}/musteri-hatti/pipeline`, enMessages],
    ] as const) {
      await page.goto(url);
      await expect(gate(page)).toContainText(messages.ModuleGate.title);
    }
    await setM18('PILOT');
  });
});
