import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { PartnerSearchClient, PARTNER_SEARCH_ALERT_SOURCE } from '../../src/lib/adapters/partner-search';
import { setPartnerSearchIngestionFlag } from '../../src/modules/m1/server/partner-search/flag';
import { runPartnerSearchIngestion } from '../../src/modules/m1/server/partner-search/ingestor';
import { requireId } from '../helpers/teardown-guard';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * FO-66 (PS-K7) acceptance criterion 3 in the browser: "an ingestion error raises an
 * admin alarm". The real ingestor runs in this test process against a fake portal that
 * answers with an off-contract row (schema drift); a platform admin then finds the
 * FAILED run on /tr/admin/partner-search, follows the "Açık alarm" link and opens the
 * drift alert on /tr/admin/alerts.
 *
 * The console's "Açık alarm" figure must be at least 1 (FO-326, FO-66 BUG-1): the
 * page counts PARTNER_SEARCH_ALERT_SOURCE, the same source the ingestor's alerts carry.
 */

const SHOTS = shotsDir('FO-66-partner-search-alarm');
const CALL = 'FO66-E2E-CALL';
const TOPIC = 'FO66-E2E-TOPIC';
const CCM2 = '966099';

const ADMIN = {
  userId: 'e2e-fo66-ps-alarm-admin',
  email: 'fo66-ps-alarm-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

/** SEDIA listing + one topicOrganisations answer whose only row has a date the contract refuses. */
const driftPortal = (async (url: string) => {
  const body = String(url).includes('api.tech.ec.europa.eu')
    ? { totalResults: 1, results: [{ metadata: { identifier: [TOPIC], ccm2Id: [CCM2] } }] }
    : {
        topicOrganizations: [
          {
            id: '669000001',
            requestDate: '19/10/2026',
            organisationName: '<masked-org-e2e>',
            organisationType: 'Research Organisation',
            country: 'DE',
            pic: '669000001',
            summary: 'FO66 e2e',
            expertise: 'Expertise_offer',
            interestStatus: 'Published',
            topicIdentifier: TOPIC,
            type: 'ORGANISATION',
          },
        ],
        topicOrganisationsWithdraw: { count: 0 },
        topicPersonsWithdraw: { count: 0 },
      };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as unknown as typeof fetch;

test.describe.serial('partner search — an ingestion error reaches the admin (FO-66 criterion 3)', () => {
  let runId: string | undefined;
  let alertId: string | undefined;

  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
    await prisma.programme.upsert({
      where: { id: 'HE' },
      update: {},
      create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'he' },
    });
    const call = await prisma.call.upsert({
      where: { callIdentifier: CALL },
      update: {},
      create: { callIdentifier: CALL, title: 'FO66 e2e call', programmeId: 'HE' },
    });
    await prisma.topic.upsert({
      where: { identifier: TOPIC },
      update: { status: 'OPEN' },
      create: {
        identifier: TOPIC,
        callId: call.id,
        title: 'FO66 e2e topic',
        status: 'OPEN',
        deadlines: [],
        eligibility: {},
        keywords: [],
      },
    });

    await setPartnerSearchIngestionFlag(prisma, true, ADMIN.userId);
    const outcome = await runPartnerSearchIngestion({
      trigger: 'MANUAL',
      topicIdentifiers: [TOPIC],
      client: new PartnerSearchClient({ fetchImpl: driftPortal, sleep: async () => {}, minIntervalMs: 0 }),
    });
    await setPartnerSearchIngestionFlag(prisma, false, ADMIN.userId);
    if (outcome.kind !== 'done' || outcome.status !== 'FAILED') {
      throw new Error(`expected a FAILED run, got ${JSON.stringify(outcome)}`);
    }
    runId = outcome.runId;
    const alert = await prisma.systemAlert.findFirst({
      where: { source: PARTNER_SEARCH_ALERT_SOURCE, resolvedAt: null, message: { contains: 'API schema change detected' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    alertId = alert?.id;
  });

  test.afterAll(async () => {
    await setPartnerSearchIngestionFlag(prisma, false, ADMIN.userId);
    if (alertId) await prisma.systemAlert.deleteMany({ where: { id: requireId(alertId, 'alertId') } });
    if (runId) await prisma.partnerSearchIngestionRun.deleteMany({ where: { id: requireId(runId, 'runId') } });
    await prisma.rawFetch.deleteMany({ where: { source: 'partner_search', key: TOPIC } });
    await prisma.topic.deleteMany({ where: { identifier: TOPIC } });
    await prisma.call.deleteMany({ where: { callIdentifier: CALL } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test('the FAILED run is on the console, and the drift alert opens on /admin/alerts', async ({ page, baseURL }, info) => {
    expect(alertId, 'the run raised no open SystemAlert').toBeTruthy();
    const id = requireId(alertId, 'alertId');
    const run = requireId(runId, 'runId');

    await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL as string);
    await page.goto('/tr/admin/partner-search');
    await expect(page.getByRole('heading', { level: 1, name: 'Partner Search veri alımı' })).toBeVisible();
    const runRow = page.getByTestId(`ps-run-${run}`);
    await expect(runRow).toBeVisible();
    await expect(runRow).toContainText('Elle'); // trigger MANUAL
    await expect(runRow).toContainText('Başarısız'); // status FAILED
    await page.screenshot({ path: `${SHOTS}/01-tr-console-failed-run.png`, fullPage: true });

    // FO-326: the console figure counts the open ingestion alarm (was 0, FO-66 BUG-1).
    const figure = page.locator('dt', { hasText: 'Açık alarm' }).locator('xpath=following-sibling::dd[1]').getByRole('link');
    await expect(figure).toHaveText(/^[1-9]\d*$/);
    info.annotations.push({ type: 'console open alarm count', description: (await figure.textContent())?.trim() ?? '' });
    await page.screenshot({ path: `${SHOTS}/01b-tr-console-alarm-count.png`, fullPage: true });
    await figure.click();
    await expect(page).toHaveURL(/\/tr\/admin\/alerts/);

    // Narrow the console to the ingestor's source with its own filter.
    await page.locator('select:has(option[value="partner_search_adapter"])').selectOption('partner_search_adapter');
    const row = page.getByRole('row', { name: /partner_search_adapter API schema change detected for partner_search/ });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Uyarı'); // level warn
    await expect(row).toContainText('Açık'); // unresolved
    const message = row.getByRole('button', { name: /API schema change detected for partner_search/ });
    await message.click();
    await expect(message).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#alert-detail-${id}`)).toContainText('requestDate');
    await page.screenshot({ path: `${SHOTS}/02-tr-alerts-drift-open.png`, fullPage: true });

    // Keyboard: the message is a real button, reachable and togglable without a mouse.
    await message.focus();
    await page.keyboard.press('Enter');
    await expect(message).toHaveAttribute('aria-expanded', 'false');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(message).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-tr-alerts-390.png`, fullPage: true });
  });

  /**
   * FO-327: a FAILED run must show its reason in "Hata kaydı" (run.error, not null).
   * The toggle is opened and closed with a real click and a real Enter key press.
   */
  test('FO-327: the run row "Hata kaydı" opens with a click and closes with Enter', async ({ page, baseURL }) => {
    const shots = shotsDir('FO-327-partner-search-run-error');
    const run = requireId(runId, 'runId');

    await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL as string);
    await page.goto('/tr/admin/partner-search');
    const runRow = page.getByTestId(`ps-run-${run}`);
    await expect(runRow).toBeVisible();
    const toggle = runRow.locator(`button[aria-controls="ps-run-error-${run}"]`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: `${shots}/01-run-error-collapsed.png`, fullPage: true });

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = page.locator(`#ps-run-error-${run}`);
    await expect(detail).toContainText('schema drift');
    await page.screenshot({ path: `${shots}/02-run-error-open.png`, fullPage: true });

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(detail).toHaveCount(0);
    await page.screenshot({ path: `${shots}/03-run-error-closed.png`, fullPage: true });
  });
});
