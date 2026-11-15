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
// Every screenshot passes `caret: 'initial'`: Playwright's default `caret: 'hide'` injects an inline caret-color style into inputs before hydration finishes, which causes React hydration mismatch warnings (NG-199).
// Unique per run so a re-run never collides with the duplicate-name check.
const RUN = Date.now().toString(36);
const ORG_NAME = `M18 E2E Kurum ${RUN}`;
const DEAL_TITLE = `M18 E2E Fırsat ${RUN}`;
const TASK_TITLE = `M18 E2E Görev ${RUN}`;
const LOST_REASON = `Bütçe yetersiz ${RUN}`;
const IMPORT_ROWS = 1000;
const BULK_PREFIX = `M18 E2E Toplu ${RUN}`;
const MERGE_NAME = `M18 E2E Birleşme ${RUN}`;
const MERGE_DEAL_TITLE = `M18 E2E Birleşme Fırsatı ${RUN}`;
/** Fills `{key}` placeholders of a message template. */
const fmt = (tpl: string, vars: Record<string, number | string>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), tpl);
/** Matches a message template with `{count}` read as any number, e.g. "İçe aktar ({count})". */
const submitRe = (tpl: string) =>
  new RegExp(`^${tpl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{count\\}', '\\d+')}$`);

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

test.beforeEach(({ page }) => {
  page.on('pageerror', (err) => console.log(`[NG-135] pageerror: ${err.message}`));
});

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
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-01-leads.png'), fullPage: true, caret: 'initial' });

    // 2. Kurumu aç (satırdaki "Aç" bağlantısı), fırsat aç
    await orgRow.getByRole('link', { name: m.leads.openLead }).click();
    await expect(page.getByRole('heading', { name: m.deal.heading })).toBeVisible();
    const dealForm = page.getByRole('form', { name: m.deal.heading });
    await dealForm.getByLabel(m.deal.titleLabel).fill(DEAL_TITLE);
    await dealForm.getByLabel(m.deal.feeLabel).fill('1500,00');
    await dealForm.getByRole('button', { name: m.deal.submit }).click();
    await expect(page.getByRole('status')).toContainText(m.deal.created);
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-02-lead-detail.png'), fullPage: true, caret: 'initial' });

    // 3. Görev ekle ve tamamla (fırsat hâlâ açık: görev formu yalnız açık fırsatla çıkar)
    await page.goto(`${base}/tasks`);
    const taskForm = page.locator('form').filter({ has: page.getByLabel(m.tasks.titleLabel) }).first();
    await taskForm.getByLabel(m.tasks.titleLabel).fill(TASK_TITLE);
    await taskForm.getByRole('button', { name: m.tasks.submit }).click();
    await expect(page.getByRole('status')).toContainText(m.tasks.created);
    const row = page.getByRole('row', { name: new RegExp(TASK_TITLE) });
    await row.getByRole('button', { name: m.tasks.markDone }).click();
    // The outcome is the row's status cell, and the page-level notice must survive the refresh.
    await expect(row).toContainText(m.tasks.done);
    await expect(page.locator('[aria-live="polite"]').getByText(m.tasks.toggled, { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-04-tasks.png'), fullPage: true, caret: 'initial' });

    // 4. Satış hattı: aşama değiştir ve LOST + neden
    await page.goto(`${base}/pipeline`);
    // The innermost <li> is the deal card; the stage column <li> also contains it, so exclude columns.
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('link', { name: DEAL_TITLE }) })
      .filter({ hasNot: page.locator('li') });
    const stageSelect = card.getByLabel(m.pipeline.moveLabel);
    // Forward moves are one step at a time (pipeline-rules.ts): NEW → QUALIFIED → CONTACTED.
    // router.refresh() moves the card to another column and remounts StageSelect; the notice is
    // held by the page-level region (live-notice.tsx), so the success line is asserted here too.
    await stageSelect.selectOption('QUALIFIED');
    await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('QUALIFIED');
    await expect(page.locator('[aria-live="polite"]').getByText(m.pipeline.moved, { exact: true })).toBeVisible();
    await stageSelect.selectOption('CONTACTED');
    await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('CONTACTED');
    await stageSelect.selectOption('LOST');
    await card.getByLabel(m.pipeline.lostReasonLabel).fill(LOST_REASON);
    await card.getByRole('button', { name: m.pipeline.lostReasonLabel }).click();
    await expect(card.getByLabel(m.pipeline.moveLabel)).toHaveValue('LOST');
    await expect(page.locator('[aria-live="polite"]').getByText(m.pipeline.moved, { exact: true })).toBeVisible();
    // The board is wider than the viewport; bring the LOST card into the frame for the proof shot.
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-03-pipeline-lost.png'), fullPage: true, caret: 'initial' });
  });

  test('tr: CSV ile 1.000 satır içe aktar (ham süre ölçülür, 30 sn sınırı)', async ({ page }) => {
    const m = trMessages.m18;
    await signIn(page);
    const base = `/tr/${WS}/musteri-hatti`;
    await page.goto(`${base}/import`);

    const lines = ['Kurum Adı,İl Kodu,Web Sitesi'];
    for (let i = 1; i <= IMPORT_ROWS; i += 1) lines.push(`${BULK_PREFIX} ${i},06,https://kurum-${i}.example.test`);
    await page.locator('#import-file').setInputFiles({
      name: 'kurumlar-1000.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
    });
    await expect(page.locator('ul[aria-live="polite"]')).toContainText(fmt(m.import.countValid, { count: IMPORT_ROWS }));
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-05-import-preview.png'), fullPage: true, caret: 'initial' });

    const started = Date.now();
    await page.getByRole('button', { name: submitRe(m.import.submit) }).click();
    await expect(page.getByRole('status')).toContainText(
      fmt(m.import.imported, { created: IMPORT_ROWS, skipped: 0, invalid: 0 }),
    );
    const elapsed = Date.now() - started;
    console.log(`[NG-135] CSV import of ${IMPORT_ROWS} rows: ${elapsed} ms (budget 30000 ms)`);
    expect(elapsed).toBeLessThan(30_000);

    const written = await prisma.leadOrganization.count({
      where: { tenantId: TENANT, name: { startsWith: BULK_PREFIX }, deletedAt: null },
    });
    expect(written).toBe(IMPORT_ROWS);
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-06-import-done.png'), fullPage: true, caret: 'initial' });
  });

  test('tr: aynı kurumun kopyasını bul ve birleştir (fırsat taşınır, boş alan dolar)', async ({ page }) => {
    const m = trMessages.m18;
    await signIn(page);
    const base = `/tr/${WS}/musteri-hatti`;
    // Same name, one row without a province. The exact keys differ, so the import keeps both;
    // the duplicate review then pairs them, because a blank province is compared, not excluded.
    await page.goto(`${base}/import`);
    await page.locator('#import-file').setInputFiles({
      name: 'birlesme.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`Kurum Adı,İl Kodu\n${MERGE_NAME},\n${MERGE_NAME},06\n`, 'utf8'),
    });
    await expect(page.locator('ul[aria-live="polite"]')).toContainText(fmt(m.import.countValid, { count: 2 }));
    await page.getByRole('button', { name: submitRe(m.import.submit) }).click();
    await expect(page.getByRole('status')).toContainText(fmt(m.import.imported, { created: 2, skipped: 0, invalid: 0 }));

    const [keepOrg, dropOrg] = await prisma.leadOrganization.findMany({
      where: { tenantId: TENANT, name: MERGE_NAME, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!keepOrg || !dropOrg) throw new Error('the two merge rows were not imported');
    expect(keepOrg.provinceCode).toBeNull();
    expect(dropOrg.provinceCode).toBe('06');
    // The deal sits on the organisation that will be dropped; the merge must move it.
    await prisma.deal.create({
      data: { tenantId: TENANT, organizationId: dropOrg.id, title: MERGE_DEAL_TITLE },
    });

    const dupStarted = Date.now();
    await page.goto(`${base}/duplicates`);
    const pair = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: m.duplicates.mergeButton }) })
      .filter({ hasText: MERGE_NAME });
    await expect(pair).toHaveCount(1);
    console.log(`[NG-135] /duplicates with ${IMPORT_ROWS} bulk rows loaded: ${Date.now() - dupStarted} ms`);
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-07-duplicates.png'), fullPage: true, caret: 'initial' });

    await pair.locator(`input[type="radio"][value="${keepOrg.id}"]`).check();
    const mergeStarted = Date.now();
    await pair.getByRole('button', { name: m.duplicates.mergeButton }).click();
    await expect(pair).toHaveCount(0);
    // An error boundary also leaves no pair row behind, so the list alone proves nothing.
    await expect(page.getByText(/Bir Hata Oluştu|Something went wrong/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: m.duplicates.heading })).toBeVisible();
    console.log(`[NG-135] merge click to refreshed /duplicates list: ${Date.now() - mergeStarted} ms`);

    const kept = await prisma.leadOrganization.findUniqueOrThrow({ where: { id: keepOrg.id } });
    const dropped = await prisma.leadOrganization.findUniqueOrThrow({ where: { id: dropOrg.id } });
    expect(dropped.deletedAt).not.toBeNull();
    expect(kept.provinceCode).toBe('06');
    expect(await prisma.deal.count({ where: { tenantId: TENANT, organizationId: keepOrg.id, title: MERGE_DEAL_TITLE, deletedAt: null } })).toBe(1);
    await page.screenshot({ path: path.join(SHOTS, 'm18-tr-08-merged.png'), fullPage: true, caret: 'initial' });
  });

  test('en: the same screens render in English', async ({ page }) => {
    const m = enMessages.m18;
    await signIn(page);
    const base = `/en/${WS}/musteri-hatti`;
    await page.goto(`${base}/leads`);
    await expect(page.getByRole('heading', { name: m.leads.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-01-leads.png'), fullPage: true, caret: 'initial' });
    await page.goto(`${base}/pipeline`);
    await expect(page.getByRole('heading', { name: m.pipeline.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-02-pipeline.png'), fullPage: true, caret: 'initial' });
    await page.goto(`${base}/tasks`);
    await expect(page.getByRole('heading', { name: m.tasks.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-03-tasks.png'), fullPage: true, caret: 'initial' });
    await page.goto(`${base}/import`);
    await expect(page.getByRole('heading', { name: m.import.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-04-import.png'), fullPage: true, caret: 'initial' });
    await page.goto(`${base}/duplicates`);
    await expect(page.getByRole('heading', { name: m.duplicates.heading })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'm18-en-05-duplicates.png'), fullPage: true, caret: 'initial' });
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
