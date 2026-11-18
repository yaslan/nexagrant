import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { formatMoney } from '../../src/lib/money';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';
import {
  NG_PLAN_REFUSED_SEATS,
  ngPlanFixture,
  readStoredCatalogue,
  setupNgPlanTenants,
  teardownNgPlanTenants,
  type NgPlanFixtureState,
  type NgPlanRefusedRole,
  type NgTrialRow,
} from './fixtures/ng-plan-tenant';

/**
 * NG-11 — Settings → Plan and trial, in a real browser against the real catalogue
 * (NG-57 seed) and real NgSubscription rows (fixtures/ng-plan-tenant.ts).
 *
 * Every expectation about plans, features and prices is read from the database here
 * and compared with the screen; the spec types no price, day count or plan list.
 */

const SHOTS = shotsDir('NG-11-evidence');
const TZ = 'Europe/Istanbul';
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

type Locale = 'tr' | 'en';
const MESSAGES = { tr: trMessages.ngPlan, en: enMessages.ngPlan } as const;

function planUrl(state: NgPlanFixtureState, locale: Locale) {
  const ws = ngPlanFixture(state).workspace;
  return locale === 'tr' ? `/tr/${ws}/ayarlar/plan` : `/en/${ws}/settings/plan`;
}

async function open(page: Page, state: NgPlanFixtureState, locale: Locale) {
  const f = ngPlanFixture(state);
  await signInAs(page, { id: f.userId, email: f.email, name: `NG-11 ${state}`, tenantId: f.tenantId, role: 'TENANT_OWNER' });
  await page.goto(planUrl(state, locale));
  await expect(page.getByRole('heading', { level: 1, name: MESSAGES[locale].title })).toBeVisible({ timeout: 30_000 });
}

function tierName(locale: Locale, tier: string): string {
  return (MESSAGES[locale].tier as Record<string, string>)[tier] ?? tier;
}

function localDate(iso: Date, locale: Locale) {
  return iso.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'long', timeZone: TZ });
}

let trials: Record<'running' | 'ended', NgTrialRow>;
let catalogue: Awaited<ReturnType<typeof readStoredCatalogue>>;

test.describe.configure({ mode: 'serial' });
test.use({ timezoneId: TZ });

test.describe('NG-11 plan and trial screen', () => {
  test.beforeAll(async () => {
    trials = await setupNgPlanTenants();
    catalogue = await readStoredCatalogue();
    expect(catalogue.length, 'NG catalogue is seeded').toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    await teardownNgPlanTenants();
  });

  test('tier screen: every catalogue plan, its price state and its features come from the database', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, 'none', 'tr');
    const m = MESSAGES.tr;

    for (const plan of catalogue) {
      const card = page.getByTestId(`ng-plan-card-${plan.id}`);
      await expect(card).toBeVisible();
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(tierName('tr', plan.tier));
      // No amount is stored for any cell today, so the state follows sellable / isFallback.
      const expected = plan.isFallback ? 'free' : !plan.sellable ? 'contact' : 'soon';
      await expect(card).toHaveAttribute('data-price-state', expected);
      const label = expected === 'free' ? m.plans.free : expected === 'contact' ? m.plans.contact : m.plans.priceSoon;
      await expect(card.getByTestId('ng-plan-price')).toHaveText(label);
      const buy = page.getByTestId(`ng-plan-buy-${plan.id}`);
      if (expected === 'soon') {
        await expect(buy).toBeDisabled();
        await expect(buy).toHaveText(m.plans.buySoon);
      } else {
        await expect(buy).toHaveCount(0);
      }
    }

    // The tenant with no row sits on the fallback plan.
    const fallback = catalogue.find((p) => p.isFallback);
    expect(fallback).toBeTruthy();
    await expect(page.getByTestId('ng-plan-current')).toHaveAttribute('data-plan-id', fallback!.id);
    await expect(page.getByTestId(`ng-plan-card-${fallback!.id}`).getByTestId('ng-plan-current-badge')).toBeVisible();
    await expect(page.getByTestId('ng-plan-current-badge')).toHaveCount(1);

    // Matrix: one column per plan, one row per feature any plan grants, cells as stored.
    const table = page.getByTestId('ng-plan-matrix');
    await expect(table.locator('caption')).toHaveText(m.plans.matrixCaption);
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(catalogue.length + 1);
    const keys = new Set(catalogue.flatMap((p) => p.features.map((f) => f.featureKey)));
    await expect(table.locator('tbody tr')).toHaveCount(keys.size);
    for (const key of keys) {
      const row = table.locator(`tbody tr[data-feature="${key}"]`);
      await expect(row.locator('th[scope="row"]')).toHaveText((m.feature as Record<string, string>)[key]!);
      for (const [i, plan] of catalogue.entries()) {
        const cell = row.locator('td').nth(i);
        const grant = plan.features.find((f) => f.featureKey === key);
        if (!grant) {
          await expect(cell).toHaveText(`—${m.plans.notIncluded}`);
        } else if (grant.limitValue === null) {
          await expect(cell).toContainText(m.plans.unlimited);
        } else {
          await expect(cell).toContainText(String(grant.limitValue));
        }
      }
    }

    // Currency / interval switches are radio groups: keyboard moves the choice.
    const tl = page.getByRole('radio', { name: m.plans.currency.TRY });
    const eur = page.getByRole('radio', { name: m.plans.currency.EUR });
    await expect(tl).toBeChecked();
    await tl.focus();
    await page.keyboard.press('ArrowRight');
    await expect(eur).toBeChecked();
    await expect(page.getByRole('radio', { name: m.plans.interval.year })).toBeChecked();
    await page.getByText(m.plans.interval.month, { exact: true }).click();
    await expect(page.getByRole('radio', { name: m.plans.interval.month })).toBeChecked();
    // Hit area of every currency / interval choice is at least 44 px tall (WCAG 2.5.5; NG-11 B2).
    // The radio itself is sr-only, so the measured box is the wrapping label the user clicks.
    for (const name of [m.plans.currency.TRY, m.plans.currency.EUR, m.plans.interval.year, m.plans.interval.month]) {
      const box = await page.locator('label', { has: page.getByRole('radio', { name }) }).first().boundingBox();
      expect(box?.height ?? 0, `hit area of "${name}"`).toBeGreaterThanOrEqual(44);
    }
    // Still nothing priced: switching shows another cell, it never invents an amount.
    for (const plan of catalogue.filter((p) => p.sellable)) {
      await expect(page.getByTestId(`ng-plan-card-${plan.id}`)).toHaveAttribute('data-price-state', 'soon');
    }

    await page.screenshot({ path: `${SHOTS}/tr-desktop-none.png`, fullPage: true });
    // The shell scrolls inside <main>, so fullPage stops at the viewport: scroll to the matrix and shoot again.
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/tr-desktop-matrix.png` });
  });

  test('a purchasable catalogue cell is shown with its own amount, only for its currency and interval', async ({ page }) => {
    const target = catalogue.find((p) => p.sellable);
    expect(target).toBeTruthy();
    // A test amount on one cell, put back to "no amount" whatever happens.
    const amountMinor = 4321;
    const setAmount = (value: number | null) =>
      withSystemScope('platform-admin', 'e2e.ng11.price', (tx) =>
        tx.ngPlanPrice.update({
          where: { planId_currency_interval: { planId: target!.id, currency: 'EUR', interval: 'month' } },
          data: { amountMinor: value },
        })
      );
    await setAmount(amountMinor);
    try {
      await page.setViewportSize(DESKTOP);
      await open(page, 'none', 'en');
      const m = MESSAGES.en;
      const card = page.getByTestId(`ng-plan-card-${target!.id}`);
      // en defaults to euro + yearly: that cell has no amount.
      await expect(page.getByRole('radio', { name: m.plans.currency.EUR })).toBeChecked();
      await expect(card).toHaveAttribute('data-price-state', 'soon');
      await page.getByText(m.plans.interval.month, { exact: true }).click();
      await expect(card).toHaveAttribute('data-price-state', 'price');
      await expect(card.getByTestId('ng-plan-price')).toHaveText(formatMoney(amountMinor, 'EUR', 'en-GB'));
      await expect(card).toContainText(m.plans.perInterval.month);
      await page.getByText(m.plans.currency.TRY, { exact: true }).click();
      await expect(card).toHaveAttribute('data-price-state', 'soon');
    } finally {
      await setAmount(null);
    }
  });

  test('trial none: says no trial is running', async ({ page }) => {
    await open(page, 'none', 'tr');
    const trial = page.getByTestId('ng-trial');
    await expect(trial).toHaveAttribute('data-trial-kind', 'none');
    await expect(trial).toHaveText(MESSAGES.tr.trial.noneBody);
  });

  test('trial running: days left, end date on the viewer clock, and the plan it drops to', async ({ page }) => {
    for (const locale of ['tr', 'en'] as const) {
      for (const [label, size] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
        await page.setViewportSize(size);
        await open(page, 'running', locale);
        const m = MESSAGES[locale];
        const row = trials.running;
        const trial = page.getByTestId('ng-trial');
        await expect(trial).toHaveAttribute('data-trial-kind', 'running');
        const daysLeft = Math.ceil((row.trialEndsAt.getTime() - Date.now()) / 86_400_000);
        await expect(page.getByTestId('ng-trial-days-left')).toContainText(String(daysLeft));
        await expect(page.getByTestId('ng-trial-date')).toContainText(localDate(row.trialEndsAt, locale));
        await expect(page.getByTestId('ng-trial-date').locator('time')).toHaveAttribute('dateTime', row.trialEndsAt.toISOString());
        await expect(trial).toContainText(TZ);
        const endTier = catalogue.find((p) => p.id === row.trialEndPlanId)!.tier;
        await expect(page.getByTestId('ng-trial-end-plan')).toContainText(tierName(locale, endTier));
        // Current plan is the trial plan, from the row.
        await expect(page.getByTestId('ng-plan-current')).toHaveAttribute('data-plan-id', row.planId);
        await expect(page.getByTestId(`ng-plan-card-${row.planId}`).getByTestId('ng-plan-current-badge')).toHaveText(m.currentBadge);
        // No horizontal overflow of the page itself on a phone (the matrix scrolls in its own region).
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${locale} ${label} page overflow`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${SHOTS}/${locale}-${label}-running.png`, fullPage: true });
        await page.getByTestId("ng-plan-matrix").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/${locale}-${label}-matrix.png` });
      }
    }
  });

  test('trial ended: shown as ended and the account is on the end plan', async ({ page }) => {
    for (const locale of ['tr', 'en'] as const) {
      await page.setViewportSize(DESKTOP);
      await open(page, 'ended', locale);
      const row = trials.ended;
      await expect(page.getByTestId('ng-trial')).toHaveAttribute('data-trial-kind', 'ended');
      await expect(page.getByTestId('ng-trial')).toContainText(MESSAGES[locale].trial.endedBadge);
      await expect(page.getByTestId('ng-trial-days-left')).toHaveCount(0);
      await expect(page.getByTestId('ng-trial-date')).toContainText(localDate(row.trialEndsAt, locale));
      // The settle moment is a different day and is not what the screen states: only endsAt is shown.
      expect(row.trialEndedAt, 'fixture: ended row has a settle day').toBeTruthy();
      expect(localDate(row.trialEndedAt!, locale)).not.toBe(localDate(row.trialEndsAt, locale));
      await expect(page.getByTestId('ng-trial')).not.toContainText(localDate(row.trialEndedAt!, locale));
      await expect(page.getByTestId('ng-plan-current')).toHaveAttribute('data-plan-id', row.trialEndPlanId);
      const endTier = catalogue.find((p) => p.id === row.trialEndPlanId)!.tier;
      await expect(page.getByTestId('ng-trial-end-plan')).toContainText(tierName(locale, endTier));
      await page.screenshot({ path: `${SHOTS}/${locale}-desktop-ended.png`, fullPage: true });
    }
  });

  test('the user menu links to the plan screen', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, 'running', 'en');
    await page.getByRole('button', { name: /NG-11 running/ }).filter({ visible: true }).first().click();
    const link = page.getByTestId('user-menu-plan-link');
    await expect(link).toHaveText(enMessages.Navigation.planAndTrial);
    await expect(link).toHaveAttribute('href', planUrl('running', 'en'));
  });

  test('the plan screen is TENANT_OWNER only: a MEMBER and a GUEST_PARTNER get 403 and no subscription data', async ({ page }) => {
    const row = trials.running;
    // What the owner sees on this tenant: any of it in a refused response is a leak. Tier names
    // are left out on purpose: the root layout ships the whole message bundle (static UI text,
    // "Ücretsiz Kontrol" included) to every page, so a name in the HTML proves nothing.
    const secrets = [row.trialEndsAt.toISOString(), localDate(row.trialEndsAt, 'tr'), row.planId, row.trialEndPlanId];
    for (const role of Object.keys(NG_PLAN_REFUSED_SEATS) as NgPlanRefusedRole[]) {
      const seat = NG_PLAN_REFUSED_SEATS[role];
      const f = ngPlanFixture('running');
      await signInAs(page, { id: seat.userId, email: seat.email, name: seat.name, tenantId: f.tenantId, role });
      const url = planUrl('running', 'tr');
      const res = await page.goto(url);
      expect(res?.status(), role).toBe(403);
      await expect(page.getByRole('heading', { name: trMessages.Forbidden.title }), role).toBeVisible();
      await expect(page.getByTestId('ng-plan-current'), role).toHaveCount(0);
      await expect(page.getByTestId('ng-trial'), role).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/tr-desktop-refused-${role.toLowerCase()}.png` });
      const html = await page.content();
      // The RSC payload is what a client-side navigation would carry: the same leak test applies.
      const rsc = await page.request.get(url, { headers: { RSC: '1' } });
      const payload = await rsc.text();
      for (const secret of secrets) {
        expect(html, `${role} html ${secret}`).not.toContain(secret);
        expect(payload, `${role} rsc ${secret}`).not.toContain(secret);
      }
    }
  });

  test('the user menu shows the plan link only to a role the plan screen admits', async ({ page }) => {
    const f = ngPlanFixture('running');
    await page.setViewportSize(DESKTOP);
    for (const role of Object.keys(NG_PLAN_REFUSED_SEATS) as NgPlanRefusedRole[]) {
      const seat = NG_PLAN_REFUSED_SEATS[role];
      await signInAs(page, { id: seat.userId, email: seat.email, name: seat.name, tenantId: f.tenantId, role });
      await page.goto(`/en/${f.workspace}/dashboard`);
      await page.getByRole('button', { name: new RegExp(seat.name) }).filter({ visible: true }).first().click();
      // Positive control: the dropdown is open (its profile header is visible) before we look for the link.
      await expect(page.getByRole('heading', { level: 4, name: seat.name })).toBeVisible();
      await expect(page.getByTestId('user-menu-plan-link'), role).toHaveCount(0);
    }
  });

  test('signed out: the login page, never a raw error', async ({ page }) => {
    await page.goto(planUrl('running', 'tr'));
    await page.waitForURL(/\/(giris|login)/, { timeout: 30_000 });
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('SESSION_REQUIRED');
    expect(body).not.toContain('NG_CATALOGUE_MISSING');
  });
});
