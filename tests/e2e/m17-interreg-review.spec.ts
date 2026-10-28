import { readFileSync } from 'node:fs';

import { test, expect, type Page } from '@playwright/test';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { prisma } from '../../src/lib/db';
import { isComingSoon } from '../../src/lib/modules/state-machine';
import type { InterregResultView } from '../../src/modules/m17/result-view';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import { expectHydrated } from './fixtures/hydration';

/**
 * M17 Interreg pre-assessment screen (FO-189) — the happy path a user walks:
 * drop the call guide, choose the project file, see both badges, check, read the
 * four-section report, download it, reset.
 *
 * The uploads are real: they go through POST …/documents, are extracted and land in
 * InterregAnalysis rows of this spec's own tenant. Only the LLM run is faked — the
 * `evaluate` route (FO-188) answers a fixed InterregResultView here, so the spec
 * spends no credits and does not depend on a provider key.
 *
 * Own tenant on `pro` with M17 switched ON; deleting the tenant at the end
 * cascades to its analyses.
 *
 * While M17 is `soon` every gate refuses it before plan or ModuleState are read
 * (`decideModuleAccess`), so no seed can reach the screen and none should: the
 * screen ships dark and opens with its own commit (statusBadge 'beta' + the Pro/Ultra
 * grant, held until FO-188 and the credit price). Which half of this spec runs is
 * read from the manifest, not a flag: `soon` → the gate is proved shut, page and
 * API; open → the happy path. The day the module opens, the same file walks it.
 */
const M17_OPEN = !isComingSoon('M17');

const SHOTS = shotsDir('TASK-MVRIW2N3NG7BD-evidence');
const TENANT = 'e2e-m17-tenant';
const WORKSPACE_ID = 'e2e-m17-ws';
const WORKSPACE = 'm17-e2e';
const USER_ID = 'e2e-m17-owner';
const EMAIL = 'm17-owner@e2e.fabrika.test';

const CALL_MD = [
  '# Interreg NEXT Black Sea Basin — Call for proposals',
  '',
  'Priority 1.1: innovation and SME competitiveness. Applications must name at least',
  'two partners from two participating countries and report against RCO87.',
  'Eligible applicants are public bodies, universities and non-profit organisations',
  'established in the programme area. Each project lasts between 18 and 30 months.',
].join('\n');
const PROJECT_TXT = [
  'BLUEFISH — cross-border fisheries innovation',
  '',
  'Partners: Samsun Municipality (TR), Constanta County (RO).',
  'Objective: a shared cold chain for small-scale fishers.',
  'Work package 1 maps the landing sites on both coasts; work package 2 builds two',
  'pilot cold stores; work package 3 trains one hundred fishers to use them and',
  'measures the catch that no longer spoils before it reaches the market.',
].join('\n');
// The server refuses a file with under 200 letters as "no readable text" (rag-upload).
// Both texts stay above that, or the spec would measure the refusal instead.

const REPORT = [
  '> İç ön değerlendirme — resmî puan değildir.',
  '',
  '## 📊 Özet',
  '',
  '**Tahmini: 62/100** (≈37/60) — iç ön değerlendirme',
  '',
  '| No. | Kriter | Not |',
  '|---|---|---:|',
  '| 1.1 | Program hedefi | 3/5 |',
  '| 1.2 | Katma değer | 1/5 |',
  '',
  '## 🔴 Kritik',
  '',
  '- **Bulgu:** RCO87 göstergesi yok',
  '  - **Neden sorun?:** çağrı zorunlu tutuyor',
  '  - **Çözüm önerisi:** çıktı tablosuna ekleyin',
  '',
  '## 🟡 Geliştir',
  '',
  '### 1.1 Program hedefi — 3',
  '- Zayıf yön: hedef grubun büyüklüğü belirsiz',
  '',
  '## ✍️ Yeniden yazım',
  '',
  '**Özgün metin** (s. 1)',
  '',
  '> a shared cold chain',
].join('\n');

function fakeResult(analysisId: string): InterregResultView {
  return {
    analysisId,
    assessmentKind: 'internal_pre_assessment',
    rubricId: 'bsb',
    rawScore: 37,
    maxRaw: 60,
    score100: 62,
    passesThresholds: false,
    knockouts: ['1.2'],
    reportMarkdown: REPORT,
  };
}

/** Answer `evaluate` with the fixed result, after a pause long enough to see the spinner. */
async function fakeEvaluate(page: Page, answer: 'ok' | 'fail' = 'ok') {
  await page.route('**/api/interreg-review/analyses/*/evaluate', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2) ?? '';
    await new Promise((r) => setTimeout(r, 800));
    if (answer === 'fail') {
      await route.fulfill({ status: 502, json: { error: 'evaluation_failed' } });
      return;
    }
    await route.fulfill({ status: 200, json: { result: fakeResult(id) } });
  });
}

async function dropFile(page: Page, testId: string, name: string, body: string, type: string) {
  const transfer = await page.evaluateHandle(
    ({ name, body, type }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([body], name, { type }));
      return dt;
    },
    { name, body, type },
  );
  const zone = page.getByTestId(testId);
  await zone.dispatchEvent('dragover', { dataTransfer: transfer });
  await zone.dispatchEvent('drop', { dataTransfer: transfer });
}

async function open(page: Page, locale: 'tr' | 'en', baseURL: string) {
  await signInAs(page, { id: USER_ID, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' }, baseURL);
  await page.goto(`/${locale}/${WORKSPACE}/modules/interreg-review`);
  await expectHydrated(page.getByTestId('m17-choose-call'));
}

async function seedTenant() {
  await prisma.tenant.upsert({
    where: { id: TENANT },
    create: { id: TENANT, name: 'm17 e2e (internal)', slug: TENANT, country: 'TR', orgType: 'SME' },
    update: {},
  });
  await prisma.subscription.upsert({
    where: { tenantId: TENANT },
    create: { tenantId: TENANT, planId: 'pro', status: 'ACTIVE' },
    update: { planId: 'pro', status: 'ACTIVE', planVersionId: null },
  });
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M17' } },
    create: { tenantId: TENANT, moduleId: 'M17', status: 'ON', changedBy: 'm17 e2e fixture' },
    update: { status: 'ON' },
  });
  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    create: { id: WORKSPACE_ID, tenantId: TENANT, name: 'm17 e2e', slug: WORKSPACE },
    update: { slug: WORKSPACE },
  });
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, email: EMAIL, name: 'M17 E2E', locale: 'tr' },
    update: { email: EMAIL },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: TENANT, userId: USER_ID } },
    create: { tenantId: TENANT, userId: USER_ID, role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
    update: { role: 'TENANT_OWNER', workspaceIds: [WORKSPACE_ID] },
  });
}

async function removeTenant() {
  await prisma.interregAnalysis.deleteMany({ where: { tenantId: 'e2e-m17-tenant' } });
  await prisma.membership.deleteMany({ where: { tenantId: 'e2e-m17-tenant' } });
  await prisma.moduleState.deleteMany({ where: { tenantId: 'e2e-m17-tenant' } });
  await prisma.subscription.deleteMany({ where: { tenantId: 'e2e-m17-tenant' } });
  await prisma.workspace.deleteMany({ where: { tenantId: 'e2e-m17-tenant' } });
  await prisma.user.deleteMany({ where: { id: 'e2e-m17-owner' } });
  await prisma.tenant.deleteMany({ where: { id: 'e2e-m17-tenant' } });
  await prisma.$disconnect();
}

test.describe('M17 while `soon`: the screen ships dark (FO-189)', () => {
  test.skip(M17_OPEN, 'M17 is open: the happy path below covers it');
  test.beforeAll(seedTenant);
  test.afterAll(removeTenant);

  for (const [locale, messages] of [
    ['tr', trMessages],
    ['en', enMessages],
  ] as const) {
    test(`${locale}: a Pro tenant with M17 ON gets the coming-soon page, and the API refuses`, async ({
      page,
      baseURL,
    }) => {
      await signInAs(page, { id: USER_ID, email: EMAIL, tenantId: TENANT, role: 'TENANT_OWNER' }, baseURL as string);
      await page.goto(`/${locale}/${WORKSPACE}/modules/interreg-review`);
      await expect(page.getByTestId('module-coming-soon')).toContainText(messages.modules['interreg-review'].name);
      await expect(page.getByTestId('m17-review')).toHaveCount(0);

      // The page is not the only door: the API answers the same, and writes nothing.
      for (const res of [
        await page.request.get('/api/interreg-review/analyses'),
        await page.request.post('/api/interreg-review/analyses'),
      ]) {
        expect(res.status()).toBe(403);
        expect(await res.json()).toEqual({ error: 'module_unavailable', reason: 'COMING_SOON' });
      }
      expect(await prisma.interregAnalysis.count({ where: { tenantId: TENANT } })).toBe(0);
    });
  }
});

test.describe('M17 Interreg pre-assessment (FO-189)', () => {
  test.skip(!M17_OPEN, 'M17 is `soon`: the screen opens with fe-fb/fo189-m17-beta-open');
  test.beforeAll(seedTenant);
  test.afterAll(removeTenant);

  test.beforeEach(async () => {
    await prisma.interregAnalysis.deleteMany({ where: { tenantId: 'e2e-m17-tenant' } });
  });

  for (const [locale, messages] of [
    ['tr', trMessages],
    ['en', enMessages],
  ] as const) {
    test(`${locale}: upload both files, check, read, download, reset`, async ({ page, baseURL }) => {
      const ui = messages.InterregReview.ui;
      await fakeEvaluate(page);
      await open(page, locale, baseURL as string);

      // The notice is on the screen before anything else happens.
      await expect(page.getByTestId('m17-notice').first()).toHaveText(messages.InterregReview.assessmentNotice);
      // Nothing uploaded yet: the check cannot start and says why.
      const check = page.getByTestId('m17-check');
      await expect(check).toBeDisabled();
      await expect(page.getByText(ui.checkHint)).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/01-empty-${locale}.png`, fullPage: true });

      // Step 1 by drag and drop.
      await dropFile(page, 'm17-drop-call', 'call-guide.md', CALL_MD, 'text/markdown');
      await expect(page.getByTestId('m17-badge-call')).toContainText(ui.callReady);
      await expect(page.getByTestId('m17-badge-call')).toContainText('call-guide.md');
      await expect(check).toBeDisabled();

      // Step 2 through the visible button and the OS file chooser.
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('m17-choose-project').click();
      await (await chooser).setFiles({ name: 'project.txt', mimeType: 'text/plain', buffer: Buffer.from(PROJECT_TXT) });
      await expect(page.getByTestId('m17-badge-project')).toContainText(ui.projectReady);
      await expect(page.getByTestId('m17-live')).toHaveText(ui.projectReady);
      await expect(check).toBeEnabled();
      await page.screenshot({ path: `${SHOTS}/02-both-ready-${locale}.png`, fullPage: true });

      // The run: spinner and status text while it lasts.
      await check.click();
      await expect(page.getByTestId('m17-analyzing')).toContainText(ui.analyzing);
      await expect(check).toBeDisabled();
      await page.screenshot({ path: `${SHOTS}/03-analyzing-${locale}.png`, fullPage: true });

      // The report: score card, the four sections, the notice next to the score.
      const report = page.getByTestId('m17-report');
      await expect(report).toBeVisible();
      await expect(page.getByTestId('m17-analyzing')).toHaveCount(0);
      await expect(page.getByTestId('m17-score')).toContainText('62/100');
      await expect(page.getByTestId('m17-score')).toContainText('37');
      await expect(page.getByTestId('m17-threshold')).toHaveText(ui.belowThreshold);
      await expect(report.getByTestId('m17-notice')).toHaveText(messages.InterregReview.assessmentNotice);
      await expect(report.getByTestId('m17-section')).toHaveCount(4);
      await expect(report.getByRole('heading', { level: 3 })).toHaveText([
        '📊 Özet',
        '🔴 Kritik',
        '🟡 Geliştir',
        '✍️ Yeniden yazım',
      ]);
      await expect(report.getByRole('table')).toContainText('Katma değer');
      // Focus moved to the report heading for keyboard and screen-reader users.
      await expect(page.locator('#m17-report-title')).toBeFocused();
      // The app scrolls inside <main>, so a full-page shot stops at the viewport: a tall
      // viewport shows the whole report instead.
      await page.setViewportSize({ width: 1280, height: 2300 });
      await page.screenshot({ path: `${SHOTS}/04-report-${locale}.png` });

      // 390 px: one column, equal-width buttons, nothing wider than <main> (the score
      // table scrolls inside its own box).
      await page.setViewportSize({ width: 390, height: 3400 });
      await expect(page.getByTestId('m17-check')).toBeVisible();
      const main = page.getByRole('main');
      expect(await main.evaluate((el) => el.scrollWidth - el.clientWidth), 'main overflow at 390px').toBe(0);
      const widths = await page
        .locator('[data-testid="m17-check"], [data-testid="m17-download"], [data-testid="m17-reset"], [data-testid="m17-choose-call"]')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
      expect(new Set(widths).size, `button widths ${widths.join(', ')}`).toBe(1);
      await page.screenshot({ path: `${SHOTS}/05-mobile-${locale}.png` });

      // Dark theme: the module's own tokens switch with the app's `.dark` class.
      await page.setViewportSize({ width: 1280, height: 2300 });
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      });
      // The zones and buttons carry `transition-colors`: wait until they reach the dark token.
      await expect(page.getByTestId('m17-drop-call')).toHaveCSS('background-color', 'rgba(236, 72, 153, 0.1)');
      await expect(page.getByTestId('m17-check')).toHaveCSS('background-color', 'rgb(29, 78, 216)');
      await page.screenshot({ path: `${SHOTS}/06-dark-${locale}.png` });
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      });
      await page.setViewportSize({ width: 1280, height: 720 });

      // Download hands over the report Markdown as it came.
      const download = page.waitForEvent('download');
      await page.getByTestId('m17-download').click();
      const file = await download;
      expect(file.suggestedFilename()).toBe(`${ui.downloadName}.md`);
      expect(readFileSync((await file.path())!, 'utf8')).toBe(REPORT);

      // Reset asks first (a report exists), then empties the screen and the row.
      page.once('dialog', (d) => {
        expect(d.message()).toBe(ui.resetConfirm);
        void d.accept();
      });
      await page.getByTestId('m17-reset').click();
      await expect(page.getByTestId('m17-report')).toHaveCount(0);
      await expect(page.getByTestId('m17-badge-call')).toHaveCount(0);
      await expect(page.getByTestId('m17-badge-project')).toHaveCount(0);
      await expect(check).toBeDisabled();
      await expect.poll(() => prisma.interregAnalysis.count({ where: { tenantId: 'e2e-m17-tenant' } })).toBe(0);
    });
  }

  test('a refresh keeps the files; a failed run says so and leaves the check available', async ({ page, baseURL }) => {
    const ui = trMessages.InterregReview.ui;
    await fakeEvaluate(page, 'fail');
    await open(page, 'tr', baseURL as string);

    await dropFile(page, 'm17-drop-call', 'call-guide.md', CALL_MD, 'text/markdown');
    await expect(page.getByTestId('m17-badge-call')).toBeVisible();
    await page.getByTestId('m17-input-project').setInputFiles({
      name: 'project.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(PROJECT_TXT),
    });
    await expect(page.getByTestId('m17-badge-project')).toBeVisible();

    await page.reload();
    await expectHydrated(page.getByTestId('m17-choose-call'));
    await expect(page.getByTestId('m17-badge-call')).toContainText('call-guide.md');
    await expect(page.getByTestId('m17-badge-project')).toContainText('project.txt');

    await page.getByTestId('m17-check').click();
    const error = page.getByTestId('m17-action-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    // The FO-188 message when its keys are in the catalog, the generic one before that.
    const known = (trMessages.InterregReview.errors as Record<string, string>).evaluation_failed;
    await expect(error).toHaveText(known ?? ui.genericError);
    await expect(page.getByTestId('m17-check')).toBeEnabled();
    await expect(page.getByTestId('m17-report')).toHaveCount(0);

    // No report, but the files are the user's: Reset asks first, and "cancel" keeps them.
    page.once('dialog', (d) => {
      expect(d.message()).toBe(ui.resetConfirmFiles);
      void d.dismiss();
    });
    await page.getByTestId('m17-reset').click();
    await expect(page.getByTestId('m17-badge-call')).toContainText('call-guide.md');
    expect(await prisma.interregAnalysis.count({ where: { tenantId: TENANT } })).toBe(1);
  });

  test('keyboard: Tab skips the hidden input, Enter opens the chooser; a wrong type is refused', async ({
    page,
    baseURL,
  }) => {
    await open(page, 'en', baseURL as string);
    await page.getByTestId('m17-choose-call').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('m17-choose-project')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('m17-choose-call')).toBeFocused();

    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await chooser).setFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not really a png'),
    });
    await expect(page.getByTestId('m17-error-call')).toHaveText(enMessages.InterregReview.errors.unsupported_type);
    await expect(page.getByTestId('m17-badge-call')).toHaveCount(0);
  });
});
