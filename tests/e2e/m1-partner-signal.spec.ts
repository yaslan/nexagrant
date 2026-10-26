import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { presentIds } from '../helpers/teardown-guard';
import { signInAs } from './fixtures/session';
import { expectHydrated } from './fixtures/hydration';

/**
 * FO-62 (TASK-MVCH2YSRRM28N) — the Partner Search UI over the FO-61 endpoints,
 * in a real browser against a real database.
 *
 * Two tenants of this spec's own:
 *   pro       M1 + M4 on, unlimited: the call's Partner Signal box, its list and
 *             filters, the M1 "active announcement" badge, the live tab, the
 *             profile section.
 *   basic+M1  Basic with an M1 add-on: M1 open but metered (10 a month). Opening
 *             and reloading the M1 table must not spend a query (review B1):
 *             the badges are not rendered, so nothing is asked.
 *   discover  the free plan (metered, 10 list queries a month), this month already
 *             spent: the box still counts (the signal is never metered), the list
 *             answers "10/10 used — upgrade", and the M1 pages stay locked.
 *
 * The topic, its 14 announcements and the one CORDIS organisation are fixture
 * rows with their own ids, removed afterwards.
 */

const SHOTS = shotsDir('TASK-MVCH2YSRRM28N-screenshots');

const PROGRAMME = 'FO62E2E';
const CALL = 'fo62-e2e-call';
const TOPIC = 'FO62-E2E-TOPIC-01';
const PIC = '906200001';
const ORG_NAME = 'FO62 E2E Badge University';

const PRO = {
  tenantId: 'fo62-e2e-pro',
  workspaceId: 'fo62-e2e-pro-ws',
  workspace: 'fo62-pro',
  userId: 'fo62-e2e-pro-user',
  email: 'fo62-pro@e2e.fonbridge.test',
};
const DISCOVER = {
  tenantId: 'fo62-e2e-discover',
  workspaceId: 'fo62-e2e-discover-ws',
  workspace: 'fo62-discover',
  userId: 'fo62-e2e-discover-user',
  email: 'fo62-discover@e2e.fonbridge.test',
};

const BASIC = {
  tenantId: 'fo62-e2e-basic',
  workspaceId: 'fo62-e2e-basic-ws',
  workspace: 'fo62-basic',
  userId: 'fo62-e2e-basic-user',
  email: 'fo62-basic@e2e.fonbridge.test',
};
/** A fixture add-on granting M1, as a contract add-on on Basic would. */
const M1_ADDON = 'fo62-e2e-addon-m1';

const DAY = 24 * 60 * 60 * 1000;

/** 9 requests (3 Turkish, 5 this week) and 5 offers: the card's own example. */
function announcements(now: number) {
  const rows = [];
  for (let i = 0; i < 9; i++) {
    rows.push({
      externalId: `fo62-e2e-req-${i}`,
      type: 'EXPERTISE_REQUEST' as const,
      country: i < 3 ? 'TR' : 'DE',
      publishedAt: new Date(now - (i < 5 ? 1 + i * 0.2 : 30 + i) * DAY),
      organizationPic: i === 0 ? PIC : null,
      organizationName: i === 0 ? ORG_NAME : `FO62 E2E Seeker ${i}`,
      organizationType: i === 0 ? ('HES' as const) : ('PRC' as const),
      keywords: i === 0 ? ['Green hydrogen', 'Electrolysers'] : ['Batteries'],
    });
  }
  for (let i = 0; i < 5; i++) {
    rows.push({
      externalId: `fo62-e2e-off-${i}`,
      type: 'EXPERTISE_OFFER' as const,
      country: 'FR',
      publishedAt: new Date(now - (2 + i) * DAY),
      organizationPic: null,
      organizationName: `FO62 E2E Offerer ${i}`,
      organizationType: 'REC' as const,
      keywords: ['Fuel cells'],
    });
  }
  return rows.map((r) => ({
    ...r,
    topicIdentifier: TOPIC,
    description: `${r.organizationName} — fixture announcement, contact via the portal.`,
    lastSeenAt: new Date(now),
    source: 'PORTAL_API' as const,
  }));
}

const TENANTS = [PRO.tenantId, DISCOVER.tenantId, BASIC.tenantId];
const USERS = [PRO.userId, DISCOVER.userId, BASIC.userId];

async function rollback() {
  await prisma.partnerSearchAnnouncement.deleteMany({ where: { topicIdentifier: 'FO62-E2E-TOPIC-01' } });
  await prisma.topic.deleteMany({ where: { identifier: 'FO62-E2E-TOPIC-01' } });
  await prisma.call.deleteMany({ where: { id: 'fo62-e2e-call' } });
  await prisma.programme.deleteMany({ where: { id: 'FO62E2E' } });
  await prisma.cordisOrganization.deleteMany({ where: { organisationId: '906200001' } });
  await prisma.partnerSearchQuotaUsage.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await prisma.relationship.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await prisma.addOn.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await prisma.moduleState.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await prisma.workspace.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await prisma.user.deleteMany({ where: { id: { in: presentIds(USERS) } } });
  await prisma.tenant.deleteMany({ where: { id: { in: presentIds(TENANTS) } } });
  await prisma.addOnCatalog.deleteMany({ where: { sku: 'fo62-e2e-addon-m1' } });
}

async function seedTenant(t: typeof PRO, planId: string, modules: Record<string, 'ON'>) {
  await prisma.tenant.create({
    data: { id: t.tenantId, name: `FO-62 e2e ${planId} (internal)`, slug: t.tenantId, country: 'TR', orgType: 'SME' },
  });
  await prisma.subscription.create({ data: { tenantId: t.tenantId, planId, status: 'ACTIVE' } });
  for (const [moduleId, status] of Object.entries(modules)) {
    await prisma.moduleState.create({
      data: { tenantId: t.tenantId, moduleId, status, changedBy: 'fo62 e2e fixture' },
    });
  }
  await prisma.workspace.create({
    data: { id: t.workspaceId, tenantId: t.tenantId, name: `FO-62 ${planId}`, slug: t.workspace },
  });
  await prisma.user.create({ data: { id: t.userId, email: t.email, name: `FO-62 ${planId}`, locale: 'tr' } });
  await prisma.membership.create({
    data: { tenantId: t.tenantId, userId: t.userId, role: 'TENANT_OWNER', workspaceIds: [t.workspaceId] },
  });
}

async function seed() {
  await rollback();
  const now = Date.now();
  await prisma.programme.create({ data: { id: PROGRAMME, name: 'FO-62 e2e programme', sourceKey: 'fixture' } });
  await prisma.call.create({
    data: { id: CALL, programmeId: PROGRAMME, callIdentifier: 'FO62-E2E-CALL', title: 'FO-62 e2e call' },
  });
  await prisma.topic.create({
    data: {
      callId: CALL,
      identifier: TOPIC,
      title: 'FO-62 e2e topic: green hydrogen valleys',
      status: 'OPEN',
      deadlines: [],
      keywords: [],
    },
  });
  await prisma.cordisOrganization.create({
    data: { organisationId: PIC, name: ORG_NAME, country: 'TR', activityType: 'HES', isTurkish: true },
  });
  await prisma.partnerSearchAnnouncement.createMany({ data: announcements(now) });

  await seedTenant(PRO, 'pro', { M1: 'ON', M4: 'ON' });
  // Discover grants M1 in its limited form (FO-41): the module is on, metered.
  await seedTenant(DISCOVER, 'free', { M1: 'ON' });
  await prisma.addOnCatalog.create({
    data: { sku: M1_ADDON, name: 'FO-62 e2e M1 add-on', monthlyCents: 0, currency: 'EUR', grantsModule: 'M1' },
  });
  await seedTenant(BASIC, 'basic', { M1: 'ON' });
  await prisma.addOn.create({ data: { tenantId: BASIC.tenantId, sku: M1_ADDON } });
  await prisma.partnerSearchQuotaUsage.create({
    data: { tenantId: BASIC.tenantId, month: new Date(now).toISOString().slice(0, 7), count: 3 },
  });
  // This month's ten list queries are already spent.
  await prisma.partnerSearchQuotaUsage.create({
    data: { tenantId: DISCOVER.tenantId, month: new Date(now).toISOString().slice(0, 7), count: 10 },
  });
}

async function signIn(page: Page, t: typeof PRO, path: string) {
  await signInAs(page, { id: t.userId, email: t.email, tenantId: t.tenantId, role: 'TENANT_OWNER' });
  await page.goto(path);
  await page.waitForURL(`**${path.split('?')[0]}**`, { timeout: 30_000 });
}

test.describe('FO-62 Partner Search UI', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeAll(seed);
  test.afterAll(async () => {
    await rollback();
    await prisma.$disconnect();
  });

  test('pro (tr): partner signal box, list, filters, card actions', async ({ page }) => {
    await signIn(page, PRO, `/tr/${PRO.workspace}/cagrilar/${TOPIC}`);

    const box = page.getByTestId('partner-signal-box');
    await expect(box.getByRole('heading', { name: 'Partner Sinyali' })).toBeVisible();
    await expect(box.getByTestId('partner-signal-summary')).toHaveText(
      "Bu topic için 14 ilan: 9 partner arıyor, 5 uzmanlık sunuyor · 3 tanesi Türkiye'den"
    );
    await expect(box.getByTestId('ps-attribution')).toContainText('CC BY 4.0');

    const toggle = box.getByTestId('partner-signal-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Default filter: "Expertise request".
    await expect(box.getByTestId('ps-filter-type')).toHaveValue('EXPERTISE_REQUEST');
    await expect(box.getByTestId('ps-filter-tr')).not.toBeChecked();
    await expect(box.getByTestId('ps-filter-week')).not.toBeChecked();
    await expect(box.getByTestId('ps-result-count')).toHaveText('9 ilan');
    await expect(box.getByTestId('ps-announcement')).toHaveCount(9);
    // Unlimited plan: no quota line.
    await expect(box.getByTestId('ps-quota-usage')).toHaveCount(0);

    // The PIC-backed card: profile link (M1 on), portal link, M4 button.
    const first = box.getByTestId('ps-announcement').first();
    await expect(first.getByTestId('ps-org-link')).toHaveAttribute('href', `/tr/${PRO.workspace}/ortaklar/${PIC}`);
    await expect(first.getByTestId('ps-type-chip')).toHaveText('Partner arıyor');
    const portal = first.getByTestId('ps-open-portal');
    await expect(portal).toHaveAttribute('target', '_blank');
    await expect(portal).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(portal).toHaveAttribute('href', /^https:\/\/ec\.europa\.eu\/info\/funding-tenders\/.+fo62-e2e-topic-01$/);
    await box.screenshot({ path: `${SHOTS}/01-pro-call-signal-list-tr.png` });

    await first.getByTestId('ps-add-m4').click();
    await expect(first.getByTestId('ps-add-m4')).toHaveText("M4'e eklendi");
    const rel = await prisma.relationship.findFirst({ where: { tenantId: PRO.tenantId } });
    expect(rel).toMatchObject({ kind: 'partner', organizationId: PIC, counterpartName: ORG_NAME });

    // Turkish organisations only.
    await box.getByTestId('ps-filter-tr').check();
    await expect(box.getByTestId('ps-filter-country')).toBeDisabled();
    await box.getByTestId('ps-filter-apply').click();
    await expect(box.getByTestId('ps-result-count')).toHaveText('3 ilan');

    // This week only, all types, by keyboard.
    await box.getByTestId('ps-filter-reset').click();
    await expect(box.getByTestId('ps-result-count')).toHaveText('9 ilan');
    await box.getByTestId('ps-filter-week').check();
    await box.getByTestId('ps-filter-type').selectOption('');
    await box.getByTestId('ps-filter-q').focus();
    await page.keyboard.press('Enter');
    await expect(box.getByTestId('ps-result-count')).toHaveText('Bu hafta yayınlanan: 10 ilan');

    // Organisation type + search.
    await box.getByTestId('ps-filter-week').uncheck();
    await box.getByTestId('ps-filter-orgtype').selectOption('REC');
    await box.getByTestId('ps-filter-q').fill('Offerer 3');
    await box.getByTestId('ps-filter-apply').click();
    await expect(box.getByTestId('ps-result-count')).toHaveText('1 ilan');
    await expect(box.getByTestId('ps-type-chip')).toHaveText('Uzmanlık sunuyor');
  });

  test('pro (en): call box in English, M1 badge, live tab, profile section', async ({ page }) => {
    await signIn(page, PRO, `/en/${PRO.workspace}/calls/${TOPIC}`);
    await expect(page.getByTestId('partner-signal-summary')).toHaveText(
      '14 announcements for this topic: 9 looking for partners, 5 offering expertise · 3 from Türkiye'
    );
    await page.getByTestId('partner-signal-toggle').click();
    await expect(page.getByTestId('ps-result-count')).toHaveText('9 announcements');
    await page.getByTestId('partner-signal-box').screenshot({ path: `${SHOTS}/02-pro-call-signal-list-en.png` });

    await page.goto(`/en/${PRO.workspace}/partners?q=${encodeURIComponent(ORG_NAME)}`);
    const row = page.locator('tr', { hasText: ORG_NAME });
    await expect(row.getByTestId('ps-active-badge')).toHaveText('Active announcement (1)');
    await page.screenshot({ path: `${SHOTS}/03-pro-m1-badge-en.png`, fullPage: true });

    await page.getByTestId('partners-tab-live').click();
    await expect(page).toHaveURL(/\?tab=live$/);
    await expect(page.getByTestId('partners-tab-live')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('ps-filter-type')).toHaveValue('EXPERTISE_REQUEST');
    await expect(page.getByTestId('ps-announcement').first()).toBeVisible();
    await expect(page.getByTestId('ps-attribution')).toContainText('CC BY 4.0');
    await page.getByTestId('partners-live').screenshot({ path: `${SHOTS}/03b-pro-m1-live-tab-en.png` });

    await page.goto(`/en/${PRO.workspace}/partners/${PIC}`);
    const section = page.getByTestId('org-announcements');
    await expect(section.getByRole('heading', { name: /Published announcements/ })).toBeVisible();
    await expect(section.getByTestId('ps-announcement')).toHaveCount(1);
    await expect(section.getByTestId('org-announcement-keywords')).toContainText('Green hydrogen');
    await section.screenshot({ path: `${SHOTS}/04-pro-m1-profile-en.png` });
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`discover (${locale}): signal is free, list says the month is spent, M1 is limited not locked`, async ({ page }) => {
      const callPath = locale === 'tr' ? 'cagrilar' : 'calls';
      await signIn(page, DISCOVER, `/${locale}/${DISCOVER.workspace}/${callPath}/${TOPIC}`);

      const box = page.getByTestId('partner-signal-box');
      await expect(box.getByTestId('partner-signal-summary')).toContainText(locale === 'tr' ? '14 ilan' : '14 announcements');
      await box.getByTestId('partner-signal-toggle').click();
      const limit = box.getByTestId('ps-quota-exceeded');
      await expect(limit).toContainText(
        locale === 'tr' ? "Bu ay 10/10 sorgu kullanıldı — Pro'ya geç" : '10/10 queries used this month — Upgrade to Pro'
      );
      await expect(limit.getByRole('link')).toHaveAttribute(
        'href',
        locale === 'tr' ? `/tr/${DISCOVER.workspace}/ayarlar/faturalama` : `/en/${DISCOVER.workspace}/settings/billing`
      );
      await expect(box.getByTestId('ps-announcement')).toHaveCount(0);
      await expect(box.getByTestId('ps-attribution')).toBeVisible();
      await box.screenshot({ path: `${SHOTS}/05-discover-limit-${locale}.png` });

      // A refused query is not counted.
      const usage = await prisma.partnerSearchQuotaUsage.findFirst({ where: { tenantId: DISCOVER.tenantId } });
      expect(usage?.count).toBe(10);

      await page.goto(`/${locale}/${DISCOVER.workspace}/${locale === 'tr' ? 'ortaklar' : 'partners'}?tab=live`);
      // Discover's M1 is the limited form: the live tab opens, no lock page.
      await expect(page.getByTestId('partners-live')).toBeVisible();
      await expect(page.locator('section[role="alert"]')).toHaveCount(0);
    });
  }

  test('basic+M1 (tr): opening and reloading the M1 table spends no query, shows no badge', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/announcements')) asked.push(r.url());
    });
    const before = await prisma.partnerSearchQuotaUsage.findMany({ where: { tenantId: BASIC.tenantId } });
    expect(before.map((u) => u.count)).toEqual([3]);

    const path = `/tr/${BASIC.workspace}/ortaklar?q=${encodeURIComponent(ORG_NAME)}`;
    await signIn(page, BASIC, path);
    const row = page.locator('tr', { hasText: ORG_NAME });
    // The same organisation carries "Aktif ilanı var (1)" on Pro (test above).
    // Hydrated = the page's client effects (where a badge would fetch) have had their turn.
    const tab = page.getByTestId('partners-tab-live');
    await expect(row).toBeVisible();
    await expectHydrated(tab);
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expect(row).toBeVisible();
      await expectHydrated(tab);
    }
    await expect(page.getByTestId('ps-active-badge')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/07-basic-m1-no-badge-tr.png`, fullPage: true });

    expect(asked).toEqual([]);
    const after = await prisma.partnerSearchQuotaUsage.findMany({ where: { tenantId: BASIC.tenantId } });
    expect(after.map((u) => u.count)).toEqual([3]);
  });

  test('pro (tr) at 390px: the box and its filters fit the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, PRO, `/tr/${PRO.workspace}/cagrilar/${TOPIC}`);
    await page.getByTestId('partner-signal-toggle').click();
    await expect(page.getByTestId('ps-announcement').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId('partner-signal-box').screenshot({ path: `${SHOTS}/06-pro-call-signal-390-tr.png` });
  });
});
