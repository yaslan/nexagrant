import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { PLAN_E2E, seed, rollback } from '../../scripts/seed-plan-e2e';
import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * FO-40 (TASK-MVC4JL6550ZLE) — the six "Yakında" modules on the modules page, on a
 * Discover tenant (no subscription row) and a Pro one, in both languages: each card
 * says Yakında and offers no switch and no upgrade, and its link opens the module's
 * placeholder page, where the gate answers with the coming-soon view, not the lock.
 *
 * The tenant is `PLAN_E2E.lens` (scripts/seed-plan-e2e.ts), re-seeded here and
 * removed afterwards, like plan-entitlement.spec.ts does.
 */

const LENS = PLAN_E2E.lens;
const SHOTS = shotsDir('TASK-MVC4JL6550ZLE-screenshots');
const SOON = ['M0', 'M12', 'M13', 'M14', 'M15', 'M16'] as const;
const MESSAGES = { tr: trMessages, en: enMessages } as const;

async function setPlan(planId: string | null) {
  if (planId === null) {
    await prisma.subscription.delete({ where: { tenantId: LENS.tenantId } }).catch(() => undefined);
    return;
  }
  await prisma.subscription.upsert({
    where: { tenantId: LENS.tenantId },
    update: { planId, status: 'ACTIVE', planVersionId: null },
    create: { tenantId: LENS.tenantId, planId, status: 'ACTIVE' },
  });
}

async function openModules(page: Page, locale: 'tr' | 'en') {
  const url = `/${locale}/${LENS.workspaceSlug}/settings/modules`;
  await page.goto(url);
  await page.waitForURL(`**${url}`, { timeout: 30_000 });
  await expect(page.getByTestId('module-card-M0')).toBeVisible();
}

/** The app shell scrolls inside `<main>`, so both it and the document are measured. */
function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main ? main.scrollWidth - main.clientWidth : 0,
    );
  });
}

test.describe('modules page — Yakında cards and placeholder pages (FO-40)', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    if (process.env.PLAN_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  for (const [plan, planId] of [
    ['discover', null],
    ['pro', 'pro'],
  ] as const) {
    for (const locale of ['tr', 'en'] as const) {
      test(`${plan} · ${locale}: Yakında cards offer nothing, the link opens the coming-soon page`, async ({ page }) => {
        const M = MESSAGES[locale];
        await setPlan(planId);
        await signInAs(page, { id: LENS.userId, email: LENS.email, tenantId: LENS.tenantId, role: LENS.role });
        await openModules(page, locale);

        for (const id of SOON) {
          const card = page.getByTestId(`module-card-${id}`);
          await expect(card).toHaveAttribute('data-status', 'SOON');
          await expect(card).toContainText(M.settings.modules.statusBadge.soon);
          await expect(card.getByTestId('module-soon-notice')).toHaveText(M.settings.modules.soonNotice);
          await expect(card.getByRole('button')).toHaveCount(0);
          await expect(card.getByRole('link', { name: M.settings.modules.upgradeCta })).toHaveCount(0);
        }

        // Category "all" lists every card; the Yakında ones sit at the start (M0) and the end.
        await page.screenshot({ path: `${SHOTS}/${plan}-${locale}-modules.png`, fullPage: true });
        const m0 = page.getByTestId('module-card-M0');
        await m0.scrollIntoViewIfNeeded();
        await m0.screenshot({ path: `${SHOTS}/${plan}-${locale}-card-M0.png` });
        const m13 = page.getByTestId('module-card-M13');
        await m13.scrollIntoViewIfNeeded();
        await m13.screenshot({ path: `${SHOTS}/${plan}-${locale}-card-M13.png` });

        // A real click on the card's link, not a goto: the entry point must work.
        await m0.getByRole('link', { name: M.settings.modules.soonLink }).click();
        await page.waitForURL(`**/${locale}/${LENS.workspaceSlug}/modules/call-fit`, { timeout: 30_000 });
        const soonPage = page.getByTestId('module-coming-soon');
        await expect(soonPage).toBeVisible();
        await expect(soonPage.getByRole('heading', { level: 1 })).toHaveText(M.modules['call-fit'].name);
        await expect(page.getByText(M.ModuleGate.title)).toHaveCount(0);
        await page.screenshot({ path: `${SHOTS}/${plan}-${locale}-placeholder-M0.png` });

        // Phone width: the placeholder and the cards must not scroll sideways.
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(soonPage).toBeVisible();
        expect(await horizontalOverflow(page), 'placeholder at 375px').toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${SHOTS}/${plan}-${locale}-placeholder-M0-375.png` });
        await openModules(page, locale);
        expect(await horizontalOverflow(page), 'modules page at 375px').toBeLessThanOrEqual(0);
        await m0.scrollIntoViewIfNeeded();
        await m0.screenshot({ path: `${SHOTS}/${plan}-${locale}-card-M0-375.png` });
      });
    }
  }
});
