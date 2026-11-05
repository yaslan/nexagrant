/**
 * TASK-MUPUHIIKSQAPN / TASK-MUPVLWSIPC5WU — Y-4 regression test: Kurumsal Profil
 * kaydı sunucuya gidiyor ve sayfa yenilendikten sonra değer kalıcı oluyor.
 *
 * Before: Form "başarıyla güncellendi" gösteriyordu ama 0 POST gidiyordu ve veri
 * kayboluyordu. Sonra kayıt sunucuya gitti ama sayfa her yüklemede sabit metinle
 * açıldığı için yenilemeden sonra kaydedilen değer yine görünmüyordu.
 * After: Kayıt veritabanına yazılır; sayfa kayıtlı profili sunucuda, oturumun
 * kendi kiracısından okur.
 */
import { test, expect, type Page } from '@playwright/test';

import { expectHydrated } from './fixtures/hydration';
import {
  PS_OTHER_CAPABILITIES,
  PS_WORKSPACE,
  readStoredProfile,
  setupProfileSaveTenant,
  signInAsProfileSaveUser,
  teardownProfileSaveTenant,
} from './fixtures/profile-save-tenant';

const PROFILE_URL = `/tr/${PS_WORKSPACE}/settings/profile`;

function profileForm(page: Page) {
  const saveButton = page.getByRole('button', { name: 'Profili Kaydet' });
  const form = page.locator('form').filter({ has: saveButton });
  return {
    saveButton,
    capabilities: form.locator('textarea'),
    keywords: form.locator('input[name="keywords"]'),
    trlMin: form.locator('input[type="number"]').nth(0),
    trlMax: form.locator('input[type="number"]').nth(1),
  };
}

test.describe('Y-4 — Kurumsal Profil kaydı sunucuya gidiyor', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(setupProfileSaveTenant);
  test.afterAll(teardownProfileSaveTenant);

  test('should send profile update to server and persist after reload', async ({ page }) => {
    await signInAsProfileSaveUser(page, PROFILE_URL);
    const f = profileForm(page);
    await expectHydrated(f.saveButton);
    await expect(f.capabilities).not.toHaveValue(PS_OTHER_CAPABILITIES);

    const capabilities = `Yapay zeka, derin öğrenme, TRL 5-8 prototipleme — ${Date.now()}`;
    const keywords = 'AI, Deep Learning, Robotics';
    await f.capabilities.fill(capabilities);
    await f.keywords.fill(keywords);
    await f.trlMin.fill('5');
    await f.trlMax.fill('8');
    await f.saveButton.click();
    await expect(page.getByText('başarıyla güncellendi')).toBeVisible({ timeout: 10_000 });

    // The row the action wrote, read past the page.
    expect(await readStoredProfile()).toEqual({
      capabilities,
      keywords: ['AI', 'Deep Learning', 'Robotics'],
      trlRange: [5, 8],
    });

    await page.reload();
    await expectHydrated(f.saveButton);
    await expect(f.capabilities).toHaveValue(capabilities);
    await expect(f.keywords).toHaveValue(keywords);
    await expect(f.trlMin).toHaveValue('5');
    await expect(f.trlMax).toHaveValue('8');
  });

  test('should show error when server returns error', async ({ page }) => {
    await signInAsProfileSaveUser(page, PROFILE_URL);
    const f = profileForm(page);
    await expectHydrated(f.saveButton);
    const before = await readStoredProfile();

    // Bypass the browser's `required` check so the server's validation answers.
    // (`required` now follows the edit, FO-387, so the switch is on the form, not on the field.)
    await f.capabilities.evaluate((el: HTMLTextAreaElement) => {
      if (el.form) el.form.noValidate = true;
    });
    await f.capabilities.fill('');
    await f.saveButton.click();

    await expect(page.getByText(/Lütfen tüm alanları/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('başarıyla güncellendi')).toHaveCount(0);
    expect(await readStoredProfile()).toEqual(before);
  });
});
