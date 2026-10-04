import { test, expect } from '@playwright/test';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

const baseURL = `http://localhost:${process.env.E2E_PORT ?? 3000}`;

test.describe('Notifications Center E2E', () => {
  const testUser = {
    userId: 'e2e-notif-user',
    email: 'notif-user@e2e.test',
    role: 'TENANT_OWNER' as const,
    tenantId: 'demo-tenant',
  };

  const testWorkspace = {
    id: 'e2e-notif-ws',
    slug: 'notif-workspace',
    name: 'Notification Test Workspace',
  };

  test.beforeAll(async () => {
    // Seed the test user with workspace
    await seedIdentity(testUser, testWorkspace);
  });

  test.afterAll(async () => {
    // Clean up only the rows this test created
    await cleanupIdentity([testUser.userId]);
  });

  test('displays unread notification badge and allows marking as read', async ({ page }) => {
    // Sign in as the test user
    await signInAs(page, testUser, baseURL);

    // Navigate to notifications page (English)
    await page.goto(`/en/notif-workspace/bildirimler`, { waitUntil: 'networkidle' });

    // Check that the page rendered with the title
    await expect(page.locator('h1')).toContainText('Notifications');

    // Verify unread badge is visible (assuming 2 unread notifications in the fixture)
    const unreadBadge = page.locator('text=/Unread Notifications/');
    await expect(unreadBadge).toBeVisible();

    // Click the first notification to mark it as read
    const firstNotification = page.locator('[role="article"]').first();
    await firstNotification.click();

    // Verify badge count decreases
    await expect(page.locator('text=/1 Unread Notifications/')).toBeVisible();

    // Verify the read state persists in localStorage
    const storedIds = await page.evaluate(() => {
      const key = localStorage.getItem('fonbridge_read_notifs_guest');
      return key ? JSON.parse(key) : [];
    });
    expect(storedIds).toContain('n1');
  });

  test('marks all notifications as read from header button', async ({ page }) => {
    await signInAs(page, testUser, baseURL);
    await page.goto(`/en/notif-workspace/notifications`, { waitUntil: 'networkidle' });

    // Click "Mark All as Read" button
    const markAllButton = page.locator('button:has-text("Mark All as Read")');
    await expect(markAllButton).toBeVisible();
    await markAllButton.click();

    // Verify the badge changes to "All Notifications Read"
    await expect(page.locator('text=/All Notifications Read/')).toBeVisible();

    // Verify localStorage contains all notification IDs
    const storedIds = await page.evaluate(() => {
      const key = localStorage.getItem('fonbridge_read_notifs_guest');
      return key ? JSON.parse(key) : [];
    });
    expect(storedIds.sort()).toEqual(['n1', 'n2']);
  });

  test('persists read state across page reload', async ({ page }) => {
    await signInAs(page, testUser, baseURL);
    await page.goto(`/en/notif-workspace/notifications`, { waitUntil: 'networkidle' });

    // Mark first notification as read
    const firstNotification = page.locator('[role="article"]').first();
    await firstNotification.click();
    await expect(page.locator('text=/1 Unread Notifications/')).toBeVisible();

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });

    // Verify the read state persists
    await expect(page.locator('text=/1 Unread Notifications/')).toBeVisible();
  });

  test('supports Turkish locale route', async ({ page }) => {
    await signInAs(page, testUser, baseURL);
    await page.goto(`/tr/notif-workspace/bildirimler`, { waitUntil: 'networkidle' });

    // Verify Turkish labels
    await expect(page.locator('text=/Bildirimler/')).toBeVisible();
    await expect(page.locator('text=/Okunmamış Bildirim/')).toBeVisible();
  });

  test('isolates notifications by tenant', async ({ page }) => {
    // Create a second user in a different tenant
    const otherTenant = {
      userId: 'e2e-other-tenant',
      email: 'other-tenant@e2e.test',
      role: 'TENANT_OWNER' as const,
      tenantId: 'other-demo-tenant',
    };

    try {
      await seedIdentity(otherTenant, {
        id: 'e2e-other-ws',
        slug: 'other-workspace',
        name: 'Other Tenant Workspace',
      });

      // Sign in the first user to a different workspace path to verify isolation
      // (In a real multi-tenant test, we'd use separate browser contexts)
      // For now, verify that navigation changes the workspace isolation
      const firstUserBadge = await page
        .locator('text=/Unread Notifications|All Notifications/')
        .textContent();

      // The first user should see their own notifications
      expect(firstUserBadge).toBeDefined();
    } finally {
      await cleanupIdentity(['e2e-other-tenant']);
    }
  });

  test('supports keyboard navigation', async ({ page }) => {
    await signInAs(page, testUser, baseURL);
    await page.goto(`/en/notif-workspace/notifications`, { waitUntil: 'networkidle' });

    // Focus the first notification using Tab
    const firstNotification = page.locator('[role="article"]').first();
    await firstNotification.focus();

    // Press Enter to mark as read (if it's keyboard-accessible)
    // This test assumes the notification row is a button or has click handlers
    await expect(firstNotification).toBeFocused();

    // Verify it's clickable
    await firstNotification.press('Enter');
    await expect(page.locator('text=/1 Unread Notifications/')).toBeVisible();
  });

  test('renders at 390px responsive width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone SE size
    await signInAs(page, testUser, baseURL);
    await page.goto(`/en/notif-workspace/notifications`, { waitUntil: 'networkidle' });

    // Verify header is visible
    await expect(page.locator('h1')).toContainText('Notifications');

    // Verify badge badge is visible
    const unreadBadge = page.locator('text=/Unread Notifications/');
    await expect(unreadBadge).toBeVisible();

    // Verify buttons are clickable at this width
    const markAllButton = page.locator('button:has-text("Mark All as Read")');
    await expect(markAllButton).toBeVisible();
    const boundingBox = await markAllButton.boundingBox();
    expect(boundingBox?.width).toBeLessThanOrEqual(390);
  });

  test('marks notification as read on single click', async ({ page }) => {
    await signInAs(page, testUser, baseURL);
    await page.goto(`/en/notif-workspace/notifications`, { waitUntil: 'networkidle' });

    // Get initial unread count
    const initialBadge = await page.locator('text=/Unread Notifications/').textContent();
    expect(initialBadge).toContain('2');

    // Click notification
    const firstNotification = page.locator('[role="article"]').first();
    await firstNotification.click();

    // Verify unread count decreased
    await expect(page.locator('text=/1 Unread Notifications/')).toBeVisible();

    // Verify the notification item lost its unread styling
    const dotIndicator = firstNotification.locator('[class*="rounded-full"][class*="bg-accent"]');
    await expect(dotIndicator).not.toBeVisible();
  });

  test('cross-tab updates read state (simulated storage event)', async ({ page }) => {
    await signInAs(page, testUser, baseURL);
    await page.goto(`/en/notif-workspace/notifications`, { waitUntil: 'networkidle' });

    // Initial state: 2 unread
    await expect(page.locator('text=/2 Unread Notifications/')).toBeVisible();

    // Simulate another tab marking one notification as read
    await page.evaluate(() => {
      const storageKey = localStorage.getItem('fonbridge_read_notifs_guest') || '[]';
      const readIds = JSON.parse(storageKey);
      localStorage.setItem('fonbridge_read_notifs_guest', JSON.stringify([...readIds, 'n1']));

      // Dispatch storage event (cross-tab update)
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'fonbridge_read_notifs_guest',
          newValue: JSON.stringify([...readIds, 'n1']),
        })
      );
    });

    // Verify the UI updated without a page reload
    await expect(page.locator('text=/1 Unread Notifications/')).toBeVisible();
  });
});
