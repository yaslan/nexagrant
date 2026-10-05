import { test, expect } from '@playwright/test';
import { seedIdentity, signInAs, cleanupIdentity } from './fixtures/session';
import { withSystemScope } from '@/lib/system-scope';

/**
 * Test the person-days report page responsive layout.
 * Verifies that the table and header layout adapt correctly to mobile (390px) and desktop (1280px) viewports.
 * TASK-MUVFUMNPHWLF9: Ensure table doesn't overflow at 390px by using min-w-0 pattern.
 */
test.describe('Person-Days Report - Responsive Layout', () => {
  const testUserId = 'e2e-person-days-test';
  const testTenantId = 'e2e-person-days-tenant';
  const testWorkspace = { id: 'e2e-person-days-ws', slug: 'e2e-person-days', name: 'Person Days Test' };

  test.beforeAll(async () => {
    // Seed test user and workspace
    await seedIdentity(
      {
        userId: testUserId,
        email: 'persondays@e2e.test',
        name: 'Person Days Tester',
        role: 'TENANT_OWNER',
        tenantId: testTenantId,
      },
      testWorkspace,
    );

    // Create test effort data
    await withSystemScope('platform-admin', 'e2e.person-days', async (tx) => {
      // Create opportunities
      const opp1 = await tx.opportunity.create({
        data: {
          id: 'opp-1-e2e',
          tenantId: testTenantId,
          title: 'Advanced AI Solutions for Climate Modeling',
          workspaceId: testWorkspace.id,
          stage: 'G0',
        },
      });

      const opp2 = await tx.opportunity.create({
        data: {
          id: 'opp-2-e2e',
          tenantId: testTenantId,
          title: 'Smart Grids Optimization',
          workspaceId: testWorkspace.id,
          stage: 'G0',
        },
      });

      // Create efforts
      await tx.effort.create({
        data: {
          tenantId: testTenantId,
          userId: testUserId,
          opportunityId: opp1.id,
          hours: 12.5,
          date: new Date('2026-01-15'),
        },
      });

      await tx.effort.create({
        data: {
          tenantId: testTenantId,
          userId: testUserId,
          opportunityId: opp1.id,
          hours: 8,
          date: new Date('2026-01-16'),
        },
      });

      await tx.effort.create({
        data: {
          tenantId: testTenantId,
          userId: testUserId,
          opportunityId: opp2.id,
          hours: 16,
          date: new Date('2026-01-17'),
        },
      });
    });
  });

  test.afterAll(async () => {
    // Cleanup
    await withSystemScope('platform-admin', 'e2e.person-days.cleanup', async (tx) => {
      await tx.effort.deleteMany({ where: { tenantId: testTenantId } });
      await tx.opportunity.deleteMany({ where: { tenantId: testTenantId } });
      await tx.moduleState.deleteMany({ where: { tenantId: testTenantId } });
      await tx.subscription.deleteMany({ where: { tenantId: testTenantId } });
      await tx.workspace.deleteMany({ where: { tenantId: testTenantId } });
      await tx.tenant.deleteMany({ where: { id: testTenantId } });
    });

    await cleanupIdentity([testUserId]);
  });

  test('should display table without horizontal overflow at 390px mobile viewport', async ({ page }) => {
    // Sign in
    await signInAs(page, {
      id: testUserId,
      email: 'persondays@e2e.test',
      name: 'Person Days Tester',
      tenantId: testTenantId,
      role: 'TENANT_OWNER',
    });

    // Set mobile viewport (390px)
    await page.setViewportSize({ width: 390, height: 844 });

    // Navigate to person-days report
    await page.goto(`/tr/${testWorkspace.slug}/reports/person-days`);

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /Adam-Gün Raporu|Person-Days Report/ })).toBeVisible({ timeout: 10000 });

    // Check that table exists and is visible
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Verify no horizontal overflow - the container should fit within viewport
    const tableContainer = page.locator('div.overflow-x-auto').first();
    const boundingBox = await tableContainer.boundingBox();

    if (boundingBox) {
      // The container's right edge should not exceed the viewport width significantly
      // Allow a small margin for scrollbars
      expect(boundingBox.x + boundingBox.width).toBeLessThanOrEqual(390 + 20);
    }

    // Take screenshot for visual verification
    await page.screenshot({ path: '/tmp/person-days-390px.png' });
  });

  test('should display table normally at 1280px desktop viewport', async ({ page }) => {
    // Sign in
    await signInAs(page, {
      id: testUserId,
      email: 'persondays@e2e.test',
      name: 'Person Days Tester',
      tenantId: testTenantId,
      role: 'TENANT_OWNER',
    });

    // Set desktop viewport (1280px)
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to person-days report
    await page.goto(`/tr/${testWorkspace.slug}/reports/person-days`);

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /Adam-Gün Raporu|Person-Days Report/ })).toBeVisible({ timeout: 10000 });

    // Check that table exists and is visible
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Verify table content is readable
    await expect(page.locator('th', { has: page.getByText(/Fırsat|Opportunity/) })).toBeVisible();
    await expect(page.locator('th', { has: page.getByText(/Toplam Saat|Total Hours/) })).toBeVisible();

    // Verify opportunity row exists
    await expect(page.getByRole('link', { name: /Advanced AI Solutions for Climate Modeling/ })).toBeVisible();

    // Take screenshot for visual verification
    await page.screenshot({ path: '/tmp/person-days-1280px.png' });
  });

  test('should have responsive header at mobile viewport', async ({ page }) => {
    // Sign in
    await signInAs(page, {
      id: testUserId,
      email: 'persondays@e2e.test',
      name: 'Person Days Tester',
      tenantId: testTenantId,
      role: 'TENANT_OWNER',
    });

    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });

    // Navigate to person-days report
    await page.goto(`/tr/${testWorkspace.slug}/reports/person-days`);

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /Adam-Gün Raporu|Person-Days Report/ })).toBeVisible({ timeout: 10000 });

    // Verify header badge is visible
    await expect(page.getByText(/Fırsata Göre|By Opportunity/)).toBeVisible();

    // Verify total summary is visible (may wrap to multiple lines on mobile)
    const totalText = page.locator('text=/Toplam|Total/');
    await expect(totalText).toBeVisible();
  });
});
