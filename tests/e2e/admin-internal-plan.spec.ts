import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { cleanupIdentity, seedIdentity, signInAs } from './fixtures/session';

/**
 * TASK-MVCH26OXNVLKR — an internal plan, assigned and taken back with clicks.
 *
 * The tenant is its own (no subscription = Discover, M2 switched ON in
 * `ModuleState`), so the only thing that can open or close M2 here is the plan:
 * Discover does not grant M2, Pro does. (It was M1 until FO-41 put a limited M1
 * into Discover.) The operator assigns Pro from Admin > Tenants with a note, the
 * tenant's concept-notes page opens; the operator
 * picks Discover, the page locks again with the plan refusal. Both changes
 * must leave an audit row with old → new and the note. While the internal plan
 * is on, the owner cannot start a payment from the pricing page: checkout
 * answers INTERNAL_PLAN_CHECKOUT_CLOSED and the cart says why.
 */

const SHOTS = shotsDir('TASK-MVCH26OXNVLKR-screenshots');
const TENANT = 'ip-e2e-tenant';
const WORKSPACE = { id: 'ip-e2e-workspace', slug: 'ip-e2e', name: 'internal plan e2e' };
const OWNER = { userId: 'ip-e2e-owner', email: 'ip-e2e-owner@fabrika.test', role: 'TENANT_OWNER' as const };
const ADMIN = {
  userId: 'ip-e2e-admin',
  email: 'ip-e2e-admin@fabrika.test',
  name: 'Internal Plan Admin',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
  workspaceIds: [] as string[],
  isPlatformAdmin: true,
};
const CONCEPT_NOTES_URL = `/tr/${WORKSPACE.slug}/concept-notes`;
const DETAIL_URL = `/tr/admin/tenants/${TENANT}`;

// Tenant tables sit behind RLS, so the fixture reads and writes them in the system scope.
async function teardown() {
  await cleanupIdentity([OWNER.userId, ADMIN.userId]);
  await withSystemScope('platform-admin', 'e2e.internal-plan.cleanup', async (tx) => {
    await tx.auditEvent.deleteMany({ where: { tenantId: TENANT } });
    await tx.planAssignment.deleteMany({ where: { tenantId: TENANT } });
    await tx.subscription.deleteMany({ where: { tenantId: TENANT } });
    await tx.moduleState.deleteMany({ where: { tenantId: TENANT } });
    await tx.workspace.deleteMany({ where: { tenantId: TENANT } });
    await tx.tenant.deleteMany({ where: { id: TENANT } });
  });
}

// Filtered: Next's route announcer is a role=alert node too.
const planLock = (page: import('@playwright/test').Page) =>
  page.getByRole('alert').filter({ hasText: 'aboneliğinizin kapsamı dışında' });

async function signInOwner(page: import('@playwright/test').Page) {
  await signInAs(page, { id: OWNER.userId, email: OWNER.email, tenantId: TENANT, role: OWNER.role });
}

async function signInAdmin(page: import('@playwright/test').Page) {
  await signInAs(page, {
    id: ADMIN.userId,
    email: ADMIN.email,
    name: ADMIN.name,
    tenantId: ADMIN.tenantId,
    role: ADMIN.role,
    isPlatformAdmin: true,
  });
}

async function assign(page: import('@playwright/test').Page, planId: string, note: string) {
  await signInAdmin(page);
  await page.goto(DETAIL_URL);
  await page.getByTestId('internal-plan-select').selectOption(planId);
  // The note is mandatory: the button stays off until there is one.
  await expect(page.getByTestId('internal-plan-submit')).toBeDisabled();
  await page.getByTestId('internal-plan-note').fill(note);
  await page.getByTestId('internal-plan-submit').click();
  await expect(page.getByTestId('internal-plan-notice')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('internal plan assignment from Admin > Tenants', () => {
  test.beforeAll(async () => {
    await teardown();
    await withSystemScope('platform-admin', 'e2e.internal-plan.setup', async (tx) => {
      await tx.tenant.create({
        data: { id: TENANT, name: 'Internal Plan E2E', slug: TENANT, country: 'TR', orgType: 'SME' },
      });
      await tx.moduleState.create({
        data: { tenantId: TENANT, moduleId: 'M2', status: 'ON', changedBy: 'internal-plan e2e fixture' },
      });
    });
    await seedIdentity({ ...OWNER, tenantId: TENANT }, WORKSPACE);
    await seedIdentity(ADMIN);
  });

  test.afterAll(async () => {
    await teardown();
    await prisma.$disconnect();
  });

  test('on Discover, M2 is locked behind the plan', async ({ page }) => {
    await signInOwner(page);
    await page.goto(CONCEPT_NOTES_URL);
    await expect(planLock(page)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-m2-locked-discover.png`, fullPage: true });
  });

  test('the operator assigns Pro with a note; the list shows the internal badge', async ({ page }) => {
    await assign(page, 'pro', 'M1 kilit testi (e2e)');
    await expect(page.getByTestId('internal-plan-notice')).toHaveText('İç plan atandı.');
    await expect(page.getByTestId('tenant-current-plan')).toContainText('Pro');
    await expect(page.getByTestId('internal-plan-history')).toContainText('M1 kilit testi (e2e)');
    // Who did it reads as a person, not a user id.
    await expect(page.getByTestId('internal-plan-history')).toContainText(`${ADMIN.name} (${ADMIN.email})`);
    await page.screenshot({ path: `${SHOTS}/02-admin-assigned-pro.png`, fullPage: true });

    // Phone width: the form and history must fit without a horizontal scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${SHOTS}/02b-admin-assigned-pro-390.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/tr/admin/tenants');
    await expect(page.getByTestId(`tenant-internal-${TENANT}`)).toContainText('Pro');
    await page.screenshot({ path: `${SHOTS}/03-tenant-list-internal-badge.png`, fullPage: true });
  });

  test('on the internal Pro plan, M2 opens', async ({ page }) => {
    await signInOwner(page);
    await page.goto(CONCEPT_NOTES_URL);
    // The page itself rendered, not just an absent lock (an error page has no lock either).
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Concept Notes');
    await expect(planLock(page)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/04-m2-open-pro.png`, fullPage: true });
  });

  // The refusal is said in the visitor's language (messages/*.json
  // `billingPanels.cart.internalPlanCheckoutClosed`), not as the server's code.
  const CHECKOUT_CLOSED = [
    {
      locale: 'tr',
      monthly: 'Aylık',
      addToCart: /sepete ekle/i,
      proceed: /Stripe ile ödemeye geç/,
      refusal:
        'Planınız yönetici tarafından atandı; ödeme ve plan değişikliği buradan yapılamaz. Değişiklik için bizimle iletişime geçin.',
      shot: '04b-checkout-closed-internal-plan.png',
    },
    {
      locale: 'en',
      monthly: 'Monthly',
      addToCart: /add ultra to cart/i,
      proceed: /Proceed to Stripe checkout/,
      refusal:
        'Your plan was assigned by an administrator, so payments and plan changes are not available here. Please contact us to change it.',
      shot: '04c-checkout-closed-internal-plan-en.png',
    },
  ] as const;

  for (const c of CHECKOUT_CLOSED) {
    test(`on the internal Pro plan, the owner cannot start a checkout from pricing (${c.locale})`, async ({ page }) => {
      await signInOwner(page);
      await page.addInitScript(() => {
        window.localStorage.setItem(
          'fabrika_cookie_consent',
          JSON.stringify({ necessary: true, analytics: true, marketing: true })
        );
      });
      await page.goto(`/${c.locale}/pricing`);
      // The toggle is client state: a click before hydration is lost (docs/E2E_TESTING.md §3.4).
      const monthly = page.getByRole('button', { name: c.monthly, exact: true });
      await expectHydrated(monthly);
      await monthly.click();
      await page.getByTestId('plan-card-ultra').getByRole('button', { name: c.addToCart }).click();
      await expect(page.getByTestId('cart-total')).toBeVisible();

      const answer = page.waitForResponse(
        (r) => r.url().endsWith('/api/billing/checkout') && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: c.proceed }).click();
      const response = await answer;
      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'INTERNAL_PLAN_CHECKOUT_CLOSED' });
      // No demo quote either: the refusal comes before anything is priced.
      await expect(page.getByTestId('checkout-total')).toHaveCount(0);
      await expect(page.getByTestId('cart-checkout-error')).toHaveText(c.refusal);
      await page.screenshot({ path: `${SHOTS}/${c.shot}` });
    });
  }

  test('back to Discover: M2 locks again and both changes are audited', async ({ page }) => {
    await assign(page, 'free', 'test bitti (e2e)');
    await expect(page.getByTestId('internal-plan-notice')).toHaveText("İç plan geri alındı; kiracı Discover'a döndü.");
    await page.screenshot({ path: `${SHOTS}/05-admin-revoked.png`, fullPage: true });

    await signInOwner(page);
    await page.goto(CONCEPT_NOTES_URL);
    await expect(planLock(page)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/06-m2-locked-again.png`, fullPage: true });

    const audit = await withSystemScope('platform-admin', 'e2e.internal-plan.audit', (tx) =>
      tx.auditEvent.findMany({
        where: { tenantId: TENANT, type: { startsWith: 'plan.internal.' } },
        orderBy: { createdAt: 'asc' },
        select: { type: true, actorId: true, data: true },
      })
    );
    expect(audit).toMatchObject([
      { type: 'plan.internal.assigned', actorId: ADMIN.userId, data: { before: 'free', after: 'pro', note: 'M1 kilit testi (e2e)' } },
      { type: 'plan.internal.revoked', actorId: ADMIN.userId, data: { before: 'pro', after: 'free', note: 'test bitti (e2e)' } },
    ]);
  });
});
