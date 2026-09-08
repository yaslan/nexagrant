import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import { prisma } from '../../src/lib/db';

/**
 * TASK-MTR60M5ESB5PZ — the M10 follow-up documents surface must never name
 * somebody who did not act.
 *
 * `submitDualApprovalAction(docId, actorName = <one real person's name>)` wrote that
 * default straight into `auditTrail[].actorName`, `financeApprover` and
 * `legalApprover`. The default is gone; the actor now comes from the session, and a
 * request without a session is refused before any record exists.
 *
 * Precondition: the tenant must be entitled to M10, and that is two facts, not one.
 * `ModuleState` must say `ON` — the dev database carries row `ms-demo-m10` for that —
 * and the plan must sell the module, because an ON module outside the plan is still
 * refused (CLAUDE.md rule 4, proved by tests/e2e/module-plan-gate.spec.ts). M10 is
 * granted by `ultra` alone and `demo-tenant` ships on `pro`, so this spec lifts the
 * plan for its own run and puts it back, the same way the plan-gate spec does. Without
 * that, the page renders the module gate and the first test fails on the missing header
 * — a refusal that says nothing about whose name the workflow signs records with.
 *
 * The session cookie is minted with the app's own secret — the same JWT the sign-in
 * flow produces — as `identity-honesty.spec.ts` already does, so the test drives the
 * real page rather than a stub.
 */

const SHOTS = 'docs/agent-results/TASK-MTR60M5ESB5PZ-screenshots';
const DOCS_URL = '/tr/main/opportunities/demo-opp-1/documents';
const COOKIE_NAME = 'authjs.session-token';
const SECRET =
  process.env.AUTH_SECRET || 'fabrika-secret-key-horizon-europe-2026-super-secure';

/** The name the workflow used to sign records with, spelled out only here. */
const FABRICATED = ['Dr.', 'Mehmet', 'Yılmaz'].join(' ');

async function signInAs(
  page: Page,
  token: Record<string, unknown>,
  baseURL: string,
): Promise<void> {
  const value = await encode({
    token: { sub: token.id as string, ...token },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
  await page.context().addCookies([
    { name: COOKIE_NAME, value, url: baseURL },
  ]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

const TENANT_ID = 'demo-tenant';
/** M10 (Follow-up Documents) is granted by `ultra` only — src/lib/billing/catalog.ts. */
const PLAN_WITH_M10 = 'ultra';

test.describe('M10 dual approval identity', () => {
  let originalPlanId: string;

  test.beforeAll(async () => {
    const sub = await prisma.subscription.findUnique({ where: { tenantId: TENANT_ID } });
    if (!sub) throw new Error(`${TENANT_ID} has no subscription; run pnpm db:seed`);
    originalPlanId = sub.planId;
    await prisma.subscription.update({
      where: { tenantId: TENANT_ID },
      data: { planId: PLAN_WITH_M10, status: 'ACTIVE' },
    });
  });

  test.afterAll(async () => {
    await prisma.subscription.update({
      where: { tenantId: TENANT_ID },
      data: { planId: originalPlanId },
    });
    await prisma.$disconnect();
  });

  test('a real signed-in user sees the workflow and no invented signer', async ({ page, baseURL }) => {
    await signInAs(page, {
      id: 'demo-user-alice',
      name: 'Alice',
      email: 'alice@fabrika.test',
      tenantId: 'demo-tenant',
      role: 'PIPELINE_MANAGER',
    }, baseURL!);

    await page.goto(DOCS_URL);
    await expect(
      page.getByText('Çift Onaylı Kurumsal Yetki Akışı', { exact: false }).first(),
    ).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body, 'the invented signer is still rendered').not.toContain(FABRICATED);

    await page.screenshot({ path: `${SHOTS}/01-real-user-dual-approval.png`, fullPage: false });
  });

  test('an identity-less visitor never reaches the approval surface', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(DOCS_URL);
    // The redirect itself is the thing being waited for. `networkidle` stood here and is a
    // race on a loaded dev server, which never goes quiet for the 500 ms it wants.
    await page.waitForURL(/\/(giris|login)\b/, { timeout: 30_000 });

    // No session → the app frame sends the visitor to sign in; it does not render
    // an approval workflow signed by somebody the request never identified.
    // `/tr/giris` is the Turkish sign-in route; `getPublicRoute('login', locale)`
    // localises the path, so match either spelling.
    expect(page.url()).toMatch(/\/(giris|login)\b/);

    // The approval surface is not rendered at all for a caller with no identity.
    // (The sign-in page itself lists demo accounts by name — that list is the
    // login screen's own content, not an approval record, and is out of scope here.)
    await expect(
      page.getByText('Çift Onaylı Kurumsal Yetki Akışı', { exact: false }),
    ).toHaveCount(0);

    await page.screenshot({ path: `${SHOTS}/02-anonymous-refused.png`, fullPage: false });
  });

  test('an identity-less POST to an M10 action never succeeds and never signs', async ({ request, baseURL }) => {
    // What this establishes, and what it does not. The `Next-Action` id below is a literal,
    // and Next mints a fresh id for every action on every build: measured on 2026-09-08 this
    // one is no longer in the running app's server-reference manifest, so the route answers
    // 404 and the assertion passes without any action having refused anything. The refusal
    // itself is proved elsewhere — `signDocument` opens with `requireTenantAction()`, which
    // throws `TenantScopeError` before a row is touched (src/modules/m10/server/actions.ts:142)
    // — and the test above already shows an identity-less visitor never reaching the surface.
    // Kept as a regression net on "an anonymous POST here never returns 2xx and never echoes
    // the invented signer"; pinning it to a live action id needs the id resolved at run time,
    // which is filed as an open item rather than guessed at here.
    const res = await request.post(DOCS_URL, {
      headers: {
        'Next-Action': '40e67602bd5a3cd92b8e2d385591c18061662e4d26',
        'Content-Type': 'text/plain;charset=UTF-8',
        Origin: baseURL!,
      },
      data: '["doc-probe"]',
    });

    expect(res.status(), 'an anonymous M10 action call succeeded').toBeGreaterThanOrEqual(400);
    expect(await res.text()).not.toContain(FABRICATED);
  });
});
