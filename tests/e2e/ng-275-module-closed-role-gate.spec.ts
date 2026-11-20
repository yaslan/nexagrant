import { test, expect, type Page } from '@playwright/test';

import trMessages from '../../messages/tr.json';
import { signInAs } from './fixtures/session';
import {
  NG275_SEATS,
  NG275_TENANT,
  NG275_WORKSPACE,
  setupNg275ModuleClosedTenant,
  teardownNg275ModuleClosedTenant,
} from './fixtures/ng-275-module-closed-tenant';

/**
 * NG-275 — the role door runs before the module door on the pages it reordered.
 *
 * The tenant has M1, M2 and M5 switched OFF on a plan that includes them, so each page
 * below has a real lock screen to show. A role the page refuses must get the 403 and
 * never that lock: the lock would tell a guest which modules this tenant has. A role the
 * page admits (MEMBER holds every permission these pages ask for) must still see it.
 *
 * Only the reordered pages are listed here; `role-gate.spec.ts` keeps the partner pages.
 */

const FORBIDDEN_TITLE = trMessages.Forbidden.title;
const LOCK_TITLE = trMessages.ModuleGate.title;
const ws = `/tr/${NG275_WORKSPACE}`;

/**
 * One page per distinct door the reordered pages use:
 *   firsatlar           M5 + view_proposal        (pipeline list)
 *   konsept-notlar      M2 + view_proposal        (concept notes)
 *   onay-merkezi        M5 + request_dual_approval (approvals)
 *   reports/person-days M5 + view_proposal        (reports)
 *   ortaklar/kaynaklar  M1 + view_partner_search  (partner resources)
 */
const CLOSED_PAGES = [
  `${ws}/firsatlar`,
  `${ws}/konsept-notlar`,
  `${ws}/onay-merkezi`,
  `${ws}/reports/person-days`,
  `${ws}/ortaklar/kaynaklar`,
];

async function signIn(page: Page, role: 'MEMBER' | 'GUEST_PARTNER') {
  const seat = NG275_SEATS[role];
  await signInAs(page, { id: seat.id, email: seat.email, tenantId: NG275_TENANT, role });
}

test.describe.serial('NG-275 role door before module door (module closed)', () => {
  test.beforeAll(setupNg275ModuleClosedTenant);
  test.afterAll(teardownNg275ModuleClosedTenant);

  test('GUEST_PARTNER gets 403 and never the lock screen on every reordered page', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, 'GUEST_PARTNER');
    for (const path of CLOSED_PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(403);
      await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), path).toBeVisible();
      const html = await page.content();
      expect(html, path).not.toContain(LOCK_TITLE);
    }
  });

  test('MEMBER still reads the lock screen on every reordered page', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, 'MEMBER');
    for (const path of CLOSED_PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), path).toHaveCount(0);
      await expect(page.getByRole('heading', { name: LOCK_TITLE }), path).toBeVisible();
    }
  });
});
