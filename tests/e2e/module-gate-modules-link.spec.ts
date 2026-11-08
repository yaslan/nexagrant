import { test, expect } from '@playwright/test';

import enMessages from '../../messages/en.json';
import { prisma } from '../../src/lib/db';
import { signInAs } from './fixtures/session';
import {
  MG_EMAIL,
  MG_TENANT,
  MG_USER_ID,
  MG_WORKSPACE,
  setupModuleGateTenant,
  signInAsModuleGateUser,
  teardownModuleGateTenant,
} from './fixtures/module-gate-tenant';

/**
 * NG-65 — the lock on a switched-off module links to Settings → Modules.
 *
 * The fixture tenant has M3 (Evidence Pack) `OFF` and M5 `ON`, so `/evidence` is the
 * `MODULE_OFF` refusal this spec clicks through. The link is offered only to a role
 * the server says may open that screen; the other roles keep the admin sentence.
 */

const EVIDENCE_URL = `/en/${MG_WORKSPACE}/evidence`;
const OPEN_MODULES_LINK = enMessages.ModuleGate.openModules;
const ASK_ADMIN_LEAD = enMessages.ModuleGate.askAdmin.slice(0, enMessages.ModuleGate.askAdmin.indexOf('{brand}')).trim();

async function setRole(role: 'TENANT_OWNER' | 'TENANT_ADMIN' | 'MEMBER') {
  await prisma.membership.update({
    where: { tenantId_userId: { tenantId: MG_TENANT, userId: MG_USER_ID } },
    data: { role },
  });
}

test.describe('module gate — Settings → Modules link on a switched-off module', () => {
  test.beforeAll(setupModuleGateTenant);
  test.afterAll(async () => {
    await setRole('TENANT_OWNER');
    await teardownModuleGateTenant();
  });

  test('the owner clicks the lock link with the keyboard and lands on Settings → Modules', async ({
    page,
  }) => {
    await setRole('TENANT_OWNER');
    await signInAsModuleGateUser(page, EVIDENCE_URL);

    const gate = page.locator('section[role="alert"]');
    await expect(gate).toContainText('The Evidence Pack module is turned off for your workspace.');

    const link = gate.getByRole('link', { name: OPEN_MODULES_LINK });
    await expect(link).toHaveAttribute('href', `/en/default/settings/modules`);
    await expect(gate).not.toContainText(ASK_ADMIN_LEAD);
    await gate.screenshot({ path: 'test-results/ng65/owner-lock-en.png' });

    // Keyboard: the link is reachable by Tab from the page and activates with Enter.
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/en\/[^/]+\/settings\/modules$/);
    await expect(page.getByRole('main')).not.toContainText(enMessages.settings.modules.forbiddenTitle);
  });

  test('a TENANT_ADMIN and a MEMBER get no link, only the admin sentence', async ({ page }) => {
    for (const role of ['TENANT_ADMIN', 'MEMBER'] as const) {
      await setRole(role);
      await signInAs(page, {
        id: MG_USER_ID,
        sub: MG_USER_ID,
        email: MG_EMAIL,
        tenantId: MG_TENANT,
        role,
      });
      await page.goto(EVIDENCE_URL);

      const gate = page.locator('section[role="alert"]');
      await expect(gate).toContainText('The Evidence Pack module is turned off for your workspace.');
      await expect(gate.getByRole('link', { name: OPEN_MODULES_LINK })).toHaveCount(0);
      await expect(gate).toContainText(ASK_ADMIN_LEAD);
      await gate.screenshot({ path: `test-results/ng65/${role.toLowerCase()}-lock-en.png` });
    }
  });
});
