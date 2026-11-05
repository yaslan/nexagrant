/**
 * FO-383 — the PIC field on Kurumsal Profil, with real clicks on an isolated database.
 *
 * `Tenant.pic` was read by the G0 scorer but no screen could write it, so an organisation with
 * CORDIS history could not earn its coordination and network points. The last test is the point
 * of the field: the score of the same opportunity moves, through the scorer as it stands.
 */
import { test, expect, type Page } from '@playwright/test';

import { prisma, withTenant } from '../../src/lib/db';
import { computeG0ForOpportunity } from '../../src/lib/scoring/g0-compute';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';
import {
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
    await expect(feedback(page).getByRole('alert')).toContainText('başka bir hesapta kayıtlı');
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
});
