import { test, expect } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import {
  MG_WORKSPACE,
  setupModuleGateTenant,
  signInAsModuleGateUser,
  teardownModuleGateTenant,
} from './fixtures/module-gate-tenant';

/**
 * The status half of the module gate — TASK-MTUI9ZBK7W4JY.
 *
 * What this file used to be: three tests that opened `/en/default/…` with no
 * session and asserted `expect(bodyText).toBeTruthy()` or that *some* `h1` was
 * visible. Measured on 2026-09-09, all three URLs answered `307` to the login
 * route (`src/app/[locale]/(app)/layout.tsx:50`, in since c915bc43 on 06-09), and
 * the sign-in screen carries an `<h1>` — so all three passed on the login page and
 * none of them had reached a module page in three days. The test named "gated page
 * shows lock screen" said so in its own comment: "In a real scenario, the module
 * would need to be set to OFF via DB/admin".
 *
 * So the spec now owns the tenant whose switches it is reading
 * (`fixtures/module-gate-tenant.ts`), and every assertion names a specific
 * outcome rather than the existence of a page:
 *
 *   1. anonymous  — a module page is not served at all; the redirect and its
 *                   target are asserted, per locale.
 *   2. M5 `ON`    — the pipeline board really renders, and the `/firsatlar` alias
 *                   renders the same module.
 *   3. M3 `OFF`   — the real 🔒 refusal, and it blames the switch, not the plan.
 *
 * Both modules are inside the fixture's `basic` plan, so nothing here can pass or
 * fail for an entitlement reason. That other half of the gate is
 * `module-plan-gate.spec.ts`, which owns a tenant it flips on purpose.
 */

const PIPELINE_URL = `/en/${MG_WORKSPACE}/pipeline`;
const FIRSATLAR_URL = `/tr/${MG_WORKSPACE}/firsatlar`;
const EVIDENCE_URL = `/en/${MG_WORKSPACE}/evidence`;

/**
 * Rendered by `pipeline/board.tsx`, and re-exported unchanged by `firsatlar`.
 *
 * Read out of the catalogues rather than written here as a literal
 * (TASK-MTV4YSO4SEMGG). The heading used to be a Turkish string embedded in the
 * component, so this file could hold the same string and both locales matched
 * it — `/en/…` rendered Turkish. Now that the board goes through `t()`, an
 * English page shows English, and a literal here would have to be one language
 * or the other. Taking the value from `messages/*.json` also means the
 * assertion follows a copy edit instead of going red on one: what this spec is
 * measuring is that the *module* rendered, not how its title is worded.
 */
const PIPELINE_HEADING = {
  en: enMessages.pipeline.heading,
  tr: trMessages.pipeline.heading,
} as const;

test.describe('module gate — the ModuleState switch decides, inside one plan', () => {
  test.beforeAll(setupModuleGateTenant);
  test.afterAll(teardownModuleGateTenant);

  test('a module page is never served without a session', async ({ page }) => {
    // The exact thing the old file could not see. `maxRedirects: 0` reads the
    // answer itself instead of following it to a page that looks fine.
    for (const [url, login] of [
      [PIPELINE_URL, '/en/login'],
      [EVIDENCE_URL, '/en/login'],
      [FIRSATLAR_URL, '/tr/giris'],
    ] as const) {
      const res = await page.request.get(url, { maxRedirects: 0 });
      expect(res.status(), `${url} must not serve a module page anonymously`).toBe(307);
      expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe(login);
    }

    // And following it lands on sign-in with nothing of the module on the page —
    // a redirect that leaked the board would still be a leak.
    await page.goto(PIPELINE_URL);
    await expect(page).toHaveURL(/\/en\/login/);
    for (const heading of Object.values(PIPELINE_HEADING)) {
      await expect(page.locator('body')).not.toContainText(heading);
    }
  });

  test('M5 is ON, so the pipeline board renders — and /firsatlar is the same module', async ({
    page,
  }) => {
    await signInAsModuleGateUser(page, PIPELINE_URL);

    const main = page.getByRole('main');
    await expect(main).toContainText(PIPELINE_HEADING.en);
    // Not the gate: an ON module inside the plan must show no refusal at all.
    await expect(main).not.toContainText('This module is not available');

    // `firsatlar/page.tsx` re-exports `PipelinePage`, so the alias is proven by the
    // alias route rendering the board — not by it returning some HTML.
    await page.goto(FIRSATLAR_URL);
    await expect(page.getByRole('main')).toContainText(PIPELINE_HEADING.tr);
    await expect(page).toHaveURL(new RegExp(`${MG_WORKSPACE}/firsatlar`));
  });

  test('M3 is OFF, so the Evidence Pack is refused — and the reason is the switch', async ({
    page,
  }) => {
    await signInAsModuleGateUser(page, PIPELINE_URL);
    await page.goto(EVIDENCE_URL);

    // The gate renders a role="alert" *section*, not a <main> — `main` is the
    // layout's. Located by element as well as role because Next.js's own route
    // announcer (`#__next-route-announcer__`) is a role="alert" div on every page.
    const gate = page.locator('section[role="alert"]');
    await expect(gate).toContainText('This module is not available');
    // `MODULE_OFF`, named by module — the tenant owns M3 on `basic`, so telling it
    // to upgrade would be a lie and `PLAN_UPGRADE_REQUIRED` would be the wrong copy.
    await expect(gate).toContainText('The Evidence Pack module is turned off for your workspace.');
    await expect(gate).not.toContainText('outside your subscription');

    // Nothing behind the gate rendered. The marker is the page's own body copy, not
    // the words "Evidence Pack": the refusal names the module on purpose, so a
    // `not.toContainText('Evidence Pack')` here would forbid correct output.
    await expect(page.locator('body')).not.toContainText(
      "Centralize your organization's core capabilities",
    );
  });
});
