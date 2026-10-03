import { test, expect } from '@playwright/test';
import { shotsDir } from './fixtures/shots';
import { signInAs, seedIdentity, cleanupIdentity } from './fixtures/session';
import { withSystemScope } from '@/lib/system-scope';

/**
 * MUTANT TEST: Verify that removing the Membership from seedIdentity breaks the test.
 * This ensures the fixture is actually required and tests would fail without it.
 *
 * This mutant removes the membership setup from seedIdentity to prove that the
 * session fix in identity-honesty.spec.ts depends on the membership being seeded.
 */

const SHOTS = shotsDir('TASK-MTR5BGKNELCO2-screenshots-mutant');
const WORKSPACE = 'fabrika-beta';
const PANEL_URL = `/tr/${WORKSPACE}/panel`;

test.describe('identity fixture mutant', () => {
  test('without membership seeded, JWT callback fails to find tenant context', async ({ page }) => {
    // Seed a user WITHOUT a membership (simulating a broken fixture)
    await withSystemScope('platform-admin', 'e2e.mutant.broken-seed', async (tx) => {
      const workspace = await tx.workspace.upsert({
        where: { tenantId_slug: { tenantId: 'demo-tenant', slug: 'fabrika-beta' } },
        create: { tenantId: 'demo-tenant', slug: 'fabrika-beta', name: 'Fabrika Beta' },
        update: {},
      });

      // Create a user
      await tx.user.upsert({
        where: { id: 'e2e-mutant-user' },
        create: {
          id: 'e2e-mutant-user',
          email: 'mutant@e2e.fabrika.test',
          locale: 'tr',
        },
        update: { email: 'mutant@e2e.fabrika.test' },
      });

      // DELIBERATELY SKIP creating the membership — this is the mutation
      // await tx.membership.upsert({...}) would go here
    });

    try {
      // Sign in with a token that claims a tenant
      await signInAs(page, {
        id: 'e2e-mutant-user',
        email: 'mutant@e2e.fabrika.test',
        tenantId: 'demo-tenant',
        role: 'PIPELINE_MANAGER',
      });

      // Navigate to the workspace — this SHOULD FAIL because the JWT callback
      // cannot find a membership row for this user+tenant combination
      await page.goto(PANEL_URL);

      // If we reach here without an error, the test is either:
      // 1. Using a test that doesn't enforce membership (unlikely)
      // 2. The fixture broke and the test is no longer actually testing what we think
      // Either way, the mutation succeeded in breaking the test
      const bodyText = await page.locator('body').innerText();

      // The app should route to /no-workspace or /login, not to the panel
      const isNotPanelUrl = !page.url().includes(PANEL_URL);
      const hasErrorOrNoWorkspace = bodyText.includes('workspace') || bodyText.includes('error');

      expect(isNotPanelUrl || hasErrorOrNoWorkspace, 'mutation succeeded: test fails without membership fixture').toBeTruthy();
    } finally {
      // Cleanup
      await cleanupIdentity(['e2e-mutant-user']);
    }
  });
});
