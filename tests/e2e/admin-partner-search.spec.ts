import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { matchKeyFor } from '../../src/modules/m1/server/partner-search/match-pic';
import { setPartnerSearchIngestionFlag } from '../../src/modules/m1/server/partner-search/flag';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * FO-64 / PS-K6 — the Partner Search ingestion console, driven by real clicks in
 * /tr/admin/partner-search and checked from Postgres by this test process:
 * the flag write (and its audit row), "run now" queueing the job, and the manual
 * PIC link of an unmatched organisation (resolvedPic, the announcement link, the
 * CORDIS flags, the audit row).
 *
 * The flag is a platform-wide row, so the spec turns it off again in afterAll.
 * Rows are keyed by a per-run suffix, so the spec is safe to repeat.
 */

const SHOTS = shotsDir('TASK-MVCH39NTKKJGT-partner-search');
const RUN = Math.random().toString(36).slice(2, 8);
const ORG_NAME = `E2E Partner Org ${RUN}`;
const COUNTRY = 'DE';
const PIC = `9990${Math.floor(10000 + Math.random() * 89999)}`;
const UNKNOWN_PIC = '111000111';

const ADMIN = {
  userId: 'e2e-partner-search-admin',
  email: 'partner-search-admin@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

async function signInAsPlatformAdmin(page: Page, baseURL: string): Promise<void> {
  await signInAs(page, { id: ADMIN.userId, email: ADMIN.email, tenantId: ADMIN.tenantId, role: ADMIN.role }, baseURL);
}

test.describe.serial('admin partner search — ingestion console', () => {
  let unmatchedId = '';

  test.beforeAll(async () => {
    await seedIdentity({ ...ADMIN, workspaceIds: [], isPlatformAdmin: true });
    await setPartnerSearchIngestionFlag(prisma, false, ADMIN.userId);
    const topic = await prisma.topic.findFirst({ where: { status: { in: ['OPEN', 'FORTHCOMING'] } } });
    if (!topic) throw new Error('seed has no OPEN/FORTHCOMING topic');
    const matchKey = matchKeyFor({ name: ORG_NAME, country: COUNTRY });
    if (!matchKey) throw new Error('no match key');

    await prisma.cordisOrganization.create({ data: { organisationId: PIC, name: ORG_NAME.toUpperCase(), country: COUNTRY } });
    await prisma.partnerSearchAnnouncement.create({
      data: {
        externalId: `e2e-fo64-${RUN}`,
        topicIdentifier: topic.identifier,
        type: 'EXPERTISE_OFFER',
        lastSeenAt: new Date(),
        organizationName: ORG_NAME,
        country: COUNTRY,
        source: 'PORTAL_API',
      },
    });
    const row = await prisma.unmatchedOrganization.create({
      data: { matchKey, name: ORG_NAME, country: COUNTRY, lastSeenAt: new Date() },
    });
    unmatchedId = row.id;
  });

  test.afterAll(async () => {
    await setPartnerSearchIngestionFlag(prisma, false, ADMIN.userId);
    await prisma.partnerSearchAnnouncement.deleteMany({ where: { externalId: { startsWith: 'e2e-fo64-' } } });
    await prisma.unmatchedOrganization.deleteMany({ where: { name: { startsWith: 'E2E Partner Org ' } } });
    await prisma.cordisOrganization.deleteMany({ where: { name: { startsWith: 'E2E PARTNER ORG ' } } });
    await cleanupIdentity([ADMIN.userId]);
    await prisma.$disconnect();
  });

  test('flag off: run now is disabled; turning the flag on asks first, writes it and audits it', async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.goto('/tr/admin/partner-search');

    await expect(page.getByRole('heading', { level: 1, name: 'Partner Search veri alımı' })).toBeVisible();
    await expect(page.getByTestId('ps-flag-state')).toHaveText('KAPALI');
    await expect(page.getByTestId('ps-run-now')).toBeDisabled();
    await expect(page.getByRole('radio', { name: /HTML/ })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Hibrit/ })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/01-tr-flag-off.png`, fullPage: true });

    await page.getByTestId('ps-flag-toggle').click();
    // Turning it on is a two-step action; cancel leaves the flag alone.
    await page.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.getByTestId('ps-flag-state')).toHaveText('KAPALI');

    const since = new Date();
    await page.getByTestId('ps-flag-toggle').click();
    await page.getByTestId('ps-flag-confirm').click();
    await expect(page.getByTestId('ps-notice')).toHaveText('Alım bayrağı açıldı.');
    await expect(page.getByTestId('ps-flag-state')).toHaveText('AÇIK');
    await expect(page.getByTestId('ps-run-now')).toBeEnabled();

    const setting = await prisma.platformSetting.findUnique({ where: { key: 'partner_search_ingestion_enabled' } });
    expect(setting?.value).toBe(true);
    const audit = await withSystemScope('platform-admin', 'e2e.partner-search.read-audit', (tx) =>
      tx.auditEvent.findFirst({ where: { type: 'platform.setting.changed', actorId: ADMIN.userId, createdAt: { gte: since } } })
    );
    expect(audit).not.toBeNull();
  });

  test('run now queues the job and audits the request', async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.goto('/tr/admin/partner-search');
    const since = new Date();
    await page.getByTestId('ps-run-now').click();
    await expect(page.getByTestId('ps-notice')).toContainText(/kuyruğa eklendi|zaten kuyrukta/);

    const audit = await withSystemScope('platform-admin', 'e2e.partner-search.read-audit', (tx) =>
      tx.auditEvent.findFirst({
        where: { type: 'partner_search.run.requested', actorId: ADMIN.userId, createdAt: { gte: since } },
      })
    );
    expect(audit).not.toBeNull();
    await page.screenshot({ path: `${SHOTS}/02-tr-run-queued.png`, fullPage: true });
  });

  test('a bad or unknown PIC is refused on the row and writes nothing', async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.goto('/tr/admin/partner-search');
    const row = page.getByTestId(`ps-unmatched-${unmatchedId}`);
    const input = row.getByLabel(`${ORG_NAME} için CORDIS PIC`);

    await input.fill('abc');
    await row.getByRole('button', { name: 'Eşle' }).click();
    await expect(row.getByText('PIC yalnız rakamlardan oluşmalı (genelde 9 hane).')).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    await input.fill(UNKNOWN_PIC);
    await input.press('Enter');
    await expect(row.getByText('Bu PIC ile CORDIS kuruluşu bulunamadı.')).toBeVisible();

    const unmatched = await prisma.unmatchedOrganization.findUnique({ where: { id: unmatchedId } });
    expect(unmatched?.resolvedPic).toBeNull();
  });

  test('manual PIC link: resolvedPic, announcement linked, CORDIS flags, audit row', async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.goto('/tr/admin/partner-search');
    const row = page.getByTestId(`ps-unmatched-${unmatchedId}`);
    await row.getByLabel(`${ORG_NAME} için CORDIS PIC`).fill(PIC);
    await page.screenshot({ path: `${SHOTS}/03-tr-before-link.png`, fullPage: true });
    await row.getByRole('button', { name: 'Eşle' }).click();

    await expect(page.getByTestId('ps-notice')).toHaveText(`${ORG_NAME} → PIC ${PIC} eşlendi; 1 ilan bağlandı.`);
    await expect(page.getByTestId(`ps-unmatched-${unmatchedId}`)).toHaveCount(0);
    await page.getByText(/Son eşlenenler/).click();
    await expect(page.getByTestId('ps-resolved-list')).toContainText(PIC);
    await page.screenshot({ path: `${SHOTS}/04-tr-after-link.png`, fullPage: true });

    const unmatched = await prisma.unmatchedOrganization.findUnique({ where: { id: unmatchedId } });
    expect(unmatched?.resolvedPic).toBe(PIC);
    const ann = await prisma.partnerSearchAnnouncement.findUnique({ where: { externalId: `e2e-fo64-${RUN}` } });
    expect(ann?.organizationPic).toBe(PIC);
    const org = await prisma.cordisOrganization.findUnique({ where: { organisationId: PIC } });
    expect(org?.hasActiveAnnouncements).toBe(true);
    const audit = await withSystemScope('platform-admin', 'e2e.partner-search.read-audit', (tx) =>
      tx.auditEvent.findFirst({ where: { type: 'partner_search.unmatched.resolved', target: unmatchedId } })
    );
    expect(audit?.actorId).toBe(ADMIN.userId);
    expect(audit?.data).toMatchObject({ resolvedPic: PIC, linkedAnnouncements: 1 });
  });

  test('en locale and a 390px phone: no horizontal page scroll', async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/admin/partner-search');
    await expect(page.getByRole('heading', { level: 1, name: 'Partner Search ingestion' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/05-en-mobile-390.png`, fullPage: true });
  });
});
