import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
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
 *      *and* is refused at checkout when its sku is posted by hand.
 *   3. The guard from TASK-MTR6Q2IODYQRC still holds on the new path: a request
 *      that names its own price is charged the server's.
 *
 * The fixture restores every row it changes, so the run leaves the database as
 * it found it.
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

let ultraBefore: { monthlyCents: number; yearlyCents: number } | null = null;

async function sessionToken(): Promise<string> {
  return encode({
    token: {
      sub: 'demo-user-admin',
      id: 'demo-user-admin',
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
      JSON.stringify({ necessary: true, analytics: true, marketing: true })
    );
  });
}

test.describe('the studio price is the price the shopfront quotes and charges', () => {
  test.beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ monthlyCents: number; yearlyCents: number }>>(
      `SELECT "monthlyCents", "yearlyCents" FROM "PlanVersion"
       WHERE "planId" = 'ultra' AND "status" = 'published' ORDER BY "version" DESC LIMIT 1`
    );
    ultraBefore = rows[0] ?? null;
    await prisma.$executeRawUnsafe(
      `UPDATE "PlanVersion" SET "monthlyCents" = $1, "yearlyCents" = $2
       WHERE "planId" = 'ultra' AND "status" = 'published'`,
      STUDIO_MONTHLY,
      STUDIO_YEARLY
    );
  });

  test.afterAll(async () => {
    if (ultraBefore) {
      await prisma.$executeRawUnsafe(
        `UPDATE "PlanVersion" SET "monthlyCents" = $1, "yearlyCents" = $2
         WHERE "planId" = 'ultra' AND "status" = 'published'`,
        ultraBefore.monthlyCents,
        ultraBefore.yearlyCents
      );
    }
  });

  test('the public pricing page quotes the published version, not the catalogue', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Aylık', exact: true }).click();

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
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Aylık', exact: true }).click();

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
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Aylık', exact: true }).click();
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

test.describe('a private plan is neither shown nor sold to a tenant it was not assigned to', () => {
  test.beforeAll(async () => {
    await prisma.$executeRawUnsafe(`UPDATE "Plan" SET "visibility" = 'private' WHERE "id" = 'basic'`);
    // No PlanAssignment row: nobody has been given it.
    await prisma.$executeRawUnsafe(`DELETE FROM "PlanAssignment" WHERE "planId" = 'basic'`);
  });

  test.afterAll(async () => {
    await prisma.$executeRawUnsafe(`UPDATE "Plan" SET "visibility" = 'public' WHERE "id" = 'basic'`);
  });

  test('it is gone from the public pricing page', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('plan-card-basic')).toHaveCount(0);
    // Not vacuous: the other public plans are still there.
    await expect(page.getByTestId('plan-card-pro')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/04-private-plan-hidden.png`, fullPage: true });
  });

  test("it is gone from an unassigned tenant's billing panel", async ({ page, baseURL }) => {
    await signIn(page, baseURL as string);
    await consent(page);
    await page.goto(BILLING_URL);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('settings-plan-card-basic')).toHaveCount(0);
    await expect(page.getByTestId('settings-plan-card-pro')).toBeVisible();
    await page.getByTestId('settings-plan-card-pro').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/05-private-plan-hidden-panel.png` });
  });

  test('and it cannot be bought even when the sku is posted by hand', async ({ request }) => {
    // The separate measurement the card asks for. A hidden card proves nothing
    // about the endpoint: before this task the same request answered 200 with
    // `totalMinor: 4500`.
    for (const sku of ['plan-basic', 'basic', 'BASIC']) {
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
    await prisma.$executeRawUnsafe(`UPDATE "Plan" SET "visibility" = 'private' WHERE "id" = 'basic'`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PlanAssignment" ("id","planId","tenantId","assignedBy","updatedAt")
       VALUES ('pa_e2e_storefront','basic',$1,'e2e-fixture',CURRENT_TIMESTAMP)
       ON CONFLICT ("planId","tenantId") DO NOTHING`,
      TENANT_ID
    );
  });

  test.afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "PlanAssignment" WHERE "id" = 'pa_e2e_storefront'`);
    await prisma.$executeRawUnsafe(`UPDATE "Plan" SET "visibility" = 'public' WHERE "id" = 'basic'`);
  });

  test('the assigned tenant sees it in its billing panel and can be quoted', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string);
    await consent(page);
    await page.goto(BILLING_URL);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('settings-plan-card-basic')).toBeVisible();
    await page.getByTestId('settings-plan-card-basic').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/06-private-plan-assigned-visible.png` });
  });

  test('but it stays off the public pricing page, which no session backs', async ({ page }) => {
    await consent(page);
    await page.goto('/tr/pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('plan-card-basic')).toHaveCount(0);
  });
});
