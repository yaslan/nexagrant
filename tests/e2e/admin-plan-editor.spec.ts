import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MTRJ32BZBY2AI step 2 — the platform plan editor, driven by real clicks.
 *
 * The rules under test are the ones an operator can break irreversibly:
 *   • a published version is never edited in place (a new draft is created),
 *   • the publish button does not exist until the blast radius has been shown,
 *   • a plan somebody pays for cannot be deleted,
 *   • a card bullet cannot name a module the plan does not grant.
 *
 * Every assertion here is on the rendered page, not on a repository call: the
 * unit suite already proves the repository, and this task exists precisely
 * because a green type-check and a green unit run were not the same thing as a
 * working screen.
 */

const SHOTS = shotsDir('TASK-MTRJ32BZBY2AI-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const URL = '/tr/admin/billing/plans';

async function signInAsPlatformAdmin(page: Page, baseURL: string): Promise<void> {
  const value = await encode({
    token: {
      sub: 'demo-user-superadmin',
      id: 'demo-user-superadmin',
      name: 'Platform Admin',
      email: 'admin@yasinaslan.com.tr',
      tenantId: 'demo-tenant',
      role: 'SUPER_ADMIN',
      isPlatformAdmin: true,
    },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' })
    );
  });
}

test.describe('admin plan editor', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await signInAsPlatformAdmin(page, baseURL as string);
  });

  test('lists plans with their versions and a live-tenant count', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('plan-admin')).toBeVisible();
    await expect(page.getByTestId('plan-row-pro')).toBeVisible();
    await expect(page.getByTestId('version-history')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-plan-list.png`, fullPage: true });
  });

  test('a published version is marked immutable and offers no edit control', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('plan-row-pro').click();
    const publishedRow = page.getByTestId('version-row-1');
    await expect(publishedRow.getByText('Yayında')).toBeVisible();
    await expect(page.getByTestId('immutable-note-1')).toBeVisible();
    // no edit button on the published row
    await expect(publishedRow.getByTestId('edit-draft-1')).toHaveCount(0);
  });

  test('editing a published plan creates a NEW draft version, leaving the live one alone', async ({ page }) => {
    // A draft left open by an earlier run is real state, not a reason to fail:
    // clear it first, so the assertion is about the rule and not about what the
    // database happened to be holding.
    await prisma.planVersion.deleteMany({ where: { planId: 'basic', status: 'draft' } });

    await page.goto(URL);
    await page.getByTestId('plan-row-basic').click();
    const before = await page.getByTestId('version-history').locator('tbody tr').count();

    await page.getByTestId('create-draft').click();
    await expect(page.getByTestId('draft-editor')).toBeVisible();

    const after = await page.getByTestId('version-history').locator('tbody tr').count();
    expect(after).toBe(before + 1);
    // the live version is still published
    await expect(page.getByTestId('version-status-1')).toHaveText('Yayında');

    await page.screenshot({ path: `${SHOTS}/02-new-draft.png`, fullPage: true });

    // clean up so the suite can re-run
    await page.getByTestId('discard-draft').click();
    await expect(page.getByTestId('draft-editor')).toHaveCount(0);
  });

  test('the publish button does not exist until the impact has been computed', async ({ page }) => {
    await prisma.planVersion.deleteMany({ where: { planId: 'basic', status: 'draft' } });
    await page.goto(URL);
    await page.getByTestId('plan-row-basic').click();
    await page.getByTestId('create-draft').click();
    await expect(page.getByTestId('draft-editor')).toBeVisible();

    // before: no publish control, and an explicit reason why
    await expect(page.getByTestId('publish-version')).toHaveCount(0);
    await expect(page.getByTestId('publish-locked')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-publish-locked.png`, fullPage: true });

    // lower a limit, then ask for the impact
    await page.getByTestId('field-seats').fill('1');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('plan-notice')).toBeVisible();

    await page.getByTestId('check-impact').click();
    await expect(page.getByTestId('impact-panel')).toBeVisible();
    await expect(page.getByTestId('impact-count')).toContainText('kiracı');
    await expect(page.getByTestId('publish-version')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/04-impact-shown.png`, fullPage: true });

    // changing a field again retracts the acknowledgement
    await page.getByTestId('field-seats').fill('4');
    await expect(page.getByTestId('publish-version')).toHaveCount(0);
    await expect(page.getByTestId('publish-locked')).toBeVisible();

    await page.getByTestId('discard-draft').click();
    await expect(page.getByTestId('draft-editor')).toHaveCount(0);
  });

  test('a card bullet cannot be set to a module the draft does not grant', async ({ page }) => {
    await prisma.planVersion.deleteMany({ where: { planId: 'basic', status: 'draft' } });
    await page.goto(URL);
    await page.getByTestId('plan-row-basic').click();
    await page.getByTestId('create-draft').click();
    await expect(page.getByTestId('draft-editor')).toBeVisible();

    // grant M1, add a module bullet: the picker offers granted modules only
    await page.getByTestId('module-M1').check();
    await page.getByTestId('add-feature').click();
    await page.getByTestId('feature-kind-0').selectOption('module');

    const options = await page.getByTestId('feature-module-0').locator('option').allInnerTexts();
    const granted = options.filter((o) => /^M\d+/.test(o.trim()));
    expect(granted.length).toBeGreaterThan(0);
    // M7 is not granted by Basic, so it must not be offered
    expect(granted.some((o) => o.trim().startsWith('M7'))).toBe(false);

    await page.getByTestId('feature-module-0').selectOption('M1');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('plan-notice')).toContainText('Kaydedildi');

    // now revoke M1 — the bullet that promised it must go with it
    await page.getByTestId('module-M1').uncheck();
    await expect(page.getByTestId('feature-row-0')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/05-grant-enforced.png`, fullPage: true });

    await page.getByTestId('discard-draft').click();
  });

  test('a plan with live subscriptions cannot be deleted, only archived', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('plan-row-pro').click();
    // demo-tenant is on an ACTIVE pro subscription in the dev database
    await expect(page.getByTestId('delete-blocked-note')).toBeVisible();
    await expect(page.getByTestId('delete-plan')).toBeDisabled();
    await expect(page.getByTestId('archive-plan')).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/06-delete-blocked.png`, fullPage: true });
  });

  test('a private plan shows the tenant assignment panel; a public one does not', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('plan-row-free').click();
    // This test restores `free` to public at its end, which a failed run never
    // reaches; the shared dev DB then starts the next run private. Start from
    // public explicitly so the first assertion measures the test, not the leftover.
    if ((await page.getByTestId('visibility-select').inputValue()) !== 'public') {
      await page.getByTestId('visibility-select').selectOption('public');
    }
    await expect(page.getByTestId('assignment-panel')).toHaveCount(0);

    await page.getByTestId('visibility-select').selectOption('private');
    await expect(page.getByTestId('assignment-panel')).toBeVisible();

    const tenantValues = await page.getByTestId('assign-tenant').locator('option').count();
    expect(tenantValues).toBeGreaterThan(1);

    await page.getByTestId('assign-tenant').selectOption({ index: 1 });
    await page.getByTestId('assign-note').fill('e2e assignment');
    await page.getByTestId('assign-submit').click();

    await expect(page.getByTestId('assignment-list')).toContainText('e2e assignment');
    await page.screenshot({ path: `${SHOTS}/07-private-assignment.png`, fullPage: true });

    // put it back
    const row = page.getByTestId('assignment-list').locator('li').first();
    await row.getByRole('button').click();
    await expect(page.getByTestId('assignment-empty')).toBeVisible();
    await page.getByTestId('visibility-select').selectOption('public');
    await expect(page.getByTestId('assignment-panel')).toHaveCount(0);
  });

  test('the screen is refused to a session that is not a platform admin', async ({ page, baseURL }) => {
    await page.context().clearCookies();
    const value = await encode({
      token: {
        sub: 'demo-user-alice',
        id: 'demo-user-alice',
        name: 'Alice',
        email: 'alice@fabrika.test',
        tenantId: 'demo-tenant',
        role: 'PIPELINE_MANAGER',
      },
      secret: SECRET,
      salt: COOKIE_NAME,
      maxAge: 60 * 60,
    });
    await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL as string }]);
    const res = await page.goto(URL);
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId('plan-admin')).toHaveCount(0);
  });


  test('publishing through the screen flips the version and writes an audit record', async ({ page }) => {
    // A throwaway plan, so the click-through publish does not move a real one.
    const planId = `e2e-pub-${Date.now()}`;
    await prisma.plan.create({
      data: {
        id: planId,
        name: 'E2E Publish Plan',
        monthlyCents: 5000,
        yearlyCents: 50000,
        currency: 'USD',
        seats: 5,
        workspaces: 2,
        aiCreditsMonthly: 100,
        modules: ['M3'],
        visibility: 'public',
      },
    });
    await prisma.planVersion.create({
      data: {
        planId,
        version: 1,
        status: 'published',
        monthlyCents: 5000,
        yearlyCents: 50000,
        currency: 'USD',
        seats: 5,
        workspaces: 2,
        aiCreditsMonthly: 100,
        modules: ['M3'],
        publishedAt: new Date(),
      },
    });

    try {
      await page.goto(URL);
      await page.getByTestId(`plan-row-${planId}`).click();
      await page.getByTestId('create-draft').click();
      await expect(page.getByTestId('draft-editor')).toBeVisible();

      await page.getByTestId('field-seats').fill('9');
      await page.getByTestId('save-draft').click();
      await expect(page.getByTestId('plan-notice')).toContainText('Kaydedildi');

      // publishing is not offered yet
      await expect(page.getByTestId('publish-version')).toHaveCount(0);
      await page.getByTestId('check-impact').click();
      await expect(page.getByTestId('impact-panel')).toBeVisible();

      await page.getByTestId('publish-version').click();
      await expect(page.getByTestId('version-status-2')).toHaveText('Yayında');
      await expect(page.getByTestId('version-status-1')).toHaveText('Arşiv');
      await page.screenshot({ path: `${SHOTS}/09-published.png`, fullPage: true });

      // the record the operator will be held to
      const event = await prisma.auditEvent.findFirst({
        where: { type: 'plan.version.published', target: `${planId}#v2` },
      });
      expect(event).not.toBeNull();
      expect(event?.actorId).toBe('demo-user-superadmin');
      const data = event?.data as Record<string, unknown>;
      expect((data.before as Record<string, unknown>).seats).toBe(5);
      expect((data.after as Record<string, unknown>).seats).toBe(9);

      // and the published version is now immutable on screen
      await expect(page.getByTestId('immutable-note-2')).toBeVisible();
    } finally {
      await prisma.auditEvent.deleteMany({ where: { target: { startsWith: planId } } });
      await prisma.planVersion.deleteMany({ where: { planId } });
      await prisma.plan.deleteMany({ where: { id: planId } });
    }
  });


  test('creating a draft seeds the editor with the live version, not zeros', async ({ page }) => {
    // Regression: createDraftAction used to return only the new version id, so
    // the form stayed at its initial zeros while the row behind it held the
    // live figures. The next "save" then wrote a $0.00 / 1 seat / 0 credit plan
    // over the draft — a silent downgrade one click away from being published.
    await page.goto(URL);
    await page.getByTestId('plan-row-basic').click();

    const liveCells = page.getByTestId('version-row-1').locator('td');
    const liveLimits = (await liveCells.nth(3).innerText()).trim(); // seats/spaces/credits
    const [liveSeats, liveSpaces, liveCredits] = liveLimits.split('/');

    await page.getByTestId('create-draft').click();
    await expect(page.getByTestId('draft-editor')).toBeVisible();

    await expect(page.getByTestId('field-seats')).toHaveValue(liveSeats as string);
    await expect(page.getByTestId('field-workspaces')).toHaveValue(liveSpaces as string);
    await expect(page.getByTestId('field-aiCreditsMonthly')).toHaveValue(liveCredits as string);
    await expect(page.getByTestId('field-monthlyCents')).not.toHaveValue('0');
    await page.screenshot({ path: `${SHOTS}/10-draft-seeded.png`, fullPage: true });

    await page.getByTestId('discard-draft').click();
    await expect(page.getByTestId('draft-editor')).toHaveCount(0);
  });

  test('the impact headline never contradicts the fields it lists as lowered', async ({ page }) => {
    // Regression: with no live tenant on the plan, the panel said "this change
    // lowers no tenant's limits" directly above "Lowered: seats, AI credits"
    // and "Removed modules: M2, M3, M5". Two opposite claims, one of them the
    // reason the operator is being asked to stop and read.
    await prisma.planVersion.deleteMany({ where: { planId: 'basic', status: 'draft' } });
    await page.goto(URL);
    await page.getByTestId('plan-row-basic').click();
    await page.getByTestId('create-draft').click();
    await expect(page.getByTestId('draft-editor')).toBeVisible();

    await page.getByTestId('field-seats').fill('1');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('plan-notice')).toContainText('Kaydedildi');
    await page.getByTestId('check-impact').click();
    await expect(page.getByTestId('impact-panel')).toBeVisible();

    const headline = (await page.getByTestId('impact-count').innerText()).trim();
    const dimensions = page.getByTestId('impact-dimensions');
    if (await dimensions.count()) {
      // Something is lowered, so the headline must not deny it.
      expect(headline).not.toContain('hiçbir');
      expect(headline).toContain('düşür');
    }
    await page.screenshot({ path: `${SHOTS}/11-impact-honest.png`, fullPage: true });

    await page.getByTestId('discard-draft').click();
  });

  test('a saved draft version survives a full page reload', async ({ page }) => {
    // The question this answers is not "did the form accept it" but "did it
    // reach Postgres": every earlier assertion in this file runs inside one
    // page life, and a screen that keeps its state in React state alone passes
    // all of them. So the draft is created, given a value nothing else in this
    // suite uses, and then the browser is reloaded from scratch.
    await page.goto(URL);
    await page.getByTestId('plan-row-basic').click();
    await page.getByTestId('create-draft').click();
    await expect(page.getByTestId('draft-editor')).toBeVisible();

    await page.getByTestId('field-seats').fill('7');
    await page.getByTestId('field-workspaces').fill('3');
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('plan-notice')).toContainText('Kaydedildi');
    await page.screenshot({ path: `${SHOTS}/12-draft-saved.png`, fullPage: true });

    await page.reload();
    await page.getByTestId('plan-row-basic').click();

    // The draft row is still in the history, still a draft, still holding 7.
    const draftRow = page.getByTestId('version-row-2');
    await expect(draftRow).toBeVisible();
    await expect(page.getByTestId('version-status-2')).toHaveText('Taslak');
    await expect(draftRow).toContainText('7');
    await page.getByTestId('edit-draft-2').click();
    await expect(page.getByTestId('field-seats')).toHaveValue('7');
    await expect(page.getByTestId('field-workspaces')).toHaveValue('3');
    await page.screenshot({ path: `${SHOTS}/13-draft-after-reload.png`, fullPage: true });

    // v1 is untouched by all of this — the published version stayed immutable.
    await expect(page.getByTestId('version-status-1')).toHaveText('Yayında');

    await page.getByTestId('discard-draft').click();
    await expect(page.getByTestId('draft-editor')).toHaveCount(0);
  });

  test('the English locale renders English labels, not Turkish', async ({ page }) => {
    await page.goto('/en/admin/billing/plans');
    await expect(page.getByTestId('plan-admin')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plan Management' })).toBeVisible();
    await page.getByTestId('plan-row-pro').click();
    await expect(page.getByTestId('immutable-note-1')).toHaveText('Immutable');
    await page.screenshot({ path: `${SHOTS}/08-english.png`, fullPage: true });
  });
});
