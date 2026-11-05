import { test, expect, type Page } from '@playwright/test';
import type { Role } from '@prisma/client';

import trMessages from '../../messages/tr.json';
import { signInAs } from './fixtures/session';
import {
  RG_OPP_ID,
  RG_OPP_TITLE,
  RG_REL_ID,
  RG_REL_NAME,
  RG_SEATS,
  RG_TENANT,
  RG_WORKSPACE,
  setupRoleGateTenant,
  teardownRoleGateTenant,
} from './fixtures/role-gate-tenant';

/**
 * NG-64 — a page the menu hides for a role is closed to that role on the server
 * too. Each role signs in with a real session (the role is read back from its
 * membership row) and types the URL. A refused role gets the 403 screen and none
 * of the tenant's seeded text; an allowed one gets the page with it.
 */

const FORBIDDEN_TITLE = trMessages.Forbidden.title;
const ws = `/tr/${RG_WORKSPACE}`;

/** Every page the card names, plus the opportunity pages behind `view_proposal`. */
const GUEST_CLOSED = [
  `${ws}/firsatlar`,
  `${ws}/pipeline/${RG_OPP_ID}`,
  `${ws}/pipeline/${RG_OPP_ID}/consortium`,
  `${ws}/opportunities/${RG_OPP_ID}/m2`,
  `${ws}/opportunities/${RG_OPP_ID}/matching`,
  `${ws}/opportunities/${RG_OPP_ID}/briefs`,
  `${ws}/opportunities/${RG_OPP_ID}/documents`,
  `${ws}/opportunities/${RG_OPP_ID}/application`,
  `${ws}/ortaklar`,
  `${ws}/ortaklar?tab=live`,
  `${ws}/ortaklar/kaynaklar`,
  `${ws}/konsept-notlar`,
  `${ws}/iliskiler`,
  `${ws}/relationships/${RG_REL_ID}`,
  `${ws}/tto-hizlandirici`,
  `${ws}/onay-merkezi`,
  `${ws}/ayarlar/uyeler`,
  `${ws}/ayarlar/api-anahtarlari`,
];

async function signIn(page: Page, role: Role) {
  const seat = RG_SEATS[role];
  await signInAs(page, { id: seat.id, email: seat.email, tenantId: RG_TENANT, role });
}

async function expectClosed(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(403);
  await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), path).toBeVisible();
  const html = await page.content();
  expect(html, path).not.toContain(RG_OPP_TITLE);
  expect(html, path).not.toContain(RG_REL_NAME);
}

async function expectOpen(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await expect(page.getByRole('heading', { name: FORBIDDEN_TITLE }), path).toHaveCount(0);
}

test.describe.serial('NG-64 page role gates', () => {
  test.beforeAll(setupRoleGateTenant);
  test.afterAll(teardownRoleGateTenant);

  test('GUEST_PARTNER gets 403 and no tenant data on every gated path', async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, 'GUEST_PARTNER');
    for (const path of GUEST_CLOSED) await expectClosed(page, path);
  });

  test('GUEST_PARTNER cannot pull the data through the downloads either', async ({ page }) => {
    await signIn(page, 'GUEST_PARTNER');
    const note = await page.request.get('/api/concept-notes/ng64-none/export');
    expect(note.status()).toBe(403);
    expect(await note.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
    const doc = await page.request.get('/api/documents/export?partId=ng64-none');
    expect(doc.status()).toBe(403);
  });

  test('GUEST_PARTNER keeps the pages that have no tenant read behind a role', async ({ page }) => {
    await signIn(page, 'GUEST_PARTNER');
    await expectOpen(page, `${ws}/cagrilar`);
    await expectOpen(page, `${ws}/ayarlar/profil`);
  });

  test('MEMBER reads the opportunity and relationship, keeps API keys, is refused members', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, 'MEMBER');
    await expectOpen(page, `${ws}/firsatlar`);
    await expect(page.getByText(RG_OPP_TITLE).first()).toBeVisible();
    await expectOpen(page, `${ws}/pipeline/${RG_OPP_ID}`);
    await expect(page.getByText(RG_OPP_TITLE).first()).toBeVisible();
    await expectOpen(page, `${ws}/iliskiler`);
    await expect(page.getByText(RG_REL_NAME).first()).toBeVisible();
    await expectOpen(page, `${ws}/ortaklar/kaynaklar`);
    await expectOpen(page, `${ws}/onay-merkezi`);
    await expectOpen(page, `${ws}/ayarlar/api-anahtarlari`);
    await expectClosed(page, `${ws}/ayarlar/uyeler`);
  });

  test('WRITER keeps API keys and is refused members', async ({ page }) => {
    await signIn(page, 'WRITER');
    await expectOpen(page, `${ws}/ayarlar/api-anahtarlari`);
    await expectClosed(page, `${ws}/ayarlar/uyeler`);
  });

  test('members page opens for the two roles holding manage_users', async ({ page }) => {
    for (const role of ['TENANT_OWNER', 'TENANT_ADMIN'] as const) {
      await signIn(page, role);
      await expectOpen(page, `${ws}/ayarlar/uyeler`);
    }
    await signIn(page, 'PIPELINE_MANAGER');
    await expectClosed(page, `${ws}/ayarlar/uyeler`);
  });

  test('inviting stays owner/admin only: MEMBER, WRITER and GUEST_PARTNER get 403', async ({ page }) => {
    for (const role of ['MEMBER', 'WRITER', 'GUEST_PARTNER'] as const) {
      await signIn(page, role);
      const res = await page.request.post('/api/invitations', {
        data: { email: `ng64-${role.toLowerCase()}@invite.e2e.fabrika.test`, role: 'MEMBER' },
      });
      expect(res.status(), role).toBe(403);
    }
  });
});
