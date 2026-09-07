import { test, expect, type Page } from '@playwright/test';

import { prisma, withTenant } from '../../src/lib/db';
import { computeG0ForOpportunity } from '../../src/lib/scoring/g0-compute';
import { G0_E2E, seed, rollback } from '../../scripts/seed-g0-e2e';

/**
 * TASK-MTQ63RR8Z0G8E — the G0 score on screen is the canonical scorer's, in a real browser.
 *
 * The defect this guards against: `Opportunity.g0Score` used to be filled by a seed literal or by
 * `Math.floor(Math.random() * 15 + 80)`, the board drew that number as a triage score, and
 * `gates/evaluate.ts` compared it against the 70 threshold. Every existing check for this lives in
 * a unit test with a stubbed Prisma client, and `scripts/seed-gate-e2e.ts` deliberately gates on
 * G2 because "G0 refuses when the tenant has no scoring evidence on file" — so no end-to-end test
 * ever watched a G0 score reach a screen.
 *
 * Three things are proved here, and the third is why the first two are not enough on their own:
 *
 *   1. The detail page shows the number `computeG0ForOpportunity` returns for the same
 *      opportunity — asserted against a live call to the scorer, not against a literal copied
 *      out of the UI, so a scorer change that moves the number keeps the test honest.
 *   2. The column is not the source. The score is on screen while `Opportunity.g0Score` is still
 *      `null`; running the gate then writes it, together with the `TopicMatch` breakdown that
 *      CLAUDE.md §7 requires behind any figure a user reads.
 *   3. An opportunity with **no** evidence whose `g0Score` column holds the old fabricated 92
 *      renders "Hesaplanamadı" — not 92, and not the 0 that "absence is not zero" forbids.
 */

const SHOTS = 'docs/agent-results/TASK-MTQ63RR8Z0G8E-qa-screenshots';

const BOARD_URL = `/tr/${G0_E2E.workspaceSlug}/pipeline`;
const SCORED_URL = `${BOARD_URL}/${G0_E2E.scoredOppId}`;
const UNSCORED_URL = `${BOARD_URL}/${G0_E2E.unscoredOppId}`;

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

async function signIn(page: Page, target: string) {
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill(G0_E2E.email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

/** What the canonical scorer says right now, read through the same tenant context the app uses. */
async function canonicalScore(opportunityId: string): Promise<number | null> {
  const computation = await withTenant(G0_E2E.tenantId, (tx) =>
    computeG0ForOpportunity(tx, G0_E2E.tenantId, opportunityId),
  );
  return computation?.score ?? null;
}

test.describe('G0 score comes from the canonical scorer', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    // G0_E2E_KEEP=1 leaves the fixture in place so the rows can be inspected by hand.
    if (process.env.G0_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('the screen shows the computed score, and says so when it cannot be computed', async ({
    page,
  }) => {
    await acceptCookies(page);

    // The number to beat, computed before the browser is involved. Non-null and not one of the
    // literals the product used to invent — a fixture that scored 92 by coincidence would make
    // the whole test vacuous.
    const expected = await canonicalScore(G0_E2E.scoredOppId);
    expect(expected).not.toBeNull();
    expect(expected).not.toBe(G0_E2E.fabricatedScore);

    // The column is still empty at this point: the seed reset it and nothing has scored yet.
    const beforeVisit = await prisma.opportunity.findUnique({
      where: { id: G0_E2E.scoredOppId },
      select: { g0Score: true },
    });
    expect(beforeVisit?.g0Score).toBeNull();

    // ── 1. The opportunity with evidence: the page computes and shows the real number.
    await signIn(page, SCORED_URL);
    const app = page.getByRole('main');
    const scoreCard = app.getByTestId('pipeline-g0-score');

    await expect(scoreCard).toContainText(`${expected}/100`);
    // Evidence coverage is stated, and at least one criterion really was measured — a card that
    // said "0/9 measured" would be a computed number with nothing behind it.
    await expect(scoreCard).toContainText('Kanıt:');
    await expect(scoreCard).not.toContainText('0/9 ölçüt ölçüldü');
    await shot(page, '01-detail-computed-score');

    // Rendering wrote nothing: the figure came from the scorer on the request, not the column.
    const afterVisit = await prisma.opportunity.findUnique({
      where: { id: G0_E2E.scoredOppId },
      select: { g0Score: true },
    });
    expect(afterVisit?.g0Score).toBeNull();

    // ── 2. Running the gate stores the same number, with its breakdown.
    await app.getByTestId('pipeline-evaluate-gate').click();
    await expect(app.getByTestId('pipeline-gate-result')).toBeVisible({ timeout: 30_000 });
    await shot(page, '02-detail-after-gate-run');

    const stored = await prisma.opportunity.findUnique({
      where: { id: G0_E2E.scoredOppId },
      select: { g0Score: true },
    });
    expect(stored?.g0Score).toBe(expected);

    // CLAUDE.md §7: the figure a user reads is backed by a record. `TopicMatch.breakdown` is
    // where the per-criterion trail is filed.
    const match = await prisma.topicMatch.findUnique({
      where: { tenantId_topicId: { tenantId: G0_E2E.tenantId, topicId: G0_E2E.topicId } },
      select: { g0Score: true, breakdown: true },
    });
    expect(match?.g0Score).toBe(expected);
    expect(match?.breakdown).toMatchObject({ score: expected });

    // The gate decided on the computed score, not on the column it found.
    const decision = await prisma.gateDecision.findFirst({
      where: { opportunityId: G0_E2E.scoredOppId, gate: 'G0' },
      orderBy: { decidedAt: 'desc' },
      select: { inputs: true },
    });
    const inputs = decision?.inputs as Record<string, unknown> | undefined;
    expect(inputs?.calculatedG0Score).toBe(expected);
    // What the column held when the gate ran — recorded for the audit trail, and it was null.
    expect(inputs?.g0Score ?? null).toBeNull();

    // ── 3. The board badge is the computed number — and only ever a computed number.
    await page.goto(BOARD_URL);
    await page.waitForLoadState('networkidle');
    const card = app
      .locator('div')
      .filter({ hasText: G0_E2E.scoredOppTitle })
      .last();
    await expect(card).toContainText(`${expected}`);

    // The board used to draw `Opportunity.g0Score` straight from the column, so the unscorable
    // opportunity wore a green "⭐ 92" here while its own detail page said "Hesaplanamadı" —
    // two screens, two different numbers, for the same opportunity. The badge is now read from
    // the evidence record (CLAUDE.md §7), so a card with no evidence carries no score at all.
    const board = app.getByTestId('pipeline-board');
    await expect(board).not.toContainText(String(G0_E2E.fabricatedScore));
    await shot(page, '03-board-computed-badge');

    // ── 4. The control: no evidence, a fabricated 92 in the column, and an honest screen.
    await page.goto(UNSCORED_URL);
    await page.waitForLoadState('networkidle');
    const unscoredCard = app.getByTestId('pipeline-g0-score');
    await expect(app.getByTestId('pipeline-g0-unscored')).toBeVisible();
    await expect(unscoredCard).toContainText('Hesaplanamadı');
    await expect(unscoredCard).not.toContainText(String(G0_E2E.fabricatedScore));
    // "Absence is not zero": an unscorable opportunity must not be shown as a nil score either.
    await expect(unscoredCard).not.toContainText('0/100');
    await shot(page, '04-detail-not-computed');

    // The seeded literal is still in the column — the screen simply refuses to read it.
    const untouched = await prisma.opportunity.findUnique({
      where: { id: G0_E2E.unscoredOppId },
      select: { g0Score: true },
    });
    expect(untouched?.g0Score).toBe(G0_E2E.fabricatedScore);
  });
});
