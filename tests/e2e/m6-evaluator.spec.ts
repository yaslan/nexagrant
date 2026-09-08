import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { M6_E2E, seed, rollback } from '../../scripts/seed-m6-e2e';
import { DEFAULT_CRITERIA } from '../../src/modules/m6/types';
import { shotsDir } from './fixtures/shots';

/**
 * M6 Evaluator Lens — happy path against a real browser and a real database.
 *
 * Create an evaluation from the form, see it in the panel dashboard, and confirm the
 * row that was written carries the tenant. Nothing here is stubbed: the page talks to
 * Postgres through the same server actions the product uses.
 */

const SHOTS = shotsDir('TASK-MTPZHMSPMDA66-screenshots');
const WORKSPACE = 'm6-e2e-ws';
const EVALUATIONS_URL = `/tr/${WORKSPACE}/opportunities/${M6_E2E.opportunityId}/evaluations`;
const PANEL_URL = `${EVALUATIONS_URL}/panel`;

/** Marks the test submits. Weighted by DEFAULT_CRITERIA: 5(.3)+4(.2)+5(.3)+3(.2) = 4.40. */
const MARKS: Record<string, number> = {
  Innovation: 5,
  Feasibility: 4,
  Impact: 5,
  Communication: 3,
};

const EXPECTED_PANEL_AVERAGE = DEFAULT_CRITERIA.reduce(
  (sum, c) => sum + (MARKS[c.name] ?? 0) * c.weight,
  0,
);

test.describe('M6 Evaluator Lens — panel scoring', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    // M6_E2E_KEEP=1 leaves the fixture in place so the written rows can be inspected
    // by hand after the run; `pnpm tsx scripts/seed-m6-e2e.ts --rollback` clears it.
    if (process.env.M6_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  const shot = (page: import('@playwright/test').Page, name: string) =>
    page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

  test('a seated reviewer scores a proposal and sees it on the dashboard', async ({ page }) => {
    // ── 1. Sign in as the seeded reviewer, landing on the panel page.
    // The cookie consent renders as a full-screen `inset-0` alertdialog and intercepts
    // pointer events across the whole page, including the sign-in button. Recording a
    // prior consent is the same state a returning user is in.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });

    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(PANEL_URL)}`);

    await page.locator('input[type="email"]').fill(M6_E2E.email);
    // Located by role in the form rather than by label: the button's copy differs per
    // locale and the same helper is reused by the English test below.
    await page.locator('form button[type="submit"]').click();

    await page.waitForURL(`**${PANEL_URL}`, { timeout: 30_000 });
    // Next's dev-mode streaming leaves the outgoing page in the DOM for a moment, so a
    // bare getByTestId can transiently match twice. Settle first, then scope to <main>.
    await page.waitForLoadState('networkidle');
    const app = page.getByRole('main');

    // ── 2. The form is bound to the real evaluation, and says what it is.
    const form = app.getByTestId('m6-evaluator-form');
    await expect(form).toBeVisible();
    await expect(form.getByTestId('m6-internal-badge')).toContainText('İç ön değerlendirme');

    // Before submitting, the dashboard has no score for this proposal — and says so in
    // words. This asserted an em dash, which reads as an empty column rather than as a
    // statement about the evaluation; what it must never read as is 0.00.
    await expect(app.getByTestId('m6-dashboard')).toBeVisible();
    const panelScoreCell = app.getByTestId('m6-panel-score');
    await expect(panelScoreCell).toHaveText('Hesaplanmadı');
    await expect(panelScoreCell).not.toHaveText('0.00');
    // The reason is carried on the cell, not left for the reader to guess.
    await expect(panelScoreCell.getByTestId('m6-not-measured')).toHaveAttribute(
      'title',
      /hakem puanını göndermedi/,
    );
    // No marks means no pair of reviewers to compare, so consensus is unmeasured too.
    await expect(app.getByTestId('m6-consensus')).toHaveText('Ölçülmedi');
    await shot(page, '01-panel-before-scoring');
    // The dashboard sits below the fold on this page, so the unmeasured state also gets
    // an element shot — a full-page capture scrolled to the top does not show it.
    await app
      .getByTestId('m6-dashboard')
      .screenshot({ path: `${SHOTS}/01b-dashboard-not-measured.png` });

    // ── 3. Move every slider, then submit.
    for (const [name, mark] of Object.entries(MARKS)) {
      const slider = app.getByTestId(`m6-criterion-${name.toLowerCase()}`);
      await slider.fill(String(mark));
      await expect(app.getByTestId(`m6-criterion-${name.toLowerCase()}-value`)).toHaveText(`${mark}/5`);
    }

    await expect(app.getByTestId('m6-preview-average')).toHaveText(
      `${EXPECTED_PANEL_AVERAGE.toFixed(1)}/5`,
    );

    await shot(page, '02-form-filled');
    await app.getByTestId('m6-form-submit').click();

    // ── 4. The dashboard now shows the score the save computed, not a stale one.
    await expect(app.getByTestId('m6-panel-score')).toHaveText(
      EXPECTED_PANEL_AVERAGE.toFixed(2),
      { timeout: 20_000 },
    );

    // The ESR column is fed by Proposal.esrScores (12.5 / 15 -> 4.33 on the 1-5 scale),
    // so the delta on screen is derived from a record, not a constant in the page.
    const expectedEsr = (M6_E2E.esrTotal / 15) * 4 + 1;
    await expect(app.getByTestId('m6-dashboard-row')).toContainText(expectedEsr.toFixed(2));

    // The fixture seats one reviewer. A score now exists, but a consensus still does
    // not: agreement is a statement about reviewers agreeing with each other, and there
    // is no second opinion here. This cell used to read "Güçlü" — solid agreement,
    // asserted from a panel of one.
    await expect(app.getByTestId('m6-consensus')).toHaveText('Ölçülmedi');

    await shot(page, '03-dashboard-after-save');
    await app
      .getByTestId('m6-dashboard')
      .screenshot({ path: `${SHOTS}/03b-dashboard-scored.png` });

    // ── 5. The rows that were actually written carry the tenant.
    const scores = await prisma.score.findMany({
      where: { reviewerId: M6_E2E.reviewerId },
      include: { criterion: { select: { name: true } } },
    });
    expect(scores).toHaveLength(DEFAULT_CRITERIA.length);
    for (const row of scores) {
      expect(row.tenantId).toBe(M6_E2E.tenantId);
      expect(row.score).toBe(MARKS[row.criterion.name]);
      expect(row.submittedAt).not.toBeNull();
    }

    const evaluation = await prisma.evaluation.findUniqueOrThrow({
      where: { id: M6_E2E.evaluationId },
    });
    expect(evaluation.tenantId).toBe(M6_E2E.tenantId);
    expect(evaluation.avgScore).toBeCloseTo(EXPECTED_PANEL_AVERAGE, 5);
    // Every seated reviewer has submitted, so the evaluation is complete.
    expect(evaluation.status).toBe('completed');

    const reviewer = await prisma.reviewer.findUniqueOrThrow({ where: { id: M6_E2E.reviewerId } });
    expect(reviewer.status).toBe('completed');
  });

  test('the English locale renders the English M6 copy', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });

    const enUrl = PANEL_URL.replace('/tr/', '/en/');
    await page.goto(`/en/login?callbackUrl=${encodeURIComponent(enUrl)}`);
    await page.locator('input[type="email"]').fill(M6_E2E.email);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${enUrl}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const app = page.getByRole('main');
    await expect(app.getByTestId('m6-evaluator-form')).toBeVisible();
    // Both surfaces carry the badge, so scope to the form's copy of it.
    await expect(app.getByTestId('m6-evaluator-form').getByTestId('m6-internal-badge')).toContainText(
      'Internal pre-assessment',
    );
    await expect(app.getByTestId('m6-dashboard')).toContainText('Panel Evaluation Dashboard');
    await expect(app.getByTestId('m6-criterion-innovation')).toBeVisible();

    await shot(page, '04-panel-english-locale');
  });

  /**
   * CLAUDE.md forbids presenting Evaluator Lens output as an official score. The panel
   * route was already covered; the Evaluator Lens page itself carried the disclaimer as
   * a hard-coded Turkish string, so an English reader got no readable warning above the
   * same marks. Both locales are asserted here so a regression cannot pass in one.
   */
  for (const { locale, loginPath, badge } of [
    { locale: 'tr', loginPath: 'giris', badge: 'İç ön değerlendirme' },
    { locale: 'en', loginPath: 'login', badge: 'Internal pre-assessment' },
  ]) {
    test(`the Evaluator Lens page states it is an internal pre-assessment (${locale})`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem(
          'fabrika_cookie_consent',
          JSON.stringify({ necessary: true, analytics: true, marketing: true }),
        );
      });

      const url = EVALUATIONS_URL.replace('/tr/', `/${locale}/`);
      await page.goto(`/${locale}/${loginPath}?callbackUrl=${encodeURIComponent(url)}`);
      await page.locator('input[type="email"]').fill(M6_E2E.email);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(`**${url}`, { timeout: 30_000 });
      await page.waitForLoadState('networkidle');

      const app = page.getByRole('main');
      const disclaimer = app.getByTestId('m6-internal-badge');
      await expect(disclaimer).toBeVisible();
      await expect(disclaimer).toContainText(badge);
      // The disclaimer has to sit with the marks, not below the fold.
      await expect(disclaimer).toBeInViewport();

      await shot(page, `05-evaluator-lens-disclaimer-${locale}`);
    });
  }
});
