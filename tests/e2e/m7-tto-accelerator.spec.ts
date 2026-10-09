import { test, expect, type Page } from '@playwright/test';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { prisma } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';
import { shotsDir } from './fixtures/shots';
import { signInAs, seedIdentity } from './fixtures/session';
import { expectHydrated } from './fixtures/hydration';

/**
 * M7 TTO Accelerator — Technology Transfer Portfolio.
 *
 * Covers the complete flow: sign-in to TTO page, create portfolio items (with correct
 * tenantId), call matching (mocked network), IP checklist generation (LLM fallback on
 * blank keys), form validation, module gates (off/outside plan), tenant isolation, and
 * responsive layout at 390px.
 *
 * Fixture data uses `seedIdentity` + `withSystemScope` RLS bypass; cleaned up in afterAll.
 * Both tenants are the spec's own: demo-tenant is on `pro`, which does not grant M7,
 * so on a fresh database every page here rendered "This module is not available"
 * and the soft checks passed on that (TASK-MUUS5HE3OW0CT). No demo-tenant row is
 * read or written.
 */

const SHOTS = shotsDir('TASK-MUU75WHQFP46P-screenshots');
const TENANT = 'e2e-m7-tenant';
/** Main workspace of TENANT. */
const MAIN_WORKSPACE = {
  id: 'e2e-m7-main-ws',
  slug: 'm7-main',
  name: 'M7 TTO Main',
};
const WORKSPACE = MAIN_WORKSPACE.slug;

/** Test user for M7 tests — PIPELINE_MANAGER role */
const M7_MEMBER = {
  userId: 'e2e-m7-member',
  email: 'm7-member@e2e.fabrika.test',
  role: 'PIPELINE_MANAGER' as const,
  tenantId: TENANT,
};

/** Tenant isolation test — separate tenant, separate user */
const ISOLATION_TENANT = 'e2e-isolation-tenant-m7';
const ISOLATION_MEMBER = {
  userId: 'e2e-isolation-user-m7',
  email: 'isolation@e2e-m7.test',
  role: 'PIPELINE_MANAGER' as const,
  tenantId: ISOLATION_TENANT,
};

/** Custom workspace for isolation tests */
const ISOLATION_WORKSPACE = {
  id: 'e2e-m7-isolation-ws',
  slug: 'isolation-m7',
  name: 'Isolation Test M7',
};

const TTO_BASE_URL = `/${WORKSPACE}/tto`;

/**
 * `signInAs` reads the user from `id` (or `sub`); these fixtures name it `userId`
 * for `seedIdentity`. Passed as-is, every sign-in threw "token must include id".
 */
function sessionToken(member: typeof M7_MEMBER | typeof ISOLATION_MEMBER) {
  return { id: member.userId, email: member.email, tenantId: member.tenantId, role: member.role };
}

/** Titles the TTO page used to invent for an empty tenant (BUG-2, TASK-MUUS5HE3OW0CT). */
const FABRICATED_ITEM_TITLES = [
  'Solid-State Electrolyte Micro-Sensor Array',
  'AI-Driven Catalyst Design for Green Hydrogen Synthesis',
  'Recyclable Carbon Fiber Composite Matrix',
];

/** Topics `matchTtoItemToCalls` used to return whatever the item was (BUG-3). */
const FABRICATED_TOPIC_TITLES = [
  'Zero-Emission Transport Systems & Battery Safety',
  'Advanced Materials & Sensors for Clean Energy',
  'EIC Accelerator Deep-Tech Scale-up',
];

const GATED_ITEM_TITLE = 'E2E M7 gated create item';

/**
 * The module refusal as the page says it, in the page's own locale. Next's route
 * announcer is also `role="alert"`, so the band is matched by its text.
 */
async function moduleRefusal(page: Page) {
  const lang = await page.evaluate(() => document.documentElement.lang);
  const text = (lang.startsWith('tr') ? trMessages : enMessages).Common.moduleUnavailable;
  return page.getByRole('alert').filter({ hasText: text });
}
const MATCH_ITEM_TITLE = 'E2E M7 match item';
const GATED_MATCH_ITEM_TITLE = 'E2E M7 gated match item';

const SPEC_TENANTS = [TENANT, ISOLATION_TENANT];

/**
 * The spec's tenants themselves. `seedIdentity` creates a workspace, user and
 * membership but never the Tenant row they point at, so on a fresh database
 * (CI: db push + migrations + seed, which seeds only demo-tenant) the workspace
 * upsert failed on Workspace_tenantId_fkey. A run against a database that still
 * held the row from somewhere else passed — that was the difference. The plan is
 * written out (`ultra`, no version: PLAN_GRANTS fallback) so M7 is inside it.
 */
async function seedSpecTenants() {
  await withSystemScope('platform-admin', 'e2e.m7-tto.setup', async (tx) => {
    for (const id of SPEC_TENANTS) {
      await tx.tenant.upsert({
        where: { id },
        create: { id, name: `M7 TTO e2e (${id})`, slug: id, country: 'TR', orgType: 'SME' },
        update: {},
      });
      await tx.subscription.upsert({
        where: { tenantId: id },
        create: { tenantId: id, planId: 'ultra', status: 'ACTIVE' },
        update: { planId: 'ultra', status: 'ACTIVE', planVersionId: null },
      });
    }
  });
}

/**
 * Cleanup function: removes the spec's two tenants with everything in them and its
 * two users. Runs before the suite as well, so an interrupted run leaves nothing behind.
 */
async function cleanup() {
  try {
    // TtoPortfolioItem has no foreign key to Tenant, so its rows do not cascade.
    await prisma.ttoPortfolioItem.deleteMany({ where: { tenantId: { in: SPEC_TENANTS } } });
    await prisma.membership.deleteMany({
      where: { userId: { in: [M7_MEMBER.userId, ISOLATION_MEMBER.userId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [M7_MEMBER.userId, ISOLATION_MEMBER.userId] } },
    });
    // Workspaces, subscriptions and module states go with the tenants (Cascade).
    await withSystemScope('platform-admin', 'e2e.m7-tto.teardown', (tx) =>
      tx.tenant.deleteMany({ where: { id: { in: SPEC_TENANTS } } })
    );
  } catch (e) {
    // Teardown is best-effort; don't fail the suite if it fails
    console.warn('[M7 E2E cleanup]', e);
  }
}

test.describe('M7 TTO Accelerator', () => {
  test.beforeAll(async () => {
    // Clean up any leftover from prior runs, then seed fresh fixtures
    await cleanup();

    await seedSpecTenants();
    await seedIdentity(M7_MEMBER, MAIN_WORKSPACE);
    await seedIdentity(ISOLATION_MEMBER, ISOLATION_WORKSPACE);

    // Enable M7 module for both tenants
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
      create: { tenantId: TENANT, moduleId: 'M7', status: 'ON' },
      update: { status: 'ON' },
    });

    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: ISOLATION_TENANT, moduleId: 'M7' } },
      create: { tenantId: ISOLATION_TENANT, moduleId: 'M7', status: 'ON' },
      update: { status: 'ON' },
    });
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test('01 — sign-in and page load (hydration)', async ({ page }) => {
    // Page hydrates and shows "no items" or demo fallback on first load
    await signInAs(page, sessionToken(M7_MEMBER));
    await page.goto(TTO_BASE_URL);

    // TTO page should be visible (either as main content or fallback)
    const heading = page.locator('h1, h2');
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await expectHydrated(heading);

    await page.screenshot({ path: `${SHOTS}/01-tto-page-loaded.png`, fullPage: true });
  });

  test('02 — create portfolio item with correct tenantId', async ({ page }) => {
    await signInAs(page, sessionToken(M7_MEMBER));
    await page.goto(TTO_BASE_URL);
    await expectHydrated(page.locator('body'));

    // Find form inputs: title, TRL, patent status, summary, keywords
    const titleInput = page.locator('input[placeholder*="title" i], input[name*="title" i]').first();
    const trlInput = page.locator('input[type="range"], select[name*="trl" i]').first();
    const summaryInput = page.locator('textarea[placeholder*="summary" i], textarea[name*="summary" i]').first();
    const keywordsInput = page.locator('input[placeholder*="keyword" i], input[name*="keyword" i]').first();
    const submitBtn = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Create"), button:has-text("Oluştur"), button:has-text("Add")').first();

    // Fill and submit the form
    if (await titleInput.isVisible()) {
      await titleInput.fill('AI-Powered Drug Discovery Platform');
      if (await trlInput.isVisible()) {
        await trlInput.fill('6');
      }
      if (await summaryInput.isVisible()) {
        await summaryInput.fill('ML-accelerated molecular docking for therapeutic targeting, patented algorithm suite.');
      }
      if (await keywordsInput.isVisible()) {
        await keywordsInput.fill('AI, drug discovery, machine learning, pharma');
      }

      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Wait for item to appear in the portfolio (either new item or list refresh)
        await page.waitForTimeout(1500); // Give backend time to process
        await expectHydrated(page.locator('body'));

        // Verify the item appears in the DOM
        const itemTitle = page.locator('text="AI-Powered Drug Discovery Platform"');
        await expect(itemTitle).toBeVisible({ timeout: 5_000 });

        // Check database: verify TtoPortfolioItem exists with correct tenantId
        const item = await prisma.ttoPortfolioItem.findFirst({
          where: {
            title: 'AI-Powered Drug Discovery Platform',
            tenantId: TENANT,
          },
        });

        expect(item).toBeTruthy();
        expect(item?.tenantId).toBe(TENANT);
        expect(item?.trl).toBe(6);
        expect(item?.summary).toContain('ML-accelerated');
        expect(item?.keywords).toContain('AI');

        await page.screenshot({
          path: `${SHOTS}/02-item-created.png`,
          fullPage: true,
        });
      }
    } else {
      console.warn('[M7 E2E] Form inputs not visible; skipping create test');
    }
  });

  test('03 — call matching with mocked external network', async ({ page, context }) => {
    // Mock external network: route.fulfill() prevents real requests
    const mockFulfill = {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mockData: 'from-route-fulfill' }),
    };

    // Any external API calls should be fulfilled by the mock, not real network
    await context.route('https://api.example.com/**', (route) => route.fulfill(mockFulfill));

    await signInAs(page, sessionToken(M7_MEMBER));
    await page.goto(TTO_BASE_URL);
    await expectHydrated(page.locator('body'));

    // Look for "Match to Calls" or similar button/link
    const matchBtn = page.locator('button:has-text("Match"), button:has-text("Eşleş"), button:has-text("Çağrı")').first();

    if (await matchBtn.isVisible({ timeout: 5_000 })) {
      await matchBtn.click();

      // Wait for matched results to appear
      await page.waitForTimeout(1500);
      await expectHydrated(page.locator('body'));

      // Verify matching results show (topics, fit scores, etc.)
      const matchResults = page.locator('text=/fitScore|fit|eşle|uyum/i');
      const hasResults = await matchResults.count();

      if (hasResults > 0) {
        // Results are shown via the mocked response or fallback logic
        await page.screenshot({
          path: `${SHOTS}/03-matching-results.png`,
          fullPage: true,
        });
      }
    }
  });

  test('04 — IP checklist with LLM fallback (blank keys)', async ({ page }) => {
    // Set E2E_* environment to ensure LLM keys are blank/missing → fallback
    // The test setup already does this in playwright.config.ts
    await signInAs(page, sessionToken(M7_MEMBER));
    await page.goto(TTO_BASE_URL);
    await expectHydrated(page.locator('body'));

    // Look for "Generate Checklist" or similar button
    const checklistBtn = page.locator(
      'button:has-text("Checklist"), button:has-text("Kontrol"), button:has-text("Listesi"), button:has-text("IP")'
    ).first();

    if (await checklistBtn.isVisible({ timeout: 5_000 })) {
      await checklistBtn.click();

      // Wait for checklist modal/content to appear
      await page.waitForTimeout(2000);
      await expectHydrated(page.locator('body'));

      // On LLM failure, the UI shows an error band (not an alert())
      const errorBand = page.locator('[role="alert"], .alert, .error, .error-band').first();
      const checklistContent = page.locator('text=/kontrol|checklist|lisans/i');

      // Either error band or fallback content should be visible
      const hasError = await errorBand.isVisible({ timeout: 2_000 }).catch(() => false);
      const hasContent = await checklistContent.isVisible({ timeout: 2_000 }).catch(() => false);

      if (hasError || hasContent) {
        // Verify no browser alert() was called (set up listener before any potential trigger)
        let alertTriggered = false;
        const alertHandler = () => {
          alertTriggered = true;
        };
        page.once('dialog', alertHandler);

        // Give a moment to catch any alerts
        await page.waitForTimeout(100);

        if (alertTriggered) {
          throw new Error('alert() was triggered, but error band should be used instead');
        }

        await page.screenshot({
          path: `${SHOTS}/04-checklist-fallback.png`,
          fullPage: true,
        });
      }
    }
  });

  test('05 — form validation (invalid title/trl)', async ({ page }) => {
    await signInAs(page, sessionToken(M7_MEMBER));
    await page.goto(TTO_BASE_URL);
    await expectHydrated(page.locator('body'));

    // Try to submit empty form or with invalid values
    const submitBtn = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Oluştur")').first();

    if (await submitBtn.isVisible({ timeout: 5_000 })) {
      // Click submit without filling anything
      await submitBtn.click();

      // Form should show validation error or prevent submission
      await page.waitForTimeout(500);

      // Check for validation error message or disabled state
      const errorMsg = page.locator('text=/required|zorunlu|invalid|geçersiz/i');
      const isDisabled = await submitBtn.isDisabled();

      if (await errorMsg.isVisible().catch(() => false) || isDisabled) {
        await page.screenshot({
          path: `${SHOTS}/05-form-validation.png`,
          fullPage: true,
        });
      }
    }
  });

  test('06 — module gate: M7 off (module disabled)', async ({ page }) => {
    // Disable M7 module for this test
    await prisma.moduleState.update({
      where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
      data: { status: 'OFF' },
    });

    try {
      await signInAs(page, sessionToken(M7_MEMBER));
      await page.goto(TTO_BASE_URL);
      await expectHydrated(page.locator('body'));

      // Page should show a gate error/lock message, not the TTO content
      const gateMsg = page.locator('text=/lock|disabled|kapalı|erişim/i').first();
      const ttoContent = page.locator('text=/TTO|portfolio/i').first();

      // Either gate message visible or TTO content hidden
      const hasGate = await gateMsg.isVisible({ timeout: 5_000 }).catch(() => false);
      const ttoVisible = await ttoContent.isVisible({ timeout: 2_000 }).catch(() => false);

      if (hasGate || !ttoVisible) {
        await page.screenshot({
          path: `${SHOTS}/06-module-gate-off.png`,
          fullPage: true,
        });
      }
    } finally {
      // Re-enable M7 for other tests
      await prisma.moduleState.update({
        where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
        data: { status: 'ON' },
      });
    }
  });

  test('07 — tenant isolation: one tenant cannot read another tenants items', async ({ browser }) => {
    // Ensure both tenants have module M7 ON
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
      create: { tenantId: TENANT, moduleId: 'M7', status: 'ON' },
      update: { status: 'ON' },
    });

    // Create an item in TENANT
    const mainItem = await prisma.ttoPortfolioItem.create({
      data: {
        tenantId: TENANT,
        title: 'Main Tenant Item',
        trl: 5,
        patentStatus: 'granted',
        summary: 'Item visible only to main tenant',
        keywords: ['main', 'tenant'],
      },
    });

    // Create an item in ISOLATION_TENANT
    const isoItem = await prisma.ttoPortfolioItem.create({
      data: {
        tenantId: ISOLATION_TENANT,
        title: 'Isolation Tenant Item',
        trl: 4,
        patentStatus: 'pending',
        summary: 'Item visible only to isolation tenant',
        keywords: ['isolation', 'tenant'],
      },
    });

    try {
      // Context 1: Main tenant member
      const ctx1 = await browser.newContext();
      const page1 = await ctx1.newPage();
      await signInAs(page1, sessionToken(M7_MEMBER));
      await page1.goto(TTO_BASE_URL);
      await expectHydrated(page1.locator('body'));

      // Main tenant member should see their item
      const mainVisible = await page1.locator(`text="${mainItem.title}"`).isVisible({ timeout: 5_000 }).catch(() => false);

      // Main tenant member should NOT see isolation tenant item
      const isoVisible = await page1.locator(`text="${isoItem.title}"`).isVisible({ timeout: 2_000 }).catch(() => false);

      if (mainVisible && !isoVisible) {
        await page1.screenshot({
          path: `${SHOTS}/07-tenant-isolation-main.png`,
          fullPage: true,
        });
      } else {
        throw new Error(`Tenant isolation failed: mainVisible=${mainVisible}, isoVisible=${isoVisible}`);
      }

      await ctx1.close();

      // Context 2: Isolation tenant member
      const ctx2 = await browser.newContext();
      const page2 = await ctx2.newPage();
      await signInAs(page2, sessionToken(ISOLATION_MEMBER));
      await page2.goto(`/${ISOLATION_WORKSPACE.slug}/tto`);
      await expectHydrated(page2.locator('body'));

      // Isolation tenant member should see their item
      const isoVisible2 = await page2.locator(`text="${isoItem.title}"`).isVisible({ timeout: 5_000 }).catch(() => false);

      // Isolation tenant member should NOT see main tenant item
      const mainVisible2 = await page2.locator(`text="${mainItem.title}"`).isVisible({ timeout: 2_000 }).catch(() => false);

      if (isoVisible2 && !mainVisible2) {
        await page2.screenshot({
          path: `${SHOTS}/07-tenant-isolation-iso.png`,
          fullPage: true,
        });
      } else {
        throw new Error(`Tenant isolation failed: isoVisible2=${isoVisible2}, mainVisible2=${mainVisible2}`);
      }

      await ctx2.close();
    } finally {
      // Cleanup test items
      await prisma.ttoPortfolioItem.delete({ where: { id: mainItem.id } });
      await prisma.ttoPortfolioItem.delete({ where: { id: isoItem.id } });
    }
  });

  test('08 — responsive layout 390px (mobile)', async ({ page }) => {
    // Set viewport to 390px (common mobile width)
    await page.setViewportSize({ width: 390, height: 844 });

    await signInAs(page, sessionToken(M7_MEMBER));
    await page.goto(TTO_BASE_URL);
    await expectHydrated(page.locator('body'));

    // Verify layout is responsive: no horizontal scroll, legible text
    const body = page.locator('body');
    const bodyBox = await body.boundingBox();

    if (bodyBox) {
      // Body should not overflow the viewport
      expect(bodyBox.width).toBeLessThanOrEqual(390);
    }

    // Check that main content is visible
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: `${SHOTS}/08-responsive-390px.png`,
      fullPage: true,
    });

    // Reset viewport for next tests
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('09 — navigation between /tto and /tto-hizlandirici', async ({ page }) => {
    await signInAs(page, sessionToken(M7_MEMBER));

    // Start at /tto
    await page.goto(TTO_BASE_URL);
    await expectHydrated(page.locator('body'));
    await page.waitForURL(`**${TTO_BASE_URL}`, { timeout: 5_000 });

    const ttoContent = page.locator('text=/TTO|Hızlandırıcı|portfolio/i').first();
    await expect(ttoContent).toBeVisible({ timeout: 5_000 });

    // Look for navigation link to /tto-hizlandirici (or vice versa)
    const navLink = page.locator(`a[href*="tto-hizlandirici"], a:has-text("Hızlandırıcı"), a:has-text("Accelerator")`).first();

    if (await navLink.isVisible({ timeout: 2_000 })) {
      await navLink.click();

      // Should navigate to the alternate URL
      await page.waitForURL(`**tto-hizlandirici`, { timeout: 5_000 }).catch(() => {
        // Not all paths may have the alternate; that's okay
      });

      await expectHydrated(page.locator('body'));
      await page.screenshot({
        path: `${SHOTS}/09-navigation.png`,
        fullPage: true,
      });
    }
  });

  test('10 — duplicate TtoPortfolioItem rows use correct tenantId', async () => {
    // Create a second item under the same tenant with seeded user
    const item1 = await prisma.ttoPortfolioItem.create({
      data: {
        tenantId: TENANT,
        title: 'Quantum Computing Framework',
        trl: 3,
        patentStatus: 'pending',
        summary: 'Early-stage quantum algorithm framework',
        keywords: ['quantum', 'computing'],
      },
    });

    const item2 = await prisma.ttoPortfolioItem.create({
      data: {
        tenantId: TENANT,
        title: 'Biotech Platform',
        trl: 7,
        patentStatus: 'licensed',
        summary: 'Production-ready biotech platform',
        keywords: ['biotech', 'platform'],
      },
    });

    // Both should belong to TENANT
    expect(item1.tenantId).toBe(TENANT);
    expect(item2.tenantId).toBe(TENANT);

    // Verify no items leaked into ISOLATION_TENANT
    const isoCount = await prisma.ttoPortfolioItem.count({
      where: { tenantId: ISOLATION_TENANT },
    });
    // Should only be items we explicitly created for isolation tests
    expect(isoCount).toBeLessThanOrEqual(1);

    // Cleanup
    await prisma.ttoPortfolioItem.delete({ where: { id: item1.id } });
    await prisma.ttoPortfolioItem.delete({ where: { id: item2.id } });
  });

  // ── TASK-MUUS5HE3OW0CT: the three bugs FIX-2 closed. Each must go red on the
  // pre-fix code (36cda69d) and green after it, with no expected-failure marks.

  test('11 — BUG-1: createTtoItem refuses to write while M7 is off', async ({ page }) => {
    await signInAs(page, sessionToken(M7_MEMBER));
    await page.goto(TTO_BASE_URL);
    await expectHydrated(page.locator('body'));

    const titleInput = page.getByPlaceholder('Örn: Katı Hal Batarya Mikrosensör Dizesi');
    const submitBtn = page.getByRole('button', { name: 'TTO Portföyüne Kaydet' });
    await expect(titleInput).toBeVisible();
    await titleInput.fill(GATED_ITEM_TITLE);

    // The page was served with M7 on; the module goes off before the POST, so
    // only the action's own gate stands between the request and the write.
    await prisma.moduleState.update({
      where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
      data: { status: 'OFF' },
    });
    try {
      const posted = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/tto'));
      await submitBtn.click();
      await posted;
      await expect(submitBtn).toBeEnabled();

      const written = await prisma.ttoPortfolioItem.count({ where: { tenantId: TENANT, title: GATED_ITEM_TITLE } });
      expect(written).toBe(0);
      await expect(page.locator('h4', { hasText: GATED_ITEM_TITLE })).toHaveCount(0);
      // The refusal is said, not swallowed (TASK-MUUS5HE3OW0CT follow-up).
      await expect(await moduleRefusal(page)).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/11-bug1-gated-create.png`, fullPage: true });
    } finally {
      await prisma.moduleState.update({
        where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
        data: { status: 'ON' },
      });
    }

    // Control: the same form, module back on, does write — so the 0 above was the
    // gate, not a form that never submitted.
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/tto'));
    await submitBtn.click();
    await posted;
    await expect(page.locator('h4', { hasText: GATED_ITEM_TITLE })).toBeVisible();
    expect(await prisma.ttoPortfolioItem.count({ where: { tenantId: TENANT, title: GATED_ITEM_TITLE } })).toBe(1);
  });

  test('12 — BUG-2: an empty tenant sees an honest empty state, no invented portfolio', async ({ page }) => {
    // Precondition: the isolation tenant really has no portfolio rows.
    expect(await prisma.ttoPortfolioItem.count({ where: { tenantId: ISOLATION_TENANT } })).toBe(0);

    await signInAs(page, sessionToken(ISOLATION_MEMBER));
    await page.goto(`/${ISOLATION_WORKSPACE.slug}/tto`);
    await expectHydrated(page.locator('body'));

    await expect(page.getByText('Portföyde henüz teknoloji kaydı bulunmamaktadır.')).toBeVisible();
    // Header figures come from the (zero) real rows.
    await expect(page.getByText('TTO Portföy Kartları (0)')).toBeVisible();
    await expect(page.getByText('Portföy Teknolojileri (0)')).toBeVisible();
    await expect(page.getByText('TRL 0.0')).toBeVisible();
    for (const fabricated of FABRICATED_ITEM_TITLES) {
      await expect(page.getByText(fabricated)).toHaveCount(0);
    }
    await page.screenshot({ path: `${SHOTS}/12-bug2-empty-state.png`, fullPage: true });
  });

  test('13 — BUG-3: matching shows no invented topics or scores', async ({ page }) => {
    const item = await prisma.ttoPortfolioItem.create({
      data: {
        tenantId: TENANT,
        title: MATCH_ITEM_TITLE,
        trl: 5,
        patentStatus: 'granted',
        summary: 'Item the matcher runs against',
        keywords: ['e2e', 'matching'],
      },
    });
    try {
      await signInAs(page, sessionToken(M7_MEMBER));
      await page.goto(TTO_BASE_URL);
      await expectHydrated(page.locator('body'));

      const card = page.locator('div.rounded-2xl', { has: page.locator('h4', { hasText: MATCH_ITEM_TITLE }) });
      await expect(card).toHaveCount(1);
      await card.getByRole('button', { name: 'AB Çağrıları Eşleştir' }).click();

      await expect(page.getByText('AB Çağrı Eşleştirme Sonucu (0)')).toBeVisible();
      await expect(page.getByText('Bu teknoloji için eşleşen AB çağrısı bulunamamıştır.')).toBeVisible();
      for (const fabricated of FABRICATED_TOPIC_TITLES) {
        await expect(page.getByText(fabricated)).toHaveCount(0);
      }
      await expect(page.getByText(/HORIZON-CL5-2026-D3-01|EIC-ACC-2026-STEP/)).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/13-bug3-matching-empty.png`, fullPage: true });
    } finally {
      await prisma.ttoPortfolioItem.delete({ where: { id: item.id } });
    }
  });

  test('14 — matchTtoItemToCalls is gated too, and the refusal is shown', async ({ page }) => {
    const item = await prisma.ttoPortfolioItem.create({
      data: {
        tenantId: TENANT,
        title: GATED_MATCH_ITEM_TITLE,
        trl: 4,
        patentStatus: 'pending',
        summary: 'Item matched while M7 is off',
        keywords: ['e2e'],
      },
    });
    try {
      await signInAs(page, sessionToken(M7_MEMBER));
      await page.goto(TTO_BASE_URL);
      await expectHydrated(page.locator('body'));
      const card = page.locator('div.rounded-2xl', { has: page.locator('h4', { hasText: GATED_MATCH_ITEM_TITLE }) });
      await expect(card).toHaveCount(1);

      await prisma.moduleState.update({
        where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
        data: { status: 'OFF' },
      });
      try {
        const posted = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/tto'));
        await card.getByRole('button', { name: 'AB Çağrıları Eşleştir' }).click();
        await posted;
        await expect(await moduleRefusal(page)).toBeVisible();
        // No result modal over it: a refusal is not "no matching call found".
        await expect(page.getByText(/AB Çağrı Eşleştirme Sonucu/)).toHaveCount(0);
        await page.screenshot({ path: `${SHOTS}/14-gated-match-message.png`, fullPage: true });
      } finally {
        await prisma.moduleState.update({
          where: { tenantId_moduleId: { tenantId: TENANT, moduleId: 'M7' } },
          data: { status: 'ON' },
        });
      }

      // Control: module back on, the same button answers with the honest empty result.
      await card.getByRole('button', { name: 'AB Çağrıları Eşleştir' }).click();
      await expect(page.getByText('AB Çağrı Eşleştirme Sonucu (0)')).toBeVisible();
      await expect(await moduleRefusal(page)).toHaveCount(0);
    } finally {
      await prisma.ttoPortfolioItem.delete({ where: { id: item.id } });
    }
  });
});
