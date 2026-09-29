import { test, expect, type BrowserContext, type Page, type Request } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import type { Role } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { PLAN_E2E, seed, rollback } from '../../scripts/seed-plan-e2e';
import { shotsDir } from './fixtures/shots';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MTS9C907G4YNW — this spec used to hand out a false pass.
 *
 * Its third test posted a *literal* `Next-Action` id at the documents route and
 * asserted `status >= 400`. Next mints a fresh action id on every build, so that id
 * had long stopped existing. Measured on 2026-09-08 against a dev server built from
 * HEAD:
 *
 *   anonymous + the pinned id  → 404 "Server action not found."
 *   anonymous + a garbage id   → 404 "Server action not found."
 *   SIGNED-IN + the pinned id  → 404 "Server action not found."
 *   SIGNED-IN + a garbage id   → 404 "Server action not found."
 *
 * All four cells are the same 404, so the assertion could not tell a refusal from a
 * route that is not there. The whole authorisation layer could have been deleted and
 * the test would still have been green. A 404 is never evidence of protection.
 *
 * TASK-MTS808DKQTOQ9 gave M10 a real flow — "Onaya Gönder" → finance sign-off → legal
 * sign-off → the signature written to `FollowupDoc.signedAt` — so the questions this
 * file exists to answer can now be measured on the real path:
 *
 *  1. Does the audit trail name the session that actually acted? Proved by driving the
 *     flow with two different sessions whose display names are minted fresh for every
 *     run (`E2E Approver A <run>` / `… B <run>`). No name a developer could have typed
 *     into the product can satisfy those assertions, and neither can a session-
 *     independent actor: the two lines have to differ, in the order the two people acted.
 *  2. Is an unauthorised write really refused? Proved against a **live** action id
 *     harvested from a real click in this very run, with three replays of it — anonymous,
 *     cross-tenant, and (as the positive control that the id is live) authenticated.
 *     The verdict is read from the database row, not from a status code.
 *
 * Precondition: the tenant must be entitled to M10, and that is two facts, not one —
 * `ModuleState` ON *and* a plan that sells the module (CLAUDE.md rule 4). Both come from
 * `scripts/seed-plan-e2e.ts`, whose `ultra` tenant is owned by the tests, so no spec has
 * to borrow `demo-tenant`'s subscription.
 *
 * The session cookie is minted with the app's own secret — the same JWT the sign-in flow
 * produces — so the test drives the real page rather than a stub.
 */

const SHOTS = shotsDir('TASK-MTS9C907G4YNW-screenshots');
const ULTRA = PLAN_E2E.ultra;
const FLIP = PLAN_E2E.flip;
const DOCS_URL = `/tr/${ULTRA.workspaceSlug}/opportunities/${ULTRA.opportunityId}/documents`;
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

/** The name the workflow used to sign records with, spelled out only here. */
const FABRICATED = ['Dr.', 'Mehmet', 'Yılmaz'].join(' ');

/**
 * Two identities, both minted per run.
 *
 * The point of the suffix: a display name that did not exist when the code was written
 * cannot be produced by anything except the session that carries it. An audit line that
 * shows it was written from the session; a hard-coded, defaulted or DB-substituted actor
 * fails the assertion.
 */
const RUN = Date.now().toString(36);
const ACTOR_A = `E2E Approver A ${RUN}`;
const ACTOR_B = `E2E Approver B ${RUN}`;

/** The second approver — a real member of the same tenant, seeded by this spec. */
const USER_B: { id: string; email: string; role: Role } = {
  id: 'plan-e2e-ultra-user-b',
  email: 'plan-e2e-ultra-b@fabrika.test',
  role: 'PIPELINE_MANAGER',
};

/** The Turkish label of the row-level sign button; there is no test id on it. */
const SIGN_BUTTON = 'Elektronik İmzala';

async function mintSession(userId: string, name: string, email: string): Promise<string> {
  return encode({
    token: { sub: userId, id: userId, name, email, tenantId: ULTRA.tenantId, role: ULTRA.role },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
}

/** Replaces whatever session the context holds — used to hand the flow to a second person. */
async function setSession(
  context: BrowserContext,
  cookie: string,
  baseURL: string,
): Promise<void> {
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

async function newDoc(
  tenantId: string,
  opportunityId: string,
  kind: string,
): Promise<{ id: string }> {
  return prisma.followupDoc.create({
    data: {
      tenantId,
      opportunityId,
      kind,
      version: 1,
      contentUrl: `https://storage.fabrika.app/e2e/${kind.toLowerCase()}.pdf`,
    },
    select: { id: true },
  });
}

async function signedAtOf(docId: string): Promise<Date | null> {
  const row = await prisma.followupDoc.findUnique({
    where: { id: docId },
    select: { signedAt: true },
  });
  return row?.signedAt ?? null;
}

test.describe('M10 dual approval identity', () => {
  test.beforeAll(async () => {
    await seed();
    // The second approver. `seed-plan-e2e.ts` is shared with `module-plan-gate`, so the
    // extra member is created here and removed here.
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
    // PLAN_E2E_KEEP=1 leaves the fixture behind for inspection;
    // `pnpm tsx scripts/seed-plan-e2e.ts --rollback` clears it.
    if (process.env.PLAN_E2E_KEEP !== '1') {
      await prisma.membership.deleteMany({ where: { userId: USER_B.id } });
      await prisma.user.deleteMany({ where: { id: USER_B.id } });
      await rollback();
    }
    await prisma.$disconnect();
  });

  test('the approval record names the session that acted, and each step names its own actor', async ({
    page,
    context,
    baseURL,
  }) => {
    const doc = await newDoc(ULTRA.tenantId, ULTRA.opportunityId, 'NDA');

    await primeConsent(page);
    await setSession(context, await mintSession(ULTRA.userId, ACTOR_A, ULTRA.email), baseURL!);
    await page.goto(DOCS_URL);

    const banner = page.getByTestId('dual-approval-banner');
    await expect(banner).toBeVisible();

    // Empty state first: nothing in the flow means no step is lit and nobody is named.
    await expect(banner).toHaveAttribute('data-approval-stage', 'NONE');
    await expect(page.getByTestId('approval-idle')).toBeVisible();
    for (const step of [1, 2, 3, 4]) {
      await expect(page.getByTestId(`approval-step-${step}`)).toHaveAttribute('data-state', 'idle');
    }
    await page.screenshot({ path: `${SHOTS}/01-idle-nobody-named.png`, fullPage: false });

    // ── A puts a real document into the flow ──────────────────────────────────────
    await page.getByTestId(`submit-approval-${doc.id}`).click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_FINANCE_APPROVAL');

    const trail = page.getByTestId('approval-audit').locator('li');
    await expect(trail).toHaveCount(1);
    // Written from A's session — a value that did not exist when the code was written.
    await expect(trail.nth(0)).toContainText(ACTOR_A);
    await expect(page.getByTestId('approval-subject')).toContainText(ACTOR_A);
    await page.screenshot({ path: `${SHOTS}/02-submitted-by-actor-a.png`, fullPage: false });

    // ── the flow is handed to a second person, mid-workflow ───────────────────────
    await setSession(context, await mintSession(USER_B.id, ACTOR_B, USER_B.email), baseURL!);

    await page.getByTestId('approve-finance').click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'PENDING_LEGAL_APPROVAL');
    await expect(trail).toHaveCount(2);
    // The finance line is B's, and it is not A's: the actor follows the session that
    // made the call, not the session that opened the flow.
    await expect(trail.nth(1)).toContainText(ACTOR_B);
    await expect(trail.nth(1)).not.toContainText(ACTOR_A);
    // A's line is untouched.
    await expect(trail.nth(0)).toContainText(ACTOR_A);
    await page.screenshot({ path: `${SHOTS}/03-finance-signed-by-actor-b.png`, fullPage: false });

    // ── and legal is signed by somebody who is not the finance approver ──────────
    // TASK-MTSAIWF4ENUSL made that a rule rather than a convention: one person
    // signs at most one department (a unique index on DualApprovalStep), so B
    // cannot close the flow it opened. The flow goes back to A, who submitted it
    // but has signed no department yet.
    await setSession(context, await mintSession(ULTRA.userId, ACTOR_A, ULTRA.email), baseURL!);

    await page.getByTestId('approve-legal').click();
    await expect(banner).toHaveAttribute('data-approval-stage', 'APPROVED_AND_SIGNED');
    await expect(page.getByTestId('approval-complete')).toBeVisible();
    await expect(trail).toHaveCount(3);
    await expect(trail.nth(2)).toContainText(ACTOR_A);

    // The audit trail, read as a whole: each line names the session that made it.
    const lines = await trail.allInnerTexts();
    expect(
      lines.map((l) => (l.includes(ACTOR_A) ? 'A' : l.includes(ACTOR_B) ? 'B' : 'UNKNOWN')),
      'an audit line names somebody other than the two sessions that acted',
    ).toEqual(['A', 'B', 'A']);

    // Step 4 is an outcome, not a claim: the row really is signed in the database.
    expect(await signedAtOf(doc.id), 'the completed workflow left no signature').not.toBeNull();

    // And nowhere on the finished screen is the name the workflow used to invent.
    const body = await page.locator('body').innerText();
    expect(body, 'the invented signer is still rendered').not.toContain(FABRICATED);

    await page.screenshot({ path: `${SHOTS}/04-completed-trail.png`, fullPage: false });
  });

  test('an identity-less visitor never reaches the approval surface', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(DOCS_URL);
    // The redirect itself is the thing being waited for. A network-idle wait stood here and is a
    // race on a loaded dev server, which never goes quiet for the 500 ms it wants.
    await page.waitForURL(/\/(giris|login)\b/, { timeout: 30_000 });

    // No session → the app frame sends the visitor to sign in; it does not render
    // an approval workflow signed by somebody the request never identified.
    expect(page.url()).toMatch(/\/(giris|login)\b/);

    // The approval surface is not rendered at all for a caller with no identity.
    // (The sign-in page itself lists demo accounts by name — that list is the
    // login screen's own content, not an approval record, and is out of scope here.)
    await expect(
      page.getByText('Çift Onaylı Kurumsal Yetki Akışı', { exact: false }),
    ).toHaveCount(0);

    await page.screenshot({ path: `${SHOTS}/05-anonymous-refused.png`, fullPage: false });
  });

  test('an unauthorised write is refused by the action itself — measured on a LIVE action id', async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const harvestDoc = await newDoc(ULTRA.tenantId, ULTRA.opportunityId, 'LOI');
    const targetDoc = await newDoc(ULTRA.tenantId, ULTRA.opportunityId, 'COMMITMENT');
    const otherTenantDoc = await newDoc(FLIP.tenantId, FLIP.opportunityId, 'NDA');

    const sessionA = await mintSession(ULTRA.userId, ACTOR_A, ULTRA.email);
    await primeConsent(page);
    await setSession(context, sessionA, baseURL!);

    // ── harvest the id of the action that writes, from a real click ───────────────
    // The predecessor of this test pinned an id in the source, and a pinned id is dead
    // on the next build. The id is taken from the request the browser actually sends.
    const posts: { id: string; body: string | null }[] = [];
    page.on('request', (req: Request) => {
      const id = req.headers()['next-action'];
      if (req.method() === 'POST' && id) posts.push({ id, body: req.postData() });
    });

    await page.goto(DOCS_URL);
    const row = page.locator('tr', { has: page.getByTestId(`submit-approval-${harvestDoc.id}`) });
    await row.getByRole('button', { name: SIGN_BUTTON }).click();

    // The click is only a source of an action id if it really signed something.
    await expect
      .poll(async () => await signedAtOf(harvestDoc.id), { timeout: 15_000 })
      .not.toBeNull();

    const call = posts.find((p) => p.body?.includes(harvestDoc.id));
    expect(call, 'no server-action POST carried the document id').toBeTruthy();
    const liveActionId = call!.id;

    /**
     * Replays the harvested action id.
     *
     * The `request` fixture is used, not `page.request`: `page.request` shares the browser
     * context's cookie jar, so the "anonymous" call would have carried the session cookie
     * that was just installed and would have proved the opposite of what it claims. The
     * fixture's jar is empty, so identity is exactly what the `Cookie` header says.
     */
    const replay = async (cookie?: string, docId = targetDoc.id) =>
      request.post(DOCS_URL, {
        headers: {
          'Next-Action': liveActionId,
          'Content-Type': 'text/plain;charset=UTF-8',
          Origin: baseURL!,
          ...(cookie === undefined ? {} : { Cookie: `${COOKIE_NAME}=${cookie}` }),
        },
        data: JSON.stringify([docId]),
        maxRedirects: 0,
      });

    // ── 1. anonymous: refused, and nothing is written ─────────────────────────────
    const anonRes = await replay();
    expect(
      anonRes.status(),
      'the action id is not live — a 404 says nothing about protection, which is the bug this test replaced',
    ).not.toBe(404);
    expect(
      await signedAtOf(targetDoc.id),
      'an identity-less caller signed a document',
    ).toBeNull();

    // ── 2. cross-tenant: a real session, somebody else's document ─────────────────
    const crossRes = await replay(sessionA, otherTenantDoc.id);
    expect(crossRes.status(), 'the action id went stale mid-test').not.toBe(404);
    expect(
      await signedAtOf(otherTenantDoc.id),
      'a signed-in user signed a document belonging to another tenant',
    ).toBeNull();

    // ── 3. positive control: the same id, with a session, does write ──────────────
    // Without this, "no signature" could just mean the request never reached the action.
    const authRes = await replay(sessionA);
    expect(authRes.status(), 'the harvested action id did not answer an authorised call').toBe(200);
    await expect
      .poll(async () => await signedAtOf(targetDoc.id), { timeout: 15_000 })
      .not.toBeNull();
  });
});
