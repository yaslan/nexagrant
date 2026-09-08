import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { REL_E2E, seed, rollback } from '../../scripts/seed-relationship-e2e';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTRKV9JGY7OQY — M4 relationship screens, isolation in a real browser.
 *
 * The unit suite (tests/relationship-tenant-scope.test.ts) proves the loader
 * refuses, and proves the Prisma `undefined` behaviour that made the refusal
 * necessary. This file proves the same thing through the surface a customer
 * touches: a signed-in tenant clicking and typing URLs. `pnpm typecheck` was
 * green over this bug the whole time — `src/types/prisma-override.d.ts` hides
 * the generated client's types — so a real run is the only evidence worth
 * anything here.
 */

const SHOTS = shotsDir('TASK-MTRKV9JGY7OQY-screenshots');
const OWN_URL = `/tr/${REL_E2E.workspaceSlug}/relationships/${REL_E2E.relationshipId}`;
const STOLEN_URL = `/tr/${REL_E2E.workspaceSlug}/relationships/${REL_E2E.otherRelationshipId}`;
const LIST_URL = `/tr/${REL_E2E.workspaceSlug}/relationships`;

test.describe.configure({ mode: 'serial' });

test.describe('M4 relationships — tenant isolation', () => {
  test.beforeAll(async () => {
    await seed();
  });

  test.afterAll(async () => {
    if (process.env.REL_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // The cookie banner is a full-screen `inset-0` alertdialog that swallows
    // clicks; a recorded consent is the state a returning user is already in.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });
  });

  /**
   * Signs in as tenant A and lands on `target`.
   *
   * Every test gets its own browser context, so the session does not carry over
   * — and a test that silently ran signed-out would land on the login screen and
   * "prove" isolation by showing nothing at all. `waitForURL(target)` is the
   * check that the session is real: it only resolves once the app has let this
   * user through to the page under test.
   */
  async function signInAs(page: import('@playwright/test').Page, target: string) {
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
    await page.locator('input[type="email"]').fill(REL_E2E.email);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${target}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
  }

  test('tenant A signs in and reads its own relationship', async ({ page }) => {
    await signInAs(page, OWN_URL);

    await expect(page.getByTestId('relationship-title')).toHaveText(REL_E2E.counterpartName);
    // The interaction the fixture filed for tenant A renders in the timeline.
    await expect(page.getByText(`${REL_E2E.counterpartName} — görüşme notu`)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-tenant-a-own-relationship.png`, fullPage: true });
  });

  test('tenant B’s relationship id shows 404 for tenant A, and leaks no field', async ({ page }) => {
    // Asserted, not assumed: a 404 over a row that does not exist would prove
    // nothing about isolation.
    const b = await prisma.relationship.findUnique({
      where: { id: REL_E2E.otherRelationshipId },
      select: { tenantId: true, counterpartName: true },
    });
    expect(b, 'tenant B fixture must exist for this test to mean anything').not.toBeNull();
    expect(b!.tenantId).toBe(REL_E2E.otherTenantId);
    expect(b!.counterpartName).toBe(REL_E2E.otherCounterpartName);

    // Signed in as A, then asking for B's id — the exact move the old code
    // served. Landing on the login screen instead would make the assertions
    // below vacuous, so the session is established first and asserted by
    // `signInAs` before the stolen id is typed.
    await signInAs(page, OWN_URL);
    await page.goto(STOLEN_URL);
    await page.waitForLoadState('networkidle');

    // Asserted on what renders, not on the HTTP status, and that is a measured
    // decision rather than a convenience: this segment has a `loading.tsx`, so
    // Next streams the shell and the 200 header is on the wire before
    // `notFound()` runs. Measured both ways against this dev server — with
    // `[workspace]/loading.tsx` in place the response is 200, with the file
    // moved aside the identical request is 404. The status is a property of the
    // streaming boundary; what tenant A can see is the property under test.
    await expect(page.getByRole('heading', { name: 'Sayfa Bulunamadı' })).toBeVisible();
    await expect(page.getByTestId('relationship-title')).toHaveCount(0);
    // Nothing of B's row on the page — not the name, not the note.
    await expect(page.locator('body')).not.toContainText(REL_E2E.otherCounterpartName);
    await page.screenshot({ path: `${SHOTS}/02-tenant-b-id-404.png`, fullPage: true });
  });

  test('the list shows tenant A’s rows only', async ({ page }) => {
    // Both fixture rows asserted present first. The list page renders an empty
    // state when it finds nothing, and an empty state passes "B is not shown"
    // for the wrong reason — so the test proves there was something to leak.
    const rows = await prisma.relationship.findMany({
      where: { id: { in: [REL_E2E.relationshipId, REL_E2E.otherRelationshipId] } },
      select: { id: true, tenantId: true },
    });
    expect(rows, 'both fixture relationships must exist').toHaveLength(2);

    await signInAs(page, LIST_URL);

    await expect(page.getByText(REL_E2E.counterpartName).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(REL_E2E.otherCounterpartName);
    await page.screenshot({ path: `${SHOTS}/03-list-tenant-a-only.png`, fullPage: true });
  });
});
