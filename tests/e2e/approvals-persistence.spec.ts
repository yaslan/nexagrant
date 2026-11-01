import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import type { Role } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { PLAN_E2E, seed, rollback } from '../../scripts/seed-plan-e2e';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';
import { requireId } from '../helpers/teardown-guard';

/**
 * AKTAR-MURBCJ0A-1 (cae-fb K-2) — the approvals screen (Onay Merkezi) used to
 * answer "created" and "approved" from stubs that wrote nothing: the new request
 * was on screen until F5, and an approval was a status flip in React state.
 *
 * The reload is the test. Real clicks, real sessions, two different people:
 *
 *  1. The requester creates a request, reloads, and it is still listed — and
 *     Postgres has the row.
 *  2. A second user (TENANT_ADMIN) approves it; after a reload it is still
 *     APPROVED, and the row names that user as approver.
 *  3. A decision the server refuses (the request was cancelled meanwhile) is
 *     shown as an error, and the card does not turn green.
 */

const SHOTS = shotsDir('AKTAR-MURBCJ0A-1-screenshots');
const ULTRA = PLAN_E2E.ultra;
const URL = `/tr/${ULTRA.workspaceSlug}/approvals`;
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const RUN = Date.now().toString(36);

const APPROVER: { id: string; email: string; role: Role } = {
  id: 'approvals-e2e-approver',
  email: 'approvals-e2e-approver@fabrika.test',
  role: 'TENANT_ADMIN',
};

async function mintSession(userId: string, email: string, role: string): Promise<string> {
  return encode({
    token: { sub: userId, id: userId, name: `E2E ${userId} ${RUN}`, email, tenantId: ULTRA.tenantId, role },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
}

async function setSession(context: BrowserContext, cookie: string, baseURL: string): Promise<void> {
  await context.clearCookies({ name: COOKIE_NAME });
  await context.addCookies([{ name: COOKIE_NAME, value: cookie, url: baseURL }]);
}

const asRequester = async (context: BrowserContext, baseURL: string) =>
  setSession(context, await mintSession(ULTRA.userId, ULTRA.email, ULTRA.role), baseURL);
const asApprover = async (context: BrowserContext, baseURL: string) =>
  setSession(context, await mintSession(APPROVER.id, APPROVER.email, APPROVER.role), baseURL);

async function primeConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

/** Opens the new-request modal and submits it; returns the id the server gave the row. */
async function createThroughUi(page: Page, title: string): Promise<string> {
  await page.getByTestId('approval-new').click();
  await page.getByTestId('approval-title-input').fill(title);
  await page.getByTestId('approval-create-submit').click();
  const card = page.locator('[data-testid^="approval-request-"]', { hasText: title });
  await expect(card).toHaveAttribute('data-status', 'PENDING');
  const testId = await card.getAttribute('data-testid');
  return testId!.replace('approval-request-', '');
}

test.describe('Onay Merkezi persistence', () => {
  test.beforeAll(async () => {
    await seed();
    await prisma.user.upsert({
      where: { id: APPROVER.id },
      update: { email: APPROVER.email },
      create: { id: APPROVER.id, email: APPROVER.email, name: APPROVER.id, locale: 'tr' },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: ULTRA.tenantId, userId: APPROVER.id } },
      update: { role: APPROVER.role, workspaceIds: [ULTRA.workspaceId] },
      create: { userId: APPROVER.id, tenantId: ULTRA.tenantId, role: APPROVER.role, workspaceIds: [ULTRA.workspaceId] },
    });
  });

  test.afterAll(async () => {
    if (process.env.PLAN_E2E_KEEP !== '1') {
      await prisma.approvalRequest.deleteMany({
        where: { tenantId: requireId(ULTRA.tenantId, 'tenantId'), title: { contains: requireId(RUN, 'RUN') } },
      });
      await prisma.membership.deleteMany({ where: { userId: APPROVER.id } });
      await prisma.user.deleteMany({ where: { id: APPROVER.id } });
      await rollback();
    }
    await prisma.$disconnect();
  });

  test('a created request survives a reload, and another user’s approval stays APPROVED', async ({
    page,
    context,
    baseURL,
  }) => {
    const title = `E2E onay talebi ${RUN}`;
    await primeConsent(page);

    // ── 1. the requester creates, then reloads ────────────────────────────────
    await asRequester(context, baseURL!);
    await page.goto(URL);
    const id = await createThroughUi(page, title);
    const card = page.getByTestId(`approval-request-${id}`);
    await page.screenshot({ path: `${SHOTS}/01-created.png`, fullPage: false });

    await page.reload();
    await page.getByTestId('approvals-tab-my_requests').click();
    await expect(card).toHaveAttribute('data-status', 'PENDING');
    await expect(card).toContainText(title);
    // Own request: no approve button for the maker.
    await expect(page.getByTestId(`approve-${id}`)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/02-after-reload-still-listed.png`, fullPage: false });

    const stored = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ tenantId: ULTRA.tenantId, requesterId: ULTRA.userId, status: 'PENDING', title });

    // ── 2. another user approves, then reloads ────────────────────────────────
    await asApprover(context, baseURL!);
    await page.reload();
    await page.getByTestId(`approve-${id}`).click();
    await expect(page.getByTestId('approvals-error')).toHaveCount(0);
    await page.getByTestId('approvals-tab-history').click();
    await expect(card).toHaveAttribute('data-status', 'APPROVED');

    await page.reload();
    await page.getByTestId('approvals-tab-history').click();
    await expect(card).toHaveAttribute('data-status', 'APPROVED');
    await page.screenshot({ path: `${SHOTS}/03-approved-after-reload.png`, fullPage: false });

    const decided = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    expect(decided).toMatchObject({ status: 'APPROVED', approverId: APPROVER.id });
    const audit = await prisma.auditEvent.findMany({ where: { target: id }, select: { type: true, actorId: true }, orderBy: { createdAt: 'asc' } });
    expect(audit).toEqual([
      { type: 'approval.requested', actorId: ULTRA.userId },
      { type: 'approval.approved', actorId: APPROVER.id },
    ]);
  });

  test('a refused decision shows the reason and does not turn the card green', async ({ page, context, baseURL }) => {
    const title = `E2E iptal edilen talep ${RUN}`;
    await primeConsent(page);

    await asRequester(context, baseURL!);
    await page.goto(URL);
    const id = await createThroughUi(page, title);

    // The approver loads the page while the request is still PENDING …
    await asApprover(context, baseURL!);
    await page.reload();
    const card = page.getByTestId(`approval-request-${id}`);
    await expect(card).toHaveAttribute('data-status', 'PENDING');

    // … and the requester cancels it before the approver clicks.
    await prisma.approvalRequest.update({ where: { id }, data: { status: 'CANCELLED' } });

    await page.getByTestId(`approve-${id}`).click();
    const error = page.getByTestId('approvals-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('artık beklemede değil');
    await expect(card).toHaveAttribute('data-status', 'PENDING');
    await page.screenshot({ path: `${SHOTS}/04-refused-shown.png`, fullPage: false });

    const stored = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ status: 'CANCELLED', approverId: null });
  });
});
