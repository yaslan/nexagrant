import { test, expect, type Page } from '@playwright/test';
import type { Role } from '@prisma/client';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { signInAs } from './fixtures/session';
import {
  RN_SEATS,
  RN_TENANT,
  RN_WORKSPACE,
  setRoleNavModule,
  setupRoleNavTenant,
  teardownRoleNavTenant,
} from './fixtures/role-nav-tenant';

/**
 * NG-4 — the app shell's menu per role and per module switch, read from a real
 * session on the real layout. `spec-role-mapping.ts`: Admin = TENANT_OWNER and
 * TENANT_ADMIN, Koordinatör = PIPELINE_MANAGER, Ortak = GUEST_PARTNER; WRITER and
 * MEMBER are outside the specification. Uzman and Denetçi have no code role.
 */

const MODULE_ENTRIES = ['pipeline', 'partners', 'partnerResources', 'conceptNotes', 'evidence', 'relationships', 'approvals', 'apiKeys'];

async function signIn(page: Page, role: Role) {
  const seat = RN_SEATS[role];
  await signInAs(page, { id: seat.id, email: seat.email, tenantId: RN_TENANT, role });
}

/** The calls page: no role gate, so it is the one screen every role stays on. */
async function menuOf(page: Page, role: Role): Promise<(string | null)[]> {
  await signIn(page, role);
  await page.goto(`/tr/${RN_WORKSPACE}/cagrilar`);
  const nav = page.locator('aside nav');
  await expect(nav).toBeVisible();
  const entries = nav.locator('[data-testid^="sidebar-nav-"]:not([data-testid$="-preview"])');
  return (await entries.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid'))))
    .map((id) => id?.replace('sidebar-nav-', '') ?? null);
}

test.describe.serial('NG-4 role and module menu', () => {
  test.beforeAll(setupRoleNavTenant);
  test.afterAll(teardownRoleNavTenant);

  test('each code role gets the menu of its permissions', async ({ page }) => {
    expect(await menuOf(page, 'TENANT_OWNER')).toEqual(['dashboard', 'calls', ...MODULE_ENTRIES.slice(0, 6), 'approvals', 'apiKeys', 'members', 'settings']);
    expect(await menuOf(page, 'TENANT_ADMIN')).toEqual(['dashboard', 'calls', ...MODULE_ENTRIES.slice(0, 6), 'approvals', 'apiKeys', 'members', 'settings']);
    expect(await menuOf(page, 'PIPELINE_MANAGER')).toEqual(['dashboard', 'calls', ...MODULE_ENTRIES, 'settings']);
    expect(await menuOf(page, 'WRITER')).toEqual(['calls', ...MODULE_ENTRIES, 'settings']);
    expect(await menuOf(page, 'MEMBER')).toEqual(['calls', ...MODULE_ENTRIES, 'settings']);
    expect(await menuOf(page, 'GUEST_PARTNER')).toEqual(['calls', 'settings']);
  });

  test('the user menu follows the sidebar: API keys for a member, not for a guest', async ({ page }) => {
    for (const [role, count] of [['MEMBER', 1], ['GUEST_PARTNER', 0]] as const) {
      await signIn(page, role);
      await page.goto(`/tr/${RN_WORKSPACE}/cagrilar`);
      await page.getByRole('button', { name: new RegExp(`NG-4 ${role}`) }).click();
      await expect(page.getByRole('link', { name: 'API Anahtarları & Entegrasyonlar' })).toHaveCount(count);
    }
  });

  test('the mobile drawer draws the same role menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'GUEST_PARTNER');
    await page.goto(`/tr/${RN_WORKSPACE}/cagrilar`);
    await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    const drawer = page.locator('nav:visible');
    await expect(drawer.getByTestId('sidebar-nav-settings')).toBeVisible();
    await expect(drawer.getByTestId('sidebar-nav-pipeline')).toHaveCount(0);
    await expect(drawer.getByTestId('sidebar-nav-dashboard')).toHaveCount(0);
  });

  test('OFF and DEV stay out, PILOT is badged for managers only, ON is plain', async ({ page }) => {
    expect(await menuOf(page, 'TENANT_OWNER')).not.toContain('tto');

    await setRoleNavModule('M7', 'DEV');
    expect(await menuOf(page, 'TENANT_OWNER')).not.toContain('tto');

    await setRoleNavModule('M7', 'PILOT');
    expect(await menuOf(page, 'PIPELINE_MANAGER')).toContain('tto');
    await expect(page.getByTestId('sidebar-nav-tto-preview')).toHaveText(trMessages.Navigation.preview.PILOT);
    expect(await menuOf(page, 'MEMBER')).not.toContain('tto');

    await setRoleNavModule('M7', 'ON');
    expect(await menuOf(page, 'MEMBER')).toContain('tto');
    await expect(page.getByTestId('sidebar-nav-tto-preview')).toHaveCount(0);

    await setRoleNavModule('M7', 'OFF');
  });

  test('M5 off: the lock is in the language of the page, the module name too', async ({ page }) => {
    await setRoleNavModule('M5', 'OFF');
    await signIn(page, 'MEMBER');
    for (const [url, m] of [
      [`/tr/${RN_WORKSPACE}/firsatlar`, trMessages],
      [`/en/${RN_WORKSPACE}/pipeline`, enMessages],
    ] as const) {
      await page.goto(url);
      const gate = page.getByRole('main').getByRole('alert');
      await expect(gate).toContainText(m.ModuleGate.title);
      await expect(gate).toContainText(m.ModuleGate.reason.MODULE_OFF.replace('{module}', m.modules.workflows.name));
      await expect(gate).toContainText(m.ModuleGate.askAdmin.split('{brand}')[0]!.trim());
    }
    await setRoleNavModule('M5', 'ON');
  });

  test('a page the role may not open answers with its existing refusal or landing', async ({ page }) => {
    await signIn(page, 'MEMBER');
    await page.goto(`/tr/${RN_WORKSPACE}/ayarlar/moduller`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(trMessages.settings.modules.forbiddenTitle);

    await page.goto(`/tr/${RN_WORKSPACE}/panel`);
    await page.waitForURL(`**/tr/${RN_WORKSPACE}/firsatlar`);

    await signIn(page, 'GUEST_PARTNER');
    await page.goto(`/tr/${RN_WORKSPACE}/panel`);
    await page.waitForURL(`**/tr/${RN_WORKSPACE}/bildirimler`);
  });
});
