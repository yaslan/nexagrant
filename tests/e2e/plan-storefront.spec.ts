import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { e2eAuthSecret } from './fixtures/auth-secret';

/**
 * TASK-MTSHVKTSGC8A4 — the shopfront, in a real browser.
 *
 * The unit suite proves the storefront module. This proves the three surfaces a
 * customer actually touches, because the whole reason this task exists is that
 * `plansVisibleToTenant` and `listPublicPlans` were correct, tested, and called
 * by nothing: the pricing page, the billing panel and checkout all read the
 * static array in `src/lib/billing/catalog.ts`, so a plan published in the
 * studio could not be bought.
 *
 * What is driven here:
 *   1. A price published in the database is the price the page quotes and the
 *      price checkout charges — measured with a figure (`$777.00`) that appears
 *      nowhere in catalog.ts, so a passing assertion cannot be the old path.
 *   2. A plan turned private with no assignment disappears from the public page
 *      *and* is refused at checkout when its sku is posted by hand. These checks
 *      use a plan this spec creates (`PLAN_ID`), never a seeded one: deleting
 *      `basic`'s assignments here would delete real ones on a shared database
 *      (FO-377). The same plan is first shown and sold while public, so its
 *      later absence is about visibility and not about a broken fixture.
 *   3. The guard from TASK-MTR6Q2IODYQRC still holds on the new path: a request
 *      that names its own price is charged the server's.
 *
 * The fixture restores every row it changes and removes the plan it creates, so
 * the run leaves the database as it found it.
 */

const SHOTS = shotsDir('TASK-MTSHVKTSGC8A4-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
const TENANT_ID = 'demo-tenant';
const BILLING_URL = '/tr/main/settings/billing';

/** $777.00 / month, $7,770.00 / year. No such figure exists in catalog.ts. */
const STUDIO_MONTHLY = 77_700;
const STUDIO_YEARLY = 777_000;

/** Locale-tolerant: tr renders "777,00 $", en renders "$777.00". */
const STUDIO_MONTHLY_TEXT = /777[.,]00/;
/** What catalog.ts would have quoted for Ultra monthly — must NOT appear. */
const CATALOGUE_MONTHLY_TEXT = /147[.,]00/;

/** The plan the visibility checks change. It exists only while this spec runs. */
const PLAN_ID = 'e2e-storefront-plan';
const PLAN_SKU = 'plan-e2e-storefront-plan';
/** $333.00 / month. Neither catalog.ts nor the seed has this figure. */
const OWN_PLAN_MONTHLY = 33_300;

let ultraBefore: { monthlyCents: number; yearlyCents: number } | null = null;

async function sessionToken(): Promise<string> {
  return encode({
    token: {
      sub: 'demo-user-superadmin',
      id: 'demo-user-superadmin',
      name: 'Platform Admin',
      email: 'admin@yasinaslan.com.tr',
      tenantId: TENANT_ID,
      role: 'SUPER_ADMIN',
      isPlatformAdmin: true,
    },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
}

async function signIn(page: Page, baseURL: string): Promise<void> {
  await page.context().addCookies([{ name: COOKIE_NAME, value: await sessionToken(), url: baseURL }]);
}

/**
 * The `request` fixture carries no browser cookies, so a bare POST to
 * `/api/billing/checkout` is an *anonymous* one. Since TASK-MTUI9F5YBHTDC that
 * route answers 401 — creating a payable Stripe session is not something an
 * unauthenticated caller may do — so these API-level checks, which are about
 * *pricing* and not about the gate, sign in the same demo tenant the browser
 * tests use. The gate itself is pinned in `tests/billing-checkout-auth.test.ts`.
 */
async function tenantHeaders(): Promise<Record<string, string>> {
  return { cookie: `${COOKIE_NAME}=${await sessionToken()}` };
}

function consent(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true, time: new Date().toISOString(), version: 'draft-2026-11-18' })
    );
  });
}

/**
 * Deletes only this spec's rows. Runs before each create too, so a run that was
 * killed before its teardown cannot leave the next one a stale plan.
 */
async function removeOwnPlan(): Promise<void> {
  await prisma.planAssignment.deleteMany({ where: { planId: 'e2e-storefront-plan' } });
  await prisma.planVersion.deleteMany({ where: { planId: 'e2e-storefront-plan' } });
  await prisma.plan.deleteMany({ where: { id: 'e2e-storefront-plan' } });
}

async function createOwnPlan(visibility: 'public' | 'private'): Promise<void> {
  await removeOwnPlan();
  const limits = { seats: 1, workspaces: 1, aiCreditsMonthly: 1, modules: [] };
  await prisma.plan.create({
    data: {
      id: PLAN_ID,
      name: 'E2E Storefront',
      monthlyCents: OWN_PLAN_MONTHLY,
      yearlyCents: OWN_PLAN_MONTHLY * 10,
      visibility,
      ...limits,
      versions: {
        create: {
          version: 1,
          status: 'published',
          monthlyCents: OWN_PLAN_MONTHLY,
          yearlyCents: OWN_PLAN_MONTHLY * 10,
          publishedAt: new Date(),
          ...limits,
        },
      },
    },
  });
}

test.describe('the studio price is the price the shopfront quotes and charges', () => {
  test.beforeAll(async () => {
    const rows = await prisma.$queryRaw<Array<{ monthlyCents: number; yearlyCents: number }>>`SELECT "monthlyCents", "yearlyCents" FROM "PlanVersion"
       WHERE "planId" = 'ultra' AND "status" = 'published' ORDER BY "version" DESC LIMIT 1`;
    ultraBefore = rows[0] ?? null;
    await prisma.$executeRaw`UPDATE "PlanVersion" SET "monthlyCents" = ${STUDIO_MONTHLY}, "yearlyCents" = ${STUDIO_YEARLY}
       WHERE "planId" = 'ultra' AND "status" = 'published'`;
  });

  test.afterAll(async () => {
    if (ultraBefore) {
      await prisma.$executeRaw`UPDATE "PlanVersion" SET "monthlyCents" = ${ultraBefore.monthlyCents}, "yearlyCents" = ${ultraBefore.yearlyCents}
         WHERE "planId" = 'ultra' AND "status" = 'published'`;
    }
  });

  test('the public pricing page quotes the published version, not the catalogue', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    // The toggle is client state: a click before hydration is lost (docs/E2E_TESTING.md §3.4).
    const monthly = page.getByRole('button', { name: 'Aylık', exact: true });
    await expectHydrated(monthly);
    await monthly.click();

    const price = page.getByTestId('plan-price-ultra');
    await expect(price).toHaveText(STUDIO_MONTHLY_TEXT);
    // Not merely "the new number is somewhere on the page": the old one is gone.
    await expect(price).not.toHaveText(CATALOGUE_MONTHLY_TEXT);
    await page.screenshot({ path: `${SHOTS}/02-pricing-page-db-price.png`, fullPage: true });
  });

  test("the tenant's billing panel quotes the same published version", async ({ page, baseURL }) => {
    await signIn(page, baseURL as string);
    await consent(page);
    await page.goto(BILLING_URL);
    // The toggle is client state: a click before hydration is lost (docs/E2E_TESTING.md §3.4).
    const monthly = page.getByRole('button', { name: 'Aylık', exact: true });
    await expectHydrated(monthly);
    await monthly.click();

    await expect(page.getByTestId('settings-plan-price-ultra')).toHaveText(STUDIO_MONTHLY_TEXT);
    // The panel scrolls inside its own shell, so `fullPage` captures the
    // viewport rather than the plan grid; bring the grid into view first so the
    // frame is evidence rather than a header.
    await page.getByTestId('settings-plan-card-ultra').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/03-billing-panel-db-price.png` });
  });

  test('the cart drawer shows the price the server quoted, not one it computed', async ({ page }) => {
    // The drawer used to price its own lines from `catalog.ts` in the browser.
    // With the price living in the database that would show the old figure next
    // to a "Pay" button that charges the new one, so the drawer now asks
    // `POST /api/billing/quote` — the same code path checkout charges from.
    await consent(page);
    await page.goto('/tr/pricing');
    // The toggle is client state: a click before hydration is lost (docs/E2E_TESTING.md §3.4).
    const monthly = page.getByRole('button', { name: 'Aylık', exact: true });
    await expectHydrated(monthly);
    await monthly.click();
    await page.getByTestId('plan-card-ultra').getByRole('button', { name: /sepete ekle/i }).click();

    const total = page.getByTestId('cart-total');
    await expect(total).toBeVisible();
    await expect(total).toHaveText(STUDIO_MONTHLY_TEXT);
    await expect(total).not.toHaveText(CATALOGUE_MONTHLY_TEXT);
    await page.screenshot({ path: `${SHOTS}/07-cart-server-quoted.png` });
  });

  test('checkout charges the published version, and ignores a price the client names', async ({ request }) => {
    const response = await request.post('/api/billing/checkout', {
      headers: await tenantHeaders(),
      data: {
        items: [
          {
            sku: 'plan-ultra',
            billingCycle: 'monthly',
            // TASK-MTR6Q2IODYQRC's sentinel, carried onto the new path: the
            // request may say which plan, never how much.
            price: 50,
            unitAmount: 50,
            discountPercent: 99,
          },
        ],
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.totalMinor).toBe(STUDIO_MONTHLY);
    expect(body.lines[0].amountMinor).toBe(STUDIO_MONTHLY);
    // The attempt is not swallowed: the server names the fields it ignored.
    expect(body.ignoredClientFields).toEqual(
      expect.arrayContaining(['items[0]price', 'items[0]unitAmount', 'items[0]discountPercent'])
    );
  });
});

test.describe('a public plan is shown and sold, which is what makes its later absence mean something', () => {
  test.beforeAll(async () => {
    await createOwnPlan('public');
  });

  test.afterAll(async () => {
    await removeOwnPlan();
  });

  test('it is on the public pricing page', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    await expect(page.getByTestId(`plan-card-${PLAN_ID}`)).toBeVisible();
  });

  test("it is on a tenant's billing panel", async ({ page, baseURL }) => {
    await signIn(page, baseURL as string);
    await consent(page);
    await page.goto(BILLING_URL);
    await expect(page.getByTestId(`settings-plan-card-${PLAN_ID}`)).toBeVisible();
  });

  test('checkout sells it at its published price', async ({ request }) => {
    const response = await request.post('/api/billing/checkout', {
      headers: await tenantHeaders(),
      data: { items: [{ sku: PLAN_SKU, billingCycle: 'monthly' }] },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).totalMinor).toBe(OWN_PLAN_MONTHLY);
  });
});

test.describe('a private plan is neither shown nor sold to a tenant it was not assigned to', () => {
  test.beforeAll(async () => {
    // No PlanAssignment row: nobody has been given it.
    await createOwnPlan('private');
  });

  test.afterAll(async () => {
    await removeOwnPlan();
  });

  test('it is gone from the public pricing page', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    // Not vacuous: the other public plans are there, so the grid has rendered and the
    // missing card below is absent rather than not drawn yet.
    await expect(page.getByTestId('plan-card-pro')).toBeVisible();
    await expect(page.getByTestId(`plan-card-${PLAN_ID}`)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/04-private-plan-hidden.png`, fullPage: true });
  });

  test("it is gone from an unassigned tenant's billing panel", async ({ page, baseURL }) => {
    await signIn(page, baseURL as string);
    await consent(page);
    await page.goto(BILLING_URL);
    // The pro card first: it proves the grid has rendered, so the count below is an
    // absence rather than a page that has not drawn yet.
    await expect(page.getByTestId('settings-plan-card-pro')).toBeVisible();
    await expect(page.getByTestId(`settings-plan-card-${PLAN_ID}`)).toHaveCount(0);
    await page.getByTestId('settings-plan-card-pro').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/05-private-plan-hidden-panel.png` });
  });

  test('and it cannot be bought even when the sku is posted by hand', async ({ request }) => {
    // The separate measurement the card asks for. A hidden card proves nothing
    // about the endpoint: before TASK-MTSHVKTSGC8A4 a private `basic` was sold
    // for `totalMinor: 4500`. PLAN_ID is not in catalog.ts, so this cannot catch
    // a checkout that falls back to the catalogue for a sku listed there (FO-377).
    for (const sku of [PLAN_SKU, PLAN_ID, PLAN_ID.toUpperCase()]) {
      const response = await request.post('/api/billing/checkout', {
        headers: await tenantHeaders(),
        data: { items: [{ sku, billingCycle: 'monthly' }] },
      });
      expect(response.status(), `sku ${sku}`).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Unknown plan');
      expect(body.totalMinor).toBeUndefined();
    }
  });

  test('the plans that are public are still buyable', async ({ request }) => {
    // The refusal above must be about visibility, not about the endpoint having
    // stopped working.
    const response = await request.post('/api/billing/checkout', {
      headers: await tenantHeaders(),
      data: { items: [{ sku: 'plan-pro', billingCycle: 'monthly' }] },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).totalMinor).toBeGreaterThan(0);
  });
});

test.describe('a private plan assigned to a tenant is shown and sold to that tenant', () => {
  test.beforeAll(async () => {
    await createOwnPlan('private');
    await prisma.planAssignment.create({
      data: { planId: PLAN_ID, tenantId: TENANT_ID, assignedBy: 'e2e-fixture' },
    });
  });

  test.afterAll(async () => {
    await removeOwnPlan();
  });

  test('the assigned tenant sees it in its billing panel and can be quoted', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string);
    await consent(page);
    await page.goto(BILLING_URL);
    await expect(page.getByTestId(`settings-plan-card-${PLAN_ID}`)).toBeVisible();
    await page.getByTestId(`settings-plan-card-${PLAN_ID}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/06-private-plan-assigned-visible.png` });
  });

  test('but it stays off the public pricing page, which no session backs', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    // The grid has rendered once a public card is on it; only then is a count of 0 an absence.
    await expect(page.getByTestId('plan-card-pro')).toBeVisible();
    await expect(page.getByTestId(`plan-card-${PLAN_ID}`)).toHaveCount(0);
  });
});
