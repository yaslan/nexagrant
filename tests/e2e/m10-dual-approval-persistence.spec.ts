import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { prisma } from '../../src/lib/db';
import { PLAN_E2E, seed, rollback } from '../../scripts/seed-plan-e2e';

/**
 * TASK-MTSAIWF4ENUSL — the two middle steps of the M10 dual approval used to live
 * in React state and nowhere else. Finance approved, the page was reloaded, and
 * the approval was gone: `FollowupDoc.signedAt` was the only durable fact, so the
 * banner's stages 2 and 3 were an in-memory claim about a corporate sign-off.
 *
 * The reload is therefore the whole test. Two questions are asked on the real
 * screen, with real clicks and real sessions:
 *
 *  1. Is a finance approval still there after F5? Answered by driving the flow,
 *     reloading the page, and reading both the banner and the `DualApprovalStep`
 *     row behind it. A screenshot is taken on each side of the reload.
 *  2. Does "dual" mean two people? Answered by having the finance approver try to
 *     sign legal as well. The refusal has to be visible on the screen *and*
 *     absent from the database — an unsigned document, not an error toast over a
 *     row that was written anyway.
 *
 * Identity comes from sessions minted per run, exactly as in
 * `m10-audit-identity.spec.ts`: a display name that did not exist when the code
 * was written cannot be produced by a hard-coded or defaulted actor.
 */

const SHOTS = 'docs/agent-results/TASK-MTSAIWF4ENUSL-screenshots';
const ULTRA = PLAN_E2E.ultra;
const DOCS_URL = `/tr/${ULTRA.workspaceSlug}/opportunities/${ULTRA.opportunityId}/documents`;
const COOKIE_NAME = 'authjs.session-token';
const SECRET =
  process.env.AUTH_SECRET || 'fabrika-secret-key-horizon-europe-2026-super-secure';

const RUN = Date.now().toString(36);
const ACTOR_A = `E2E Submitter ${RUN}`;
const ACTOR_B = `E2E Finance ${RUN}`;

/** The finance approver — a real member of the same tenant, seeded here. */
const USER_B = {
  id: 'm10-persist-user-b',
  email: 'm10-persist-b@fabrika.test',
  role: 'PIPELINE_MANAGER',
};

async function mintSession(userId: string, name: string, email: string): Promise<string> {
  return encode({
    token: { sub: userId, id: userId, name, email, tenantId: ULTRA.tenantId, role: ULTRA.role },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
}

async function setSession(context: BrowserContext, cookie: string, baseURL: string): Promise<void> {
  await context.clearCookies({ name: COOKIE_NAME });
  await context.addCookies([{ name: COOKIE_NAME, value: cookie, url: baseURL }]);
}

/** The consent dialog is a modal overlay; without this it swallows every click. */
async function primeConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

async function newDoc(kind: string): Promise<{ id: string }> {
  return prisma.followupDoc.create({
    data: {
      tenantId: ULTRA.tenantId,
      opportunityId: ULTRA.opportunityId,
      kind,
      version: 1,
      contentUrl: `https://storage.fabrika.app/e2e/${kind.toLowerCase()}.pdf`,
    },
    select: { id: true },
  });
}

/** The stored half of the flow — what a reload will read back. */
async function storedFlow(docId: string) {
  const row = await prisma.followupDoc.findUnique({
    where: { id: docId },
    select: {
      signedAt: true,
      approvalSubmittedAt: true,
      approvalSubmittedByName: true,
      approvalSteps: { select: { department: true, actorName: true }, orderBy: { decidedAt: 'asc' } },
    },
  });
  return row!;
}

test.describe('M10 dual approval persistence', () => {
  test.beforeAll(async () => {
    await seed();
    await prisma.user.upsert({
      where: { id: USER_B.id },
      update: { email: USER_B.email },
      create: { id: USER_B.id, email: USER_B.email, name: USER_B.id, locale: 'tr' },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: ULTRA.tenantId, userId: USER_B.id } },
      update: { role: USER_B.role, workspaceIds: [ULTRA.workspaceId] },
      create: {
        userId: USER_B.id,
        tenantId: ULTRA.tenantId,
        role: USER_B.role,
        workspaceIds: [ULTRA.workspaceId],
      },
    });
  });

  test.afterAll(async () => {
    if (process.env.PLAN_E2E_KEEP !== '1') {
      await prisma.membership.deleteMany({ where: { userId: USER_B.id } });
      await prisma.user.deleteMany({ where: { id: USER_B.id } });
      await rollback();
    }
    await prisma.$disconnect();
  });

  test('a finance approval is still there after the page is reloaded', async ({
    page,
    context,
    baseURL,
  }) => {
    const doc = await newDoc('NDA');
    const banner = page.getByTestId('dual-approval-banner');
    const trail = page.getByTestId('approval-audit').locator('li');

    await primeConsent(page);
    await setSession(context, await mintSession(ULTRA.userId, ACTOR_A, ULTRA.email), baseURL!);
    await page.goto(DOCS_URL);

    // ── A opens the flow, B signs finance ─────────────────────────────────────────
    await page.getByTestId(`submit-approval-${doc.id}`).click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_FINANCE_APPROVAL');

    await setSession(context, await mintSession(USER_B.id, ACTOR_B, USER_B.email), baseURL!);
    await page.getByTestId('approve-finance').click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_LEGAL_APPROVAL');
    await expect(page.getByTestId('approval-step-2')).toHaveAttribute('data-state', 'done');
    await page.screenshot({ path: `${SHOTS}/01-finance-approved.png`, fullPage: false });

    // ── the reload: the question this whole file exists for ──────────────────────
    await page.reload();

    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_LEGAL_APPROVAL');
    await expect(page.getByTestId('approval-step-2')).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('approval-step-3')).toHaveAttribute('data-state', 'active');
    await expect(trail).toHaveCount(2);
    await expect(trail.nth(0)).toContainText(ACTOR_A);
    await expect(trail.nth(1)).toContainText(ACTOR_B);
    await page.screenshot({ path: `${SHOTS}/02-after-reload-still-approved.png`, fullPage: false });

    // The screen is showing a row, not a memory.
    const stored = await storedFlow(doc.id);
    expect(stored.approvalSubmittedByName).toBe(ACTOR_A);
    expect(stored.approvalSteps).toEqual([{ department: 'FINANCE', actorName: ACTOR_B }]);
    // Finance is not a signature: the document is still unsigned.
    expect(stored.signedAt).toBeNull();
  });

  test('the finance approver cannot also approve legal, and nothing is written when they try', async ({
    page,
    context,
    baseURL,
  }) => {
    const doc = await newDoc('LOI');
    const banner = page.getByTestId('dual-approval-banner');

    await primeConsent(page);
    await setSession(context, await mintSession(ULTRA.userId, ACTOR_A, ULTRA.email), baseURL!);
    await page.goto(DOCS_URL);

    await page.getByTestId(`submit-approval-${doc.id}`).click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_FINANCE_APPROVAL');

    await setSession(context, await mintSession(USER_B.id, ACTOR_B, USER_B.email), baseURL!);
    await page.getByTestId('approve-finance').click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_LEGAL_APPROVAL');

    // Same session, the other department. This is the click that has to be refused.
    await page.getByTestId('approve-legal').click();

    const error = page.getByTestId('approval-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('iki kişi gerektirir');
    // The stage did not move, and step 4 is not lit.
    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_LEGAL_APPROVAL');
    await expect(page.getByTestId('approval-complete')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/03-same-actor-refused.png`, fullPage: false });

    // The refusal is a refusal, not a message over a row that was written anyway.
    const stored = await storedFlow(doc.id);
    expect(stored.approvalSteps).toEqual([{ department: 'FINANCE', actorName: ACTOR_B }]);
    expect(stored.signedAt).toBeNull();

    // ── and a second person does complete it ─────────────────────────────────────
    await setSession(context, await mintSession(ULTRA.userId, ACTOR_A, ULTRA.email), baseURL!);
    await page.reload();
    await page.getByTestId('approve-legal').click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'APPROVED_AND_SIGNED');

    await page.reload();
    await expect(banner).toHaveAttribute('data-approval-stage', 'APPROVED_AND_SIGNED');
    await expect(page.getByTestId('approval-complete')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/04-completed-after-reload.png`, fullPage: false });

    const done = await storedFlow(doc.id);
    expect(done.approvalSteps.map((s: { department: string }) => s.department)).toEqual([
      'FINANCE',
      'LEGAL',
    ]);
    expect(done.approvalSteps.map((s: { actorName: string }) => s.actorName)).toEqual([
      ACTOR_B,
      ACTOR_A,
    ]);
    // Stage 4 is an outcome: the signature is written in the same transaction.
    expect(done.signedAt).not.toBeNull();
  });
});
