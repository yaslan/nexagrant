import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';

/**
 * TASK-MTR60M5ESB5PZ — the M10 follow-up documents surface must never name
 * somebody who did not act.
 *
 * `submitDualApprovalAction(docId, actorName = <one real person's name>)` wrote that
 * default straight into `auditTrail[].actorName`, `financeApprover` and
 * `legalApprover`. The default is gone; the actor now comes from the session, and a
 * request without a session is refused before any record exists.
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

test.describe('M10 dual approval identity', () => {
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
    await page.waitForLoadState('networkidle');

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

  test('an identity-less POST to an M10 action is refused, never signed', async ({ request, baseURL }) => {
    // `signDocument` is the sibling action that IS registered in the action manifest;
    // it stands in for the whole module's boundary. An anonymous call must fail.
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
