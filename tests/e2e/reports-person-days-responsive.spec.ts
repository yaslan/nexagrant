import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { withSystemScope } from '../../src/lib/system-scope';
import { requireId } from '../helpers/teardown-guard';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MUVFUMNPHWLF9 — person-days report at 390 px.
 *
 * The Person-Days column used to sit off-screen at 390 px: the table had
 * `min-w-[500px]` inside an `overflow-x-auto` card, so the user had to scroll the
 * table sideways to read the one number the report exists for. Here it must be
 * readable without any scroll: the page is no wider than the viewport, and the
 * Person-Days header and the first row's person-days cell are *fully* in the
 * viewport as the page opens (ratio 1, no scrollIntoView). TR and EN, because the
 * header text differs ("Adam-Gün" / "Person-Days"). At 1280 px the table is as before.
 *
 * Own tenant per run (M5 switched on explicitly), minted session cookie — no demo
 * form, so the spec also runs under `next start`.
 */

const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const SHOTS = shotsDir('TASK-MUVFUMNPHWLF9-evidence');
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * [title, hours]. Worst cases for the first column: a long title, and a call code with
 * no break opportunity at all (underscores), which would otherwise widen the table.
 */
const SEED: [string, number][] = [
  ['Advanced AI Solutions for Climate Modeling and Regional Adaptation Planning', 20.5],
  ['Smart Grids Optimization', 16],
  ['HORIZON_CL5_2027_D3_01_HYDROGEN_VALLEY_DEMONSTRATOR', 4],
];

const LABELS = {
  tr: { heading: 'Adam-Gün Raporu', pd: 'Adam-Gün', hours: 'Toplam Saat', opp: 'Fırsat' },
  en: { heading: 'Person-Days Report', pd: 'Person-Days', hours: 'Total Hours', opp: 'Opportunity' },
} as const;

interface Fixture {
  stamp: string;
  tenantId: string;
  workspaceSlug: string;
  user: { id: string; email: string };
}

let f: Fixture | undefined;

async function seed(): Promise<Fixture> {
  const stamp = `pd390-${Date.now()}-${randomUUID().slice(0, 6)}`;
  return withSystemScope('platform-admin', 'e2e.person-days-390.setup', async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: `PD390 ${stamp}`, slug: stamp, country: 'TR', orgType: 'SME' },
    });
    await tx.subscription.create({ data: { tenantId: tenant.id, planId: 'ultra', status: 'ACTIVE' } });
    await tx.moduleState.create({
      data: { tenantId: tenant.id, moduleId: 'M5', status: 'ON', changedBy: 'person-days-390 e2e fixture' },
    });
    const ws = await tx.workspace.create({ data: { tenantId: tenant.id, name: 'PD390', slug: `${stamp}-ws` } });
    const user = { id: `${stamp}-u1`, email: `${stamp}-u1@e2e.fabrika.test` };
    await tx.user.create({ data: { id: user.id, email: user.email, name: 'PD390 user', locale: 'tr' } });
    await tx.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'TENANT_OWNER', workspaceIds: [ws.id] },
    });
    for (const [title, hours] of SEED) {
      const o = await tx.opportunity.create({ data: { tenantId: tenant.id, workspaceId: ws.id, title, stage: 'G1' } });
      await tx.effort.create({
        data: { tenantId: tenant.id, opportunityId: o.id, userId: user.id, date: new Date('2026-09-01T00:00:00.000Z'), hours },
      });
    }
    return { stamp, tenantId: tenant.id, workspaceSlug: ws.slug, user };
  });
}

async function cleanup(fx: Fixture | undefined) {
  if (!fx) return;
  await withSystemScope('platform-admin', 'e2e.person-days-390.cleanup', async (tx) => {
    const where = { tenantId: fx.tenantId };
    await tx.effort.deleteMany({ where });
    await tx.opportunity.deleteMany({ where });
    await tx.membership.deleteMany({ where });
    await tx.moduleState.deleteMany({ where });
    await tx.subscription.deleteMany({ where });
    await tx.workspace.deleteMany({ where });
    await tx.user.deleteMany({ where: { id: { startsWith: requireId(fx.stamp, 'stamp') } } });
    await tx.tenant.deleteMany({ where: { id: fx.tenantId } });
  });
}

async function signIn(context: BrowserContext, fx: Fixture) {
  const value = await encode({
    token: { sub: fx.user.id, id: fx.user.id, email: fx.user.email, tenantId: fx.tenantId, role: 'TENANT_OWNER' },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await context.addCookies([{ name: COOKIE_NAME, value, url: BASE_URL }]);
  // The cookie banner is a full-screen alertdialog; keep it out of the frame.
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

async function openReport(page: Page, context: BrowserContext, locale: 'tr' | 'en', width: number) {
  await page.setViewportSize({ width, height: 844 });
  await signIn(context, f!);
  const res = await page.goto(`/${locale}/${f!.workspaceSlug}/reports/person-days`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: LABELS[locale].heading })).toBeVisible();
  // Largest first: the 20.5 h row → 2.6 person-days.
  const first = page.locator('table tbody tr').first().locator('td');
  const [topTitle, topHours] = SEED[0]!;
  await expect(first.nth(0)).toHaveText(topTitle);
  await expect(first.nth(2)).toHaveText((topHours / 8).toFixed(1));
  // Nothing has scrolled the page or the table before the checks below.
  const scrolled = await page.evaluate(() => ({
    page: window.scrollX,
    table: document.querySelector('table')!.parentElement!.scrollLeft,
  }));
  expect(scrolled).toEqual({ page: 0, table: 0 });
}

test.describe('Person-days report — 390 px / 1280 px', () => {
  test.beforeAll(async () => {
    f = await seed();
  });
  test.afterAll(async () => {
    await cleanup(f);
  });

  for (const locale of ['tr', 'en'] as const) {
    test(`${locale.toUpperCase()} 390 px: no page overflow, Person-Days readable without scrolling`, async ({
      page,
      context,
    }) => {
      await openReport(page, context, locale, 390);
      await page.screenshot({ path: `${SHOTS}/390-${locale}.png`, fullPage: true });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `document is ${scrollWidth}px wide at 390px`).toBeLessThanOrEqual(390);

      const pdHeader = page.getByRole('columnheader', { name: LABELS[locale].pd, exact: true });
      const pdCell = page.locator('table tbody tr').first().locator('td').nth(2);
      await expect(pdHeader).toBeInViewport({ ratio: 1 });
      await expect(pdCell).toBeInViewport({ ratio: 1 });
      // The table itself must not be wider than its card (no hidden inner scroll either).
      const inner = await page.evaluate(() => {
        const box = document.querySelector('table')!.parentElement!;
        return { scroll: box.scrollWidth, client: box.clientWidth };
      });
      expect(inner.scroll, `table is ${inner.scroll}px in a ${inner.client}px card`).toBeLessThanOrEqual(inner.client);
      // Readable, not just on screen: "Adam-Gün" / "Person-Days" must not break at the
      // hyphen into "ADAM- / GÜN", and the numbers must not wrap either.
      for (const el of [pdHeader, page.getByRole('columnheader', { name: LABELS[locale].hours, exact: true }), pdCell]) {
        const lines = await el.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        });
        expect(lines, `"${await el.innerText()}" renders on ${lines} lines`).toBe(1);
      }
    });
  }

  test('TR 1280 px: table visible, all three columns in the viewport', async ({ page, context }) => {
    await openReport(page, context, 'tr', 1280);
    await page.screenshot({ path: `${SHOTS}/1280-tr.png`, fullPage: true });
    await expect(page.locator('table')).toBeVisible();
    for (const name of [LABELS.tr.opp, LABELS.tr.hours, LABELS.tr.pd]) {
      await expect(page.getByRole('columnheader', { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(1280);
  });
});
