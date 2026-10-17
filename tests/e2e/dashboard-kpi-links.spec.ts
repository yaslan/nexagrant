import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { READINESS_ORG_TYPES } from '../../src/lib/readiness/score';
import { READINESS_QUESTIONS, type ReadinessAnswers } from '../../src/lib/readiness/questions';
import { encodeReadinessCode } from '../../src/lib/readiness/share';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * FO-69 (TASK-MVCPDQA43WNMS) — every panel KPI card, and the readiness card, opens the page
 * its figure is worked on. The expected targets are written out per locale rather than built
 * with getWorkspaceRoute, so the spec states the mapping instead of agreeing with the code.
 *
 * Two seats of this spec's own on the demo tenant: an owner, who may open Settings › Modules,
 * and a pipeline manager, who may open the panel but not that page — so the active-modules
 * card must not be a link for them. (A member never reaches the panel: page.tsx sends every
 * role below `evaluate_gates` to its own landing page.)
 */

const SHOTS = shotsDir('TASK-MVCPDQA43WNMS-screenshots');
const TENANT = 'demo-tenant';
const OWNER = {
  userId: 'e2e-kpi-links-owner',
  email: 'kpi-links-owner@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: TENANT,
};
const MANAGER = {
  userId: 'e2e-kpi-links-manager',
  email: 'kpi-links-manager@e2e.fabrika.test',
  role: 'PIPELINE_MANAGER' as const,
  tenantId: TENANT,
};

/**
 * A year back, so the seeded opportunities fill the KPI grid. Not wider: the trend query runs
 * three counts per week inside one 5 s transaction, and a range of decades times it out.
 */
const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const RANGE = `from=${day(-365)}&to=${day(0)}`;

const LOCALES = {
  tr: {
    panel: '/tr/main/panel',
    suffix: ' — ayrıntıya git',
    readiness: 'Hazırlık durumu',
    readinessPath: '/tr/fon-hazirlik',
    cards: [
      ['Toplam Teklif', '/tr/main/firsatlar'],
      ['İsabet Oranı', '/tr/main/firsatlar'],
      ['Eşik Üstü Oranı', '/tr/main/firsatlar'],
      ['Ortalama Puan', '/tr/main/firsatlar'],
      ['Kişi-Gün / Teklif', '/tr/main/reports/person-days'],
      ['Ort. G2 Süresi (gün)', '/tr/main/firsatlar'],
      ['Açık Modüller', '/tr/main/ayarlar/moduller'],
    ],
  },
  en: {
    panel: '/en/main/dashboard',
    suffix: ' — go to details',
    readiness: 'Funding readiness',
    readinessPath: '/en/funding-readiness',
    cards: [
      ['Total Proposals', '/en/main/pipeline'],
      ['Hit Rate', '/en/main/pipeline'],
      ['Above Threshold Rate', '/en/main/pipeline'],
      ['Average Score', '/en/main/pipeline'],
      ['Person-Days / Proposal', '/en/main/reports/person-days'],
      ['Avg Days to G2', '/en/main/pipeline'],
      ['Active Modules', '/en/main/settings/modules'],
    ],
  },
} as const;

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

async function openPanel(page: Page, seat: typeof OWNER | typeof MANAGER, path: string) {
  await acceptCookies(page);
  await signInAs(page, { id: seat.userId, email: seat.email, tenantId: seat.tenantId, role: seat.role });
  await page.goto(`${path}?${RANGE}`);
  await expect(page.locator('#dashboard-panel-overview')).toBeVisible({ timeout: 30_000 });
}

/** A readiness result on the demo tenant, so the card renders; removed again in afterAll. */
let addedReadiness = false;

test.beforeAll(async () => {
  await seedIdentity({ ...OWNER, workspaceIds: [] });
  await seedIdentity({ ...MANAGER, workspaceIds: [] });

  const answers: ReadinessAnswers = {};
  for (const q of READINESS_QUESTIONS) answers[q.id] = 1;
  const code = encodeReadinessCode(READINESS_ORG_TYPES[0], answers);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: TENANT }, select: { settings: true } });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  if (!('readiness' in settings)) {
    // Only the one key is touched, in the database, so a concurrent change to the rest of
    // the tenant's settings is neither read stale nor written back.
    await prisma.$executeRaw`
      UPDATE "Tenant"
         SET settings = COALESCE(settings, '{}'::jsonb)
                        || jsonb_build_object('readiness', jsonb_build_object('code', ${code}::text, 'importedAt', ${new Date().toISOString()}::text))
       WHERE id = ${TENANT}`;
    addedReadiness = true;
  }
});

test.afterAll(async () => {
  if (addedReadiness) {
    await prisma.$executeRaw`UPDATE "Tenant" SET settings = settings - 'readiness' WHERE id = ${TENANT}`;
  }
  await cleanupIdentity([OWNER.userId, MANAGER.userId]);
  await prisma.$disconnect();
});

for (const [locale, l] of Object.entries(LOCALES)) {
  test(`${locale}: every KPI card links to the page its figure is worked on`, async ({ page }) => {
    await openPanel(page, OWNER, l.panel);
    await page.screenshot({ path: `${SHOTS}/01-${locale}-owner-panel.png`, fullPage: true });

    for (const [title, href] of l.cards) {
      await expect(page.getByRole('link', { name: `${title}${l.suffix}`, exact: true })).toHaveAttribute(
        'href',
        href,
      );
    }
    const readiness = page.getByTestId('readiness-card-link');
    await expect(readiness).toHaveAccessibleName(`${l.readiness}${l.suffix}`);
    await expect(readiness).toHaveAttribute('href', new RegExp(`^${l.readinessPath}\\?`));
  });
}

test('tr: a click and a keyboard Enter each open the target page', async ({ page }) => {
  const l = LOCALES.tr;
  await openPanel(page, OWNER, l.panel);

  // Mouse: the person-days card opens the person-days report.
  await page.getByRole('link', { name: `Kişi-Gün / Teklif${l.suffix}`, exact: true }).click();
  await page.waitForURL('**/tr/main/reports/person-days', { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adam-Gün Raporu');

  // Keyboard: focus the first card, check the ring is the focus-visible one, press Enter.
  await page.goto(`${l.panel}?${RANGE}`);
  const first = page.getByRole('link', { name: `Toplam Teklif${l.suffix}`, exact: true });
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.screenshot({ path: `${SHOTS}/02-tr-keyboard-focus.png` });
  await page.keyboard.press('Enter');
  await page.waitForURL('**/tr/main/firsatlar', { timeout: 30_000 });

  // The readiness card: a click on its body (not on one of its buttons) opens the full result.
  await page.goto(`${l.panel}?${RANGE}`);
  // The stretched link covers the card, so the point a mouse hits there is that link (a click
  // aimed at the score itself is, correctly, intercepted by it).
  const card = page.getByTestId('readiness-card');
  await card.click({ position: { x: 40, y: 40 } });
  await page.waitForURL(/\/tr\/fon-hazirlik\?/, { timeout: 30_000 });

  // Its own buttons stay reachable above the stretched link.
  await page.goto(`${l.panel}?${RANGE}`);
  await page.getByTestId('readiness-card-retake').click();
  await page.waitForURL(/\/tr\/fon-hazirlik$/, { timeout: 30_000 });
});

test('en: a pipeline manager gets no link to Settings › Modules', async ({ page }) => {
  const l = LOCALES.en;
  await openPanel(page, MANAGER, l.panel);
  await page.screenshot({ path: `${SHOTS}/03-en-manager-panel.png`, fullPage: true });

  // The card is there, as a plain block …
  await expect(page.getByRole('heading', { name: 'Active Modules', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Active Modules${l.suffix}` })).toHaveCount(0);
  await expect(page.locator('a[href="/en/main/settings/modules"]')).toHaveCount(0);
  // … while the cards this role can open still link.
  await expect(page.getByRole('link', { name: `Total Proposals${l.suffix}`, exact: true })).toHaveAttribute(
    'href',
    '/en/main/pipeline',
  );
});
