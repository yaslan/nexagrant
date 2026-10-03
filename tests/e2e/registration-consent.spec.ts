import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { registrationAcknowledgementToken } from '../../src/lib/legal/consent-documents';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { presentIds, requireId } from '../helpers/teardown-guard';

/**
 * TASK-MTSWLANXSU0IG (A3) — the disclosure step, in a real browser.
 *
 * The unit and live suites pin the rules and the atomicity. What they cannot
 * show is the thing the card is actually about: that a person registering is
 * asked, that refusing to ask does not get them an account anyway, and that
 * ticking the box leaves a row in the database naming the version they read.
 *
 * The last test deliberately leaves the browser behind and posts straight at
 * NextAuth's credentials endpoint. Everything the UI enforces is a convenience;
 * the gate that matters is in `authorize`, and the only way to show it is there
 * is to take the UI out of the picture.
 */
const SHOTS = shotsDir('TASK-MTSWLANXSU0IG-screenshots');
const STAMP = Date.now();

const FORM_EMAIL = `e2e-consent-form-${STAMP}@fabrika.test`;
const REFUSED_EMAIL = `e2e-consent-refused-${STAMP}@fabrika.test`;

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true })
    );
  });
}

/**
 * Visible forms only (not hidden during Suspense streaming).
 *
 * While the page is still streaming, Next parks the Suspense content in a
 * `hidden` container and moves it once the boundary resolves, so for a moment
 * the document really does hold two copies of these forms — and a bare
 * `getByTestId` then fails strict mode instead of waiting. Whether a run sees
 * it is a matter of timing: this spec passed alone and failed in the middle of
 * a full `pnpm gate`. Scoping to the visible copy removes the race rather than
 * making it rarer.
 */
function visibleForms(page: Page) {
  return page.locator('form').filter({ visible: true });
}

/** The acknowledgement form (province, readiness, the box). */
function disclosure(page: Page) {
  return visibleForms(page).filter({ has: page.getByTestId('disclosure-ack') });
}

/** The demo e-mail form: the one that submits. */
function form(page: Page) {
  return visibleForms(page).filter({ has: page.locator('input[type="email"]') });
}

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  const emails = [FORM_EMAIL, REFUSED_EMAIL];
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.consent.deleteMany({ where: { userId: { in: presentIds(ids) } } });
    const memberships = await prisma.membership.findMany({
      where: { userId: { in: ids } },
      select: { tenantId: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: presentIds(ids) } } });
    const tenantIds = memberships.map((m) => m.tenantId);
    if (tenantIds.length) {
      await prisma.tenant.deleteMany({ where: { id: { in: presentIds(tenantIds) } } });
    }
  }
  await prisma.$disconnect();
});

test('the registration form asks, unticked, and will not submit until it is ticked', async ({ page }) => {
  await acceptCookies(page);
  await page.goto('/tr/register');

  // Ticking it enables the submit button through React state, so the box has to be
  // hydrated before it is ticked (fixtures/hydration.ts).
  const box = disclosure(page).getByTestId('disclosure-ack');
  await expectHydrated(box);

  // Pre-ticked would make the record worthless: it would prove the page's
  // default, not the person's act. KVKK açık rıza şartı, and the same logic
  // applies to an art.13 acknowledgement.
  await expect(box).not.toBeChecked();

  // The version is on screen, so a screenshot of this box is evidence about a
  // specific text rather than about whatever the notice says today.
  const version = disclosure(page).getByTestId('disclosure-version');
  await expect(version).toContainText('privacy-notice@');
  await expect(version).toContainText('terms-of-service@');

  // Both legal texts are reachable from here, in the locale being read.
  await expect(disclosure(page).locator('a[href="/tr/privacy"]')).toBeVisible();
  await expect(disclosure(page).locator('a[href="/tr/terms"]')).toBeVisible();

  const submit = form(page).locator('button[type="submit"]');
  await form(page).locator('input[type="email"]').fill(REFUSED_EMAIL);
  await expect(submit).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/01-unticked-submit-disabled.png`, fullPage: true });

  // Past the disabled attribute: submit the form itself, the way a keyboard or
  // a tampered DOM would.
  await form(page).evaluate((el: HTMLFormElement) => el.requestSubmit());
  await expect(page.getByText(/onaylamanız gerekir/i)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-unticked-refused.png`, fullPage: true });

  // And nothing was created.
  const refused = await prisma.user.findUnique({ where: { email: REFUSED_EMAIL } });
  expect(refused, 'an unacknowledged registration created an account').toBeNull();

  await box.check();
  await expect(box).toBeChecked();
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/03-ticked-submit-enabled.png`, fullPage: true });
});

test('ticking it and registering writes the disclosure record', async ({ page }) => {
  await acceptCookies(page);
  await page.goto('/tr/register');
  await expectHydrated(disclosure(page).getByTestId('disclosure-ack'));

  await form(page).locator('input[type="email"]').fill(FORM_EMAIL);
  await disclosure(page).getByTestId('disclosure-ack').check();
  await form(page).locator('button[type="submit"]').click();

  // The app lands the new account on its workspace.
  await page.waitForURL(/\/tr\/.*(dashboard|panel|no-workspace)/, { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/04-registered.png`, fullPage: true });

  const user = await prisma.user.findUnique({ where: { email: FORM_EMAIL } });
  expect(user, 'the registration did not create the account').not.toBeNull();

  const rows = await prisma.consent.findMany({
    where: { userId: user!.id },
    orderBy: { documentId: 'asc' },
  });

  expect(rows.map((r) => r.documentId)).toEqual(['privacy-notice', 'terms-of-service']);
  expect(rows.map((r) => r.kind)).toEqual(['DISCLOSURE_ACK', 'TERMS_ACCEPTANCE']);
  for (const row of rows) {
    expect(row.purpose).toBe('ACCOUNT_REGISTRATION');
    expect(row.tenantId, 'a disclosure record with no tenant is outside RLS').toMatch(/\S/);
    expect(row.documentVersion).toMatch(/\S/);
    expect(row.withdrawnAt).toBeNull();
  }

  // The versions stored are the versions the page displayed.
  expect(rows.map((r) => `${r.documentId}@${r.documentVersion}`).join(',')).toBe(
    registrationAcknowledgementToken()
  );
});

test('the refusal is in the server, not in the form', async ({ page }) => {
  // No form, no checkbox, no client-side guard — a direct POST at the endpoint
  // the form posts to. If the gate lived only in the component, this would
  // create an account.
  const csrfResponse = await page.request.get('/api/auth/csrf');
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  expect(csrfToken).toBeTruthy();

  const email = `e2e-consent-raw-${STAMP}@fabrika.test`;
  await page.request.post('/api/auth/callback/credentials', {
    form: {
      csrfToken,
      email,
      password: 'demo1234',
      // acknowledgement deliberately absent
      callbackUrl: '/tr/default/dashboard',
      json: 'true',
    },
  });

  const created = await prisma.user.findUnique({ where: { email } });
  expect(created, 'the server created an account for an unacknowledged registration').toBeNull();

  // Positive control: the identical request, with the acknowledgement, works —
  // so the refusal above is the acknowledgement check and not a broken request.
  const okEmail = `e2e-consent-raw-ok-${STAMP}@fabrika.test`;
  await page.request.post('/api/auth/callback/credentials', {
    form: {
      csrfToken,
      email: okEmail,
      password: 'demo1234',
      acknowledgement: registrationAcknowledgementToken(),
      callbackUrl: '/tr/default/dashboard',
      json: 'true',
    },
  });

  const accepted = await prisma.user.findUnique({ where: { email: okEmail } });
  expect(accepted, 'the acknowledged registration was refused too — the control failed').not.toBeNull();
  const rows = await prisma.consent.findMany({ where: { userId: accepted!.id } });
  expect(rows).toHaveLength(2);

  // Clean up what this test made.
  const memberships = await prisma.membership.findMany({
    where: { userId: accepted!.id },
    select: { tenantId: true },
  });
  await prisma.consent.deleteMany({ where: { userId: requireId(accepted!.id, 'accepted.id') } });
  await prisma.user.delete({ where: { id: accepted!.id } });
  await prisma.tenant.deleteMany({ where: { id: { in: presentIds(memberships.map((m) => m.tenantId)) } } });
});
