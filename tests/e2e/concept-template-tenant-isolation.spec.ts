import { test, expect } from '@playwright/test';

import {
  CT_FOREIGN_SECTION_LABEL,
  CT_FOREIGN_TEMPLATE_NAME,
  CT_OPPORTUNITY_ID,
  CT_OWN_SECTION_LABEL,
  CT_WORKSPACE,
  setupConceptTemplateTenants,
  signInAsConceptTemplateUser,
  teardownConceptTemplateTenants,
} from './fixtures/concept-template-tenant';

/**
 * TASK-MTVTU103F11XJ — the browser-reachable half of the ConceptTemplate leak.
 *
 * The M2 page falls back to the template keyed `generic` when an opportunity has
 * no concept note yet. That lookup was
 * `prisma.conceptTemplate.findFirst({ where: { key: 'generic' } })` — no tenant
 * arm — so with two `generic` rows in the table the page rendered whichever one
 * Postgres returned first, and `ConceptTemplate.tenantId` is nullable precisely
 * because some of those rows belong to a single tenant.
 *
 * The fixture creates that collision on purpose: three rows keyed `generic` —
 * the seeded platform one (tenantId NULL), one owned by tenant B, and one owned
 * by tenant A. A real sign-in as tenant A opens the page, and the assertion is
 * *which* template's section labels reached the browser. A's own section must be
 * there (the unscoped lookup had no ORDER BY and returned the long-seeded
 * platform row instead) and B's must not be anywhere in the document.
 *
 * Why the rest of the defect is not in this file. The other four call sites take
 * the template id as a **server action argument**, which no sequence of clicks
 * can forge — the adversarial input is not reachable from the page. Those arms
 * are measured against the real database in
 * tests/concept-template-tenant-scope.live.test.ts, and the where clause itself
 * in src/modules/m2/server/templates.test.ts.
 */

const M2_URL = `/tr/${CT_WORKSPACE}/opportunities/${CT_OPPORTUNITY_ID}/m2`;

/** From the seeded platform `generic` template (prisma/seed.ts) — the fallback. */
const PLATFORM_SECTIONS = ['Executive Summary', 'Objectives', 'Expected Impact'];

test.describe('ConceptTemplate — a tenant-owned template never reaches another tenant', () => {
  test.beforeAll(async () => {
    await setupConceptTemplateTenants();
  });

  test.afterAll(async () => {
    await teardownConceptTemplateTenants();
  });

  test('the generic fallback resolves to the caller’s own template, never tenant B’s', async ({
    page,
  }) => {
    await signInAsConceptTemplateUser(page, M2_URL);

    // The page really rendered the editor rather than the "No template found"
    // branch — otherwise the absence assertions below would pass on an error
    // screen.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('No template found in system');

    // Positive: tenant A's own `generic` row won, deterministically.
    await expect(page.getByText(CT_OWN_SECTION_LABEL, { exact: false }).first()).toBeVisible();

    // Negative: tenant B owns a row with the same key, and none of it is here.
    expect(bodyText).not.toContain(CT_FOREIGN_TEMPLATE_NAME);
    expect(bodyText).not.toContain(CT_FOREIGN_SECTION_LABEL);

    // Counterfactual: the platform template is the *fallback*, so its sections
    // must NOT be on the page either — without this the positive assertion could
    // pass on a page rendering every template it could find.
    for (const section of PLATFORM_SECTIONS) {
      expect(bodyText).not.toContain(section);
    }
  });
});
