/**
 * TASK-MUPUHIIKSQAPN — Y-4 regression test: Kurumsal Profil kaydı sunucuya gidiyor
 * ve sayfa yenilendikten sonra değer kalıcı oluyor.
 *
 * Before: Form "başarıyla güncellendi" gösteriyordu ama 0 POST gidiyordu ve veri kayboluyor.
 * After: Form gerçek sunucu isteği gönderiyor, başarı mesajı ancak sunucu başarılı dönünce gösterilir.
 */
import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';
import { expectHydrated } from './fixtures/hydration';
import { createDbClient } from '../../src/lib/db';

const TENANT_ID = 'demo-tenant';
const WORKSPACE_SLUG = 'main';
const PROFILE_URL = '/tr/main/settings/profile';
const TEST_EMAIL = 'profile-test@fabrika.test';

const prisma = createDbClient(
  process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika'
);

async function setupProfileTestUser() {
  // Ensure demo tenant exists
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: 'Demo Tenant',
      slug: TENANT_ID,
      country: 'TR',
      orgType: 'SME',
    },
  });

  // Ensure main workspace exists
  const workspaceId = `${TENANT_ID}-${WORKSPACE_SLUG}`;
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: {
      id: workspaceId,
      tenantId: TENANT_ID,
      name: 'Main Workspace',
      slug: WORKSPACE_SLUG,
    },
  });

  // Create test user (or update if exists)
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: {
      id: `profile-test-user`,
      email: TEST_EMAIL,
      name: 'Profile Test User',
      locale: 'tr',
    },
  });

  // Ensure membership exists with TENANT_OWNER role
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: TENANT_ID, userId: `profile-test-user` } },
    update: {},
    create: {
      tenantId: TENANT_ID,
      userId: `profile-test-user`,
      role: 'TENANT_OWNER',
      workspaceIds: [workspaceId],
    },
  });
}

async function signIn(page: Page, email: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true })
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(PROFILE_URL)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${PROFILE_URL}`, { timeout: 30_000 });
}

test.describe('Y-4 — Kurumsal Profil kaydı sunucuya gidiyor', () => {
  test.beforeAll(async () => {
    await setupProfileTestUser();
  });

  test.afterAll(async () => {
    await prisma.membership.deleteMany({ where: { tenantId: TENANT_ID, userId: `profile-test-user` } });
    await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => {});
    await prisma.$disconnect();
  });

  test('should send profile update to server and persist after reload', async ({ page }) => {
    // Sign in through the login flow with test user
    await signIn(page, TEST_EMAIL);

    // Wait for form to hydrate
    const saveButton = page.locator('button:has-text("Profili Kaydet")');
    await expectHydrated(saveButton);

    // Get the input fields
    const capabilitiesInput = page.locator('textarea[placeholder*="teknik"]');
    const keywordsInput = page.locator('input[placeholder*="e.g. AI"]');

    // Create new test data
    const testCapabilities = 'Yapay zeka algoritmaları, derin öğrenme, TRL 5-8 prototipleme deneyimi';
    const testKeywords = 'AI, Deep Learning, Robotics, Green Energy';

    // Fill form with test data
    await capabilitiesInput.clear();
    await capabilitiesInput.fill(testCapabilities);

    await keywordsInput.clear();
    await keywordsInput.fill(testKeywords);

    // Wait for success message locator
    const successMessage = page.locator('text=başarıyla güncellendi');

    // Click save button
    await saveButton.click();

    // Wait for success message to appear (indicates server action succeeded)
    await successMessage.waitFor({ state: 'visible', timeout: 5000 });

    // Verify success message is shown
    await expect(successMessage).toBeVisible();

    // Reload the page
    await page.reload();

    // Wait for form to hydrate again
    await expectHydrated(page.locator('button:has-text("Profili Kaydet")'));

    // Verify data persists after reload
    const savedCapabilities = await page.locator('textarea[placeholder*="teknik"]').inputValue();
    const savedKeywords = await page.locator('input[placeholder*="e.g. AI"]').inputValue();

    expect(savedCapabilities).toBe(testCapabilities);
    expect(savedKeywords).toBe(testKeywords);
  });

  test('should show error when server returns error', async ({ page }) => {
    // Sign in through the login flow
    await signIn(page, TEST_EMAIL);

    // Wait for form to hydrate
    const saveButton = page.locator('button:has-text("Profili Kaydet")');
    await expectHydrated(saveButton);

    const capabilitiesInput = page.locator('textarea[placeholder*="teknik"]');

    // Try to submit with empty capabilities (should fail validation)
    await capabilitiesInput.clear();

    // Should NOT show success message
    const successMessage = page.locator('text=başarıyla güncellendi');
    const errorMessage = page.locator('text=/Lütfen tüm alanları|Please fill/');

    await saveButton.click();

    // Verify error message is shown, not success
    // The error banner should appear with a validation message
    await expect(errorMessage).toBeVisible({ timeout: 3000 });

    // Ensure success message does NOT appear
    await expect(successMessage).not.toBeVisible();
  });
});
