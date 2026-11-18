/**
 * FO-383 — the PIC field on Kurumsal Profil, with real clicks on an isolated database.
 *
 * `Tenant.pic` was read by the G0 scorer but no screen could write it, so an organisation with
 * CORDIS history could not earn its coordination and network points. The last test is the point
 * of the field: the score of the same opportunity moves, through the scorer as it stands.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';

import { prisma, withTenant } from '../../src/lib/db';
import { PIC_LOOKUPS_PER_HOUR } from '../../src/lib/pic';
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
  addPicProber,
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
    // FO-384 H4: the stored score follows the cleared PIC, on both records.
    const cleared = await g0Score();
    expect(await storedG0(PP_TENANT, PP_OPP_ID)).toEqual({ opportunity: cleared, topicMatch: cleared });

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
    // FO-384 H4: the stored score the board reads is the fresh one, not the value from before the save.
    expect(await storedG0(PP_TENANT, PP_OPP_ID)).toEqual({ opportunity: after, topicMatch: after });
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

  // ── FO-386: the same yes-or-no, asked in a loop ──────────────────────────────
  test('a user asking too often is stopped in both languages, and staff can see it', async ({ page }) => {
    test.setTimeout(180_000);
    const prober = await addPicProber();
    await openProfile(page, prober, `/tr/${PP_OTHER_WORKSPACE}/settings/profile`);

    for (let i = 0; i < PIC_LOOKUPS_PER_HOUR; i++) {
      await input(page).fill(PP_PIC_MATCHED);
      await save(page);
      await expect(feedback(page).getByRole('alert')).toContainText('başka bir hesapta kayıtlı');
      await input(page).fill('');
    }

    await input(page).fill(PP_PIC_MATCHED);
    await save(page);
    const limited = feedback(page).getByRole('alert');
    await expect(limited).toContainText('çok fazla PIC denemesi');
    await expect(limited).toContainText(/\d+ dakika sonra/);
    await expect(limited).not.toContainText('başka bir hesapta');
    await expect(input(page)).toBeFocused();
    expect(await storedPic(PP_OTHER_TENANT)).not.toBe(PP_PIC_MATCHED);

    // Reloaded, so the count is the server's and not the form's.
    await page.goto(`/en/${PP_OTHER_WORKSPACE}/settings/profile`);
    await expectHydrated(input(page));
    await input(page).fill(PP_PIC_MATCHED);
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await expect(feedback(page).getByRole('alert')).toContainText('Too many PIC attempts');

    // The raw rows: one per refused question, one for the limit, however often it was hit.
    const rows = (await picAuditRows(PP_OTHER_TENANT, 'tenant.pic.refused')).filter((r) => r.actorId === prober.id);
    console.log(`[FO-386] refused rows for the prober: ${rows.length}, last=${JSON.stringify(rows.at(-1))}`);
    expect(rows.filter((r) => (r.data as { reason?: string }).reason === 'picTaken')).toHaveLength(PIC_LOOKUPS_PER_HOUR);
    expect(rows.filter((r) => (r.data as { reason?: string }).reason === 'rateLimited')).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(PP_TENANT);

    // Staff read it on the tenant that asked; the list of real PIC changes is not pushed out by it.
    await signInAs(page, { id: PP_ADMIN.id, email: PP_ADMIN.email, tenantId: PP_ADMIN.tenantId, role: 'TENANT_OWNER', isPlatformAdmin: true });
    await page.goto(`/tr/admin/tenants/${PP_OTHER_TENANT}`);
    const refusals = page.getByTestId('tenant-pic-refusals');
    await expect(refusals).toContainText(`Sınır aşıldı: ${PP_PIC_MATCHED}`);
    await expect(refusals).toContainText(`Başka hesapta kayıtlı: ${PP_PIC_MATCHED}`);
    await expect(page.getByTestId('tenant-pic-history')).not.toContainText(`Başka hesapta kayıtlı`);
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

      // G0: a new computation drops, and the stored score follows it (FO-384: the removal rescores
      // the tenant's opportunities after the PIC write has committed).
      const fresh = await g0Score();
      const stored = await storedG0(PP_TENANT, PP_OPP_ID);
      console.log(`[FO-384] G0 after removal: withPic=${withPic} fresh=${fresh} stored=${JSON.stringify(stored)}`);
      expect(fresh).toBeLessThan(withPic ?? Number.NEGATIVE_INFINITY);
      expect(stored).toEqual({ opportunity: fresh, topicMatch: fresh });

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

  // ── FO-383 B1: a form left open must not rewrite a PIC nobody touched in it ──
  test.describe('a form left open', () => {
    // Listed in CORDIS with no holder, so a stale save would meet the confirmation panel.
    const PIC_IN_CORDIS = '987654331';
    const keywordsInput = (page: Page) => page.locator('input[name="keywords"]');

    const storedKeywords = async () =>
      (await withTenant(PP_TENANT, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: PP_TENANT }, select: { keywords: true } })))?.keywords;

    const setPic = (pic: string | null) => prisma.tenant.update({ where: { id: PP_TENANT }, data: { pic } });

    /** Another session in its own browser context, which the open form knows nothing about. */
    async function inAnotherSession<T>(browser: Browser, user: TestUser, work: (page: Page) => Promise<T>): Promise<T> {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signInAs(page, { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role as 'TENANT_OWNER' });
        return await work(page);
      } finally {
        await context.close();
      }
    }

    const staffRemovesPic = (browser: Browser) =>
      inAnotherSession(browser, PP_ADMIN, async (admin) => {
        await admin.goto(ADMIN_URL);
        await expectHydrated(admin.getByTestId('tenant-pic-remove'));
        await admin.getByTestId('tenant-pic-remove').click();
        await admin.getByTestId('tenant-pic-remove-note').fill('owner disputed');
        await admin.getByTestId('tenant-pic-remove-confirm').click();
        await expect(admin.getByTestId('tenant-pic-none')).toBeVisible();
      });

    async function saveKeywordsOnly(page: Page, keywords: string) {
      await keywordsInput(page).fill(keywords);
      await save(page);
      await expect(page.getByText('başarıyla güncellendi')).toBeVisible();
      expect(await storedKeywords()).toEqual([keywords]);
    }

    for (const [label, pic] of [
      ['without a CORDIS record', PP_PIC_UNMATCHED],
      ['with a CORDIS record', PIC_IN_CORDIS],
    ] as const) {
      test(`A: a PIC ${label} that staff removed does not come back when the tenant saves its keywords`, async ({ page, browser }) => {
        await setPic(pic);
        await openProfile(page, PP_OWNER);
        await expect(input(page)).toHaveValue(pic);

        await staffRemovesPic(browser);
        expect(await storedPic(PP_TENANT)).toBeNull();
        const updatesBefore = (await picAuditRows(PP_TENANT)).length;
        const removalsBefore = (await picAuditRows(PP_TENANT, 'tenant.pic.removed')).length;

        await saveKeywordsOnly(page, `stale form a ${pic}`);

        await expect(page.getByTestId('tenant-pic-confirm')).toHaveCount(0);
        expect(await storedPic(PP_TENANT)).toBeNull();
        expect(await picAuditRows(PP_TENANT)).toHaveLength(updatesBefore);
        expect(await picAuditRows(PP_TENANT, 'tenant.pic.removed')).toHaveLength(removalsBefore);
        // The open form catches up with the row instead of still offering the removed code.
        await expect(input(page)).toHaveValue('');
      });
    }

    test('B: a PIC a colleague saved is not wiped by a form opened before it', async ({ page, browser }) => {
      await setPic(null);
      await openProfile(page, PP_OWNER);
      await expect(input(page)).toHaveValue('');

      await inAnotherSession(browser, PP_OWNER, async (colleague) => {
        await colleague.goto(PROFILE_URL);
        await expectHydrated(input(colleague));
        await input(colleague).fill(PP_PIC_UNMATCHED);
        await save(colleague);
        await expect(feedback(colleague)).toContainText("CORDIS'te bu koda ait kayıt bulamadık");
      });
      expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);
      const updatesBefore = (await picAuditRows(PP_TENANT)).length;

      await saveKeywordsOnly(page, 'stale form b');

      await expect(feedback(page)).not.toContainText('PIC kaldırıldı');
      expect(await storedPic(PP_TENANT)).toBe(PP_PIC_UNMATCHED);
      expect(await picAuditRows(PP_TENANT)).toHaveLength(updatesBefore);
      await expect(input(page)).toHaveValue(PP_PIC_UNMATCHED);
    });

    test('a PIC saved in this form counts as unchanged from then on', async ({ page, browser }) => {
      await setPic(null);
      await openProfile(page, PP_OWNER);
      await input(page).fill(PP_PIC_UNMATCHED);
      await save(page);
      await expect(feedback(page)).toContainText("CORDIS'te bu koda ait kayıt bulamadık");

      await staffRemovesPic(browser);
      await saveKeywordsOnly(page, 'saved in this form');

      expect(await storedPic(PP_TENANT)).toBeNull();
    });

    test('a change the user does make still goes through', async ({ page }) => {
      await setPic(PP_PIC_UNMATCHED);
      await openProfile(page, PP_OWNER);
      await input(page).fill('');
      await save(page);
      await expect(feedback(page)).toContainText('PIC kaldırıldı');
      expect(await storedPic(PP_TENANT)).toBeNull();
    });

    // NG-229. The banner hides itself four seconds after a save. The timer of the first save used
    // to stay armed, so a second save inside those four seconds had its banner taken down early.
    test('NG-229: the banner of a second save is not taken down by the timer of the first', async ({ page }) => {
      await setPic(null);
      await openProfile(page, PP_OWNER);
      await saveKeywordsOnly(page, 'banner first save');

      // Inside the first banner's four seconds; the waits below are the scenario, not a budget.
      await page.waitForTimeout(3_000);
      await saveKeywordsOnly(page, 'banner second save');

      // Past the first save's four seconds, well inside the second's.
      await page.waitForTimeout(1_500);
      await expect(page.getByText('başarıyla güncellendi')).toBeVisible();
    });

    test('B6: an old-format PIC does not block a save that leaves it alone, and is refused once edited', async ({ page }) => {
      await setPic('12345');
      await openProfile(page, PP_OWNER);
      await expect(input(page)).toHaveValue('12345');

      await saveKeywordsOnly(page, 'old format pic');
      await expect(feedback(page).getByRole('alert')).toHaveCount(0);
      expect(await storedPic(PP_TENANT)).toBe('12345');

      await input(page).fill('123456');
      await save(page);
      await expect(feedback(page).getByRole('alert')).toContainText('9 rakam');
      expect(await storedPic(PP_TENANT)).toBe('12345');
      await setPic(null);
    });
  });
});
