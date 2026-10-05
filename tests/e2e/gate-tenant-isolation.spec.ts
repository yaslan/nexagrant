import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { evaluateGate, GateOpportunityNotFoundError } from '../../src/lib/gates/evaluate';
import { GATE_E2E, seed, rollback } from '../../scripts/seed-gate-e2e';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

/**
 * Stage gate — happy path in a real browser, isolation against the real database.
 *
 * TASK-MTQZMLLZE1I29: `evaluateGate` read the opportunity with `findUnique({ where: { id } })` and
 * advanced its stage with `update({ where: { id } })` — no tenant clause on either. The only thing
 * that stopped tenant B's id being evaluated, filed and moved was the single caller checking
 * ownership first. The unit suite (tests/gates.test.ts) proves the refusal against mocks; this file
 * proves it against Postgres, and proves the fix did not cost tenant A its working button.
 */

const SHOTS = shotsDir('TASK-MTQZMLLZE1I29-screenshots');
const DETAIL_URL = `/tr/${GATE_E2E.workspaceSlug}/pipeline/${GATE_E2E.opportunityId}`;

test.describe.configure({ mode: 'serial' });

test.describe('Stage gate — tenant isolation', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    // GATE_E2E_KEEP=1 leaves the rows in place for inspection after a run.
    if (process.env.GATE_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('tenant A can still run its own gate, and the decision is filed', async ({ page }) => {
    // Sign in with JWT fixture pattern
    await signInAs(page, {
      id: GATE_E2E.userId,
      email: GATE_E2E.email,
      role: 'TENANT_OWNER',
      tenantId: GATE_E2E.tenantId,
    });
    await page.goto(DETAIL_URL);

    // A network-idle wait stood here and timed the test out about half the time:
    // a dev server never goes fully quiet, so "no requests for 500 ms" is a race, not a signal.
    // The button is what the test is waiting for, so it waits for the button.
    const button = page.locator('main').getByTestId('pipeline-evaluate-gate');
    await expect(button).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/01-detail-before-gate.png`, fullPage: true });
    await button.click();

    // The banner is the gate's answer on screen; the error band would mean the action refused.
    await expect(page.getByTestId('pipeline-gate-error')).toHaveCount(0);
    await expect(page.locator('main').getByTestId('pipeline-gate-result')).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: `${SHOTS}/02-detail-after-gate.png`, fullPage: true });

    // The row the click wrote, read straight from Postgres.
    const decision = await prisma.gateDecision.findFirst({
      where: { opportunityId: GATE_E2E.opportunityId },
      orderBy: { decidedAt: 'desc' },
    });
    expect(decision).not.toBeNull();
    expect(decision!.tenantId).toBe(GATE_E2E.tenantId);
    expect(decision!.gate).toBe('G2');
    expect(decision!.passed).toBe(true);

    // A passing G2 advances the stage — the write that used to be `update({ where: { id } })`.
    const opp = await prisma.opportunity.findUnique({ where: { id: GATE_E2E.opportunityId } });
    expect(opp!.stage).toBe('G2');
  });

  test('tenant A cannot gate tenant B’s opportunity, against the real database', async () => {
    const before = await prisma.opportunity.findUnique({
      where: { id: GATE_E2E.otherOpportunityId },
      select: { stage: true, tenantId: true },
    });
    // Asserted, not assumed: if the fixture were gone, the refusal below would prove nothing —
    // "not found" is the same answer for a row that never existed as for one that is not yours.
    expect(before, 'tenant B fixture must exist for this test to mean anything').not.toBeNull();
    expect(before!.tenantId).toBe(GATE_E2E.otherTenantId);

    await expect(
      evaluateGate(GATE_E2E.otherOpportunityId, 'G2', GATE_E2E.tenantId, GATE_E2E.userId),
    ).rejects.toBeInstanceOf(GateOpportunityNotFoundError);

    // Refused means refused: nothing filed under either tenant, and B's stage untouched.
    const filed = await prisma.gateDecision.count({
      where: { opportunityId: GATE_E2E.otherOpportunityId },
    });
    expect(filed).toBe(0);

    const after = await prisma.opportunity.findUnique({
      where: { id: GATE_E2E.otherOpportunityId },
      select: { stage: true },
    });
    expect(after!.stage).toBe(before!.stage);
  });
});
