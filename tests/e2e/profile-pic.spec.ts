/**
 * FO-383 — the PIC field on Kurumsal Profil, with real clicks on an isolated database.
 *
 * `Tenant.pic` was read by the G0 scorer but no screen could write it, so an organisation with
 * CORDIS history could not earn its coordination and network points. The last test is the point
 * of the field: the score of the same opportunity moves, through the scorer as it stands.
 */
import { test, expect, type Page } from '@playwright/test';

import { prisma, withTenant } from '../../src/lib/db';
import { computeG0ForOpportunity, rescoreOpportunityG0 } from '../../src/lib/scoring/g0-compute';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';
import {
  PP_ADMIN,
  PP_MEMBER,
  PP_OPP_ID,
  PP_ORG_NAME,
  PP_OTHER_OWNER,
  PP_OTHER_TENANT,
  PP_OTHER_WORKSPACE,
  PP_OWNER,
  PP_PIC_MATCHED,
  PP_PIC_UNMATCHED,
  PP_TENANT,
  PP_WORKSPACE,
  picAuditRows,
  setupProfilePic,
  storedG0,
  storedPic,
  teardownProfilePic,
} from './fixtures/profile-pic-tenant';

const PROFILE_URL = `/tr/${PP_WORKSPACE}/settings/profile`;

type TestUser = typeof PP_OWNER;

async function openProfile(page: Page, user: TestUser, url = PROFILE_URL) {
  await signInAs(page, { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role as 'TENANT_OWNER' });
  await page.goto(url);
  await expectHydrated(page.getByTestId('tenant-pic-input'));
}

const input = (page: Page) => page.getByTestId('tenant-pic-input');
const feedback = (page: Page) => page.getByTestId('tenant-pic-feedback');
const save = (page: Page) => page.getByRole('button', { name: 'Profili Kaydet' }).click();

async function g0Score(): Promise<number | null> {
  const computation = await withTenant(PP_TENANT, (tx) => computeG0ForOpportunity(tx, PP_TENANT, PP_OPP_ID));
  return computation?.score ?? null;
}

test.describe('FO-383 — PIC on Kurumsal Profil', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(setupProfilePic);
  test.afterAll(async () => {
    await teardownProfilePic();
    await prisma.$disconnect();
  });

  test('a malformed PIC is refused and nothing is stored', async ({ page }) => {
    await openProfile(page, PP_OWNER);
    await input(page).fill('12345');
    await save(page);
    await expect(feedback(page).getByRole('alert')).toContainText('9 rakam');
    await expect(input(page)).toBeFocused();
    expect(await storedPic(PP_TENANT)).toBeNull();
  });

  test('a member cannot save a PIC', async ({ page }) => {
    await openProfile(page, PP_MEMBER);
    await input(page).fill(PP_PIC_MATCHED);
    await save(page);
    await expect(page.getByText('Bu işlem için yetkiniz yok')).toBeVisible();
    await expect(page.getByTestId('tenant-pic-confirm')).toHaveCount(0);
    expect(await storedPic(PP_TENANT)).toBeNull();
  });

  test('a PIC without a CORDIS record is saved and the form says what that means', async ({ page }) => {
    await openProfile(page, PP_OWNER);
    await input(page).fill(PP_PIC_UNMATCHED);
    await save(page);
    await expect(feedback(page)).toContainText("CORDIS'te bu koda ait kayıt bulamadık");
    await expect(page.getByTestId('tenant-pic-confirm')).toHaveCount(0);
    expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);

    await page.reload();
    await expectHydrated(input(page));
    await expect(input(page)).toHaveValue(PP_PIC_UNMATCHED);
    await expect(feedback(page)).toContainText("CORDIS'te bu koda ait kayıt bulamadık");
  });

  test('clearing the field removes the PIC', async ({ page }) => {
    await openProfile(page, PP_OWNER);
    await expect(input(page)).toHaveValue(PP_PIC_UNMATCHED);
    await input(page).fill('');
    await save(page);
    await expect(feedback(page)).toContainText('PIC kaldırıldı');
    expect(await storedPic(PP_TENANT)).toBeNull();

    await page.reload();
    await expectHydrated(input(page));
    await expect(input(page)).toHaveValue('');
  });

  test('a CORDIS match is shown and needs a yes; the G0 score of the same opportunity then rises', async ({ page }) => {
    const before = await g0Score();
    expect(before).not.toBeNull();

    await openProfile(page, PP_OWNER);
    // Pasted with the spaces a PDF brings.
    await input(page).fill(`${PP_PIC_MATCHED.slice(0, 3)} ${PP_PIC_MATCHED.slice(3, 6)} ${PP_PIC_MATCHED.slice(6)}`);
    await save(page);

    const confirm = page.getByTestId('tenant-pic-confirm');
    await expect(confirm).toContainText(PP_ORG_NAME);
    await expect(confirm).toContainText('Ankara, TR');
    await expect(confirm).toBeFocused();
    expect(await storedPic(PP_TENANT)).toBeNull();

    // "No" stores nothing and returns to the field.
    await page.getByTestId('tenant-pic-confirm-no').click();
    await expect(confirm).toHaveCount(0);
    await expect(input(page)).toBeFocused();
    expect(await storedPic(PP_TENANT)).toBeNull();

    await save(page);
    await page.getByTestId('tenant-pic-confirm-yes').click();
    await expect(feedback(page)).toContainText(`CORDIS kaydı: ${PP_ORG_NAME}`);
    await expect(page.getByText('başarıyla güncellendi')).toBeVisible();
    await expect(page.getByText('yeniden hesaplandı')).toHaveCount(0);
    expect(await storedPic(PP_TENANT)).toBe(PP_PIC_MATCHED);

    await page.reload();
    await expectHydrated(input(page));
    await expect(input(page)).toHaveValue(PP_PIC_MATCHED);
    await expect(feedback(page)).toContainText(`CORDIS kaydı: ${PP_ORG_NAME}`);

    const audit = await picAuditRows(PP_TENANT);
    expect(audit.at(-1)).toEqual({
      actorId: PP_OWNER.id,
      data: { from: null, to: PP_PIC_MATCHED, cordisName: PP_ORG_NAME },
    });

    const after = await g0Score();
    console.log(`[FO-383] G0 same opportunity: before=${before} after=${after}`);
    expect(after).toBeGreaterThan(before ?? Number.POSITIVE_INFINITY);
  });

  test('the same PIC is refused on a second tenant', async ({ page }) => {
    await openProfile(page, PP_OTHER_OWNER, `/tr/${PP_OTHER_WORKSPACE}/settings/profile`);
    await input(page).fill(PP_PIC_MATCHED);
    await save(page);
    const refusal = feedback(page).getByRole('alert');
    await expect(refusal).toContainText('başka bir hesapta kayıtlı');
    // The way back for the real owner, and nothing about who holds it.
    await expect(refusal.getByRole('link', { name: 'info@nexagrant.com' })).toHaveAttribute('href', 'mailto:info@nexagrant.com');
    await expect(refusal).not.toContainText(PP_TENANT);
    await expect(page.getByTestId('tenant-pic-confirm')).toHaveCount(0);
    await expect(page.getByText(PP_ORG_NAME)).toHaveCount(0);
    expect(await storedPic(PP_OTHER_TENANT)).toBeNull();
    expect(await storedPic(PP_TENANT)).toBe(PP_PIC_MATCHED);
  });

  test('the English screen speaks English', async ({ page }) => {
    await openProfile(page, PP_OWNER, `/en/${PP_WORKSPACE}/settings/profile`);
    await expect(page.getByText('PIC (Participant Identification Code)')).toBeVisible();
    await expect(feedback(page)).toContainText(`CORDIS record: ${PP_ORG_NAME}`);
    await expect(page.getByRole('link', { name: 'Participant Register' })).toHaveAttribute('href', /participant-register/);
  });

  test('the second tenant sees the way to support in English too', async ({ page }) => {
    await openProfile(page, PP_OTHER_OWNER, `/en/${PP_OTHER_WORKSPACE}/settings/profile`);
    await input(page).fill(PP_PIC_MATCHED);
    await page.getByRole('button', { name: 'Save Profile' }).click();
    const refusal = feedback(page).getByRole('alert');
    await expect(refusal).toContainText('registered on another account');
    await expect(refusal.getByRole('link', { name: 'info@nexagrant.com' })).toHaveAttribute('href', 'mailto:info@nexagrant.com');
  });

  // ── K-576942: staff take a disputed PIC off a tenant ─────────────────────────
  const ADMIN_URL = `/tr/admin/tenants/${PP_TENANT}`;

  test.describe('removing a PIC from the admin console', () => {
    for (const user of [PP_OWNER, PP_MEMBER]) {
      test(`${user.role} cannot reach it, and the PIC stays`, async ({ page }) => {
        await signInAs(page, { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role as 'TENANT_OWNER' });
        await page.goto(ADMIN_URL);
        await expect(page.getByTestId('tenant-pic-remove')).toHaveCount(0);
        await expect(page.getByTestId('tenant-pic-panel')).toHaveCount(0);
        expect(await storedPic(PP_TENANT)).toBe(PP_PIC_MATCHED);
      });
    }

    test('cancelling removes nothing and the note is required', async ({ page }) => {
      await signInAs(page, PP_ADMIN);
      await page.goto(ADMIN_URL);
      await expectHydrated(page.getByTestId('tenant-pic-remove'));
      await expect(page.getByTestId('tenant-pic-value')).toHaveText(PP_PIC_MATCHED);
      await expect(page.getByTestId('tenant-pic-panel')).toContainText(PP_ORG_NAME);

      await page.getByTestId('tenant-pic-remove').click();
      const dialog = page.getByTestId('tenant-pic-remove-dialog');
      await expect(dialog).toContainText(PP_PIC_MATCHED);
      await expect(page.getByTestId('tenant-pic-remove-note')).toBeFocused();
      await expect(page.getByTestId('tenant-pic-remove-confirm')).toBeDisabled();

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('tenant-pic-remove')).toBeFocused();

      await page.getByTestId('tenant-pic-remove').click();
      await page.getByTestId('tenant-pic-remove-cancel').click();
      await expect(dialog).toHaveCount(0);
      expect(await storedPic(PP_TENANT)).toBe(PP_PIC_MATCHED);
      expect(await picAuditRows(PP_TENANT, 'tenant.pic.removed')).toHaveLength(0);
    });

    test('a value that changed under the open page is not removed', async ({ page }) => {
      await signInAs(page, PP_ADMIN);
      await page.goto(ADMIN_URL);
      await expectHydrated(page.getByTestId('tenant-pic-remove'));
      await page.getByTestId('tenant-pic-remove').click();
      await page.getByTestId('tenant-pic-remove-note').fill('stale page');

      await prisma.tenant.update({ where: { id: PP_TENANT }, data: { pic: PP_PIC_UNMATCHED } });
      await page.getByTestId('tenant-pic-remove-confirm').click();

      await expect(page.getByTestId('tenant-pic-notice')).toContainText('bu arada değişti');
      await expect(page.getByTestId('tenant-pic-value')).toHaveText(PP_PIC_UNMATCHED);
      expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);
      expect(await picAuditRows(PP_TENANT, 'tenant.pic.removed')).toHaveLength(0);

      await prisma.tenant.update({ where: { id: PP_TENANT }, data: { pic: PP_PIC_MATCHED } });
    });

    test('admin removes it: the record drops, the audit row is written, another account can claim it, G0 is measured', async ({ page }) => {
      // The stored score is what the board shows. Store it while the PIC still counts.
      const rescored = await rescoreOpportunityG0(PP_TENANT, PP_OPP_ID);
      const withPic = rescored?.score ?? null;
      expect(withPic).not.toBeNull();
      expect(await storedG0(PP_TENANT, PP_OPP_ID)).toEqual({ opportunity: withPic, topicMatch: withPic });

      await signInAs(page, PP_ADMIN);
      await page.goto(ADMIN_URL);
      await expectHydrated(page.getByTestId('tenant-pic-remove'));
      await page.getByTestId('tenant-pic-remove').click();
      await page.getByTestId('tenant-pic-remove-note').fill('Gerçek sahip destek talebiyle itiraz etti');
      await page.getByTestId('tenant-pic-remove-confirm').click();

      await expect(page.getByTestId('tenant-pic-notice')).toContainText('PIC kaldırıldı');
      await expect(page.getByTestId('tenant-pic-none')).toBeVisible();
      await expect(page.getByTestId('tenant-pic-notice')).toBeFocused();
      await expect(page.getByTestId('tenant-pic-history')).toContainText(`Yönetici kaldırdı: ${PP_PIC_MATCHED}`);
      await expect(page.getByTestId('tenant-pic-history')).toContainText(PP_ADMIN.email);

      expect(await storedPic(PP_TENANT)).toBeNull();
      expect(await picAuditRows(PP_TENANT, 'tenant.pic.removed')).toEqual([
        { actorId: PP_ADMIN.id, data: { from: PP_PIC_MATCHED, note: 'Gerçek sahip destek talebiyle itiraz etti' } },
      ]);

      // G0: a new computation drops at once; what is stored stays until something rescores.
      const fresh = await g0Score();
      const stored = await storedG0(PP_TENANT, PP_OPP_ID);
      console.log(`[FO-383] G0 after removal: withPic=${withPic} fresh=${fresh} stored=${JSON.stringify(stored)}`);
      expect(fresh).toBeLessThan(withPic ?? Number.NEGATIVE_INFINITY);
      expect(stored).toEqual({ opportunity: withPic, topicMatch: withPic });

      // The real owner, on the other account, can now take it.
      await openProfile(page, PP_OTHER_OWNER, `/tr/${PP_OTHER_WORKSPACE}/settings/profile`);
      await input(page).fill(PP_PIC_MATCHED);
      await save(page);
      await expect(page.getByTestId('tenant-pic-confirm')).toContainText(PP_ORG_NAME);
      await page.getByTestId('tenant-pic-confirm-yes').click();
      await expect(feedback(page)).toContainText(`CORDIS kaydı: ${PP_ORG_NAME}`);
      expect(await storedPic(PP_OTHER_TENANT)).toBe(PP_PIC_MATCHED);
    });
  });
});
