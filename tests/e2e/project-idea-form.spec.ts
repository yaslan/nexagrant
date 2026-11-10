import { test, expect } from '@playwright/test';

import { evidenceTenant } from './fixtures/evidence-tenant';
import { shotsDir } from './fixtures/shots';

const SHOTS = shotsDir('NG-14-screenshots');

/**
 * Project idea entry (NG-14). Real sign-in, real page, real clicks and typing.
 *
 * Covered: the TRL criterion reads "eksik" with no idea and links to the form;
 * an empty submit reports the required fields and moves focus to the summary;
 * the TRL select offers 1..9; a complete form is saved through NG-38's
 * `createProjectIdea` and reads back from the list after a reload.
 */

const tenant = evidenceTenant('ng14');

test.describe('NG-14 project idea entry', () => {
  test.beforeAll(async () => {
    await tenant.setup();
  });

  test.afterAll(tenant.teardown);

  test('TRL criterion is "eksik" and points to the form', async ({ page }) => {
    await tenant.signIn(page);
    await page.goto(`/tr/${tenant.workspace}/proje-fikri`);

    const criterion = page.getByRole('region', { name: 'TRL kriteri' });
    await expect(criterion).toContainText('Eksik.');
    await page.screenshot({ path: `${SHOTS}/01-trl-missing-tr-1280.png`, fullPage: true });

    await page.getByRole('link', { name: 'Proje fikri girişine git' }).click();
    await expect(page).toHaveURL(/#proje-fikri-form$/);
    await expect(page.getByRole('heading', { name: 'Yeni proje fikri' })).toBeVisible();
  });

  test('empty submit lists required fields, moves focus to the summary', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await tenant.signIn(page);
    await page.goto(`/tr/${tenant.workspace}/proje-fikri`);
    await page.getByRole('button', { name: 'Fikri kaydet' }).click();

    const summary = page.locator('form#proje-fikri-form [role="alert"]');
    await expect(summary).toContainText('Formda düzeltilmesi gereken alanlar var.');
    await expect(summary).toContainText('Kurum: Bu alan zorunlu.');
    await expect(summary).toContainText('Başlık: Bu alan zorunlu.');
    await expect(summary).toContainText('TRL: TRL seçin.');
    await expect(summary).toContainText('Hedef programlar: En az bir hedef program seçin.');

    await expect(summary).toBeFocused();
    await page.screenshot({ path: `${SHOTS}/02-form-errors-tr-1280.png`, fullPage: true });
    expect(dialogs).toEqual([]);

    // Each field is wired to its message for assistive tech.
    await expect(page.getByLabel('Kurum')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Teknoloji hazırlık seviyesi (TRL)')).toHaveAttribute('aria-invalid', 'true');
  });

  test('TRL select offers 1 to 9 only and accepts the boundaries', async ({ page }) => {
    await tenant.signIn(page);
    await page.goto(`/tr/${tenant.workspace}/proje-fikri`);

    const trl = page.getByLabel('Teknoloji hazırlık seviyesi (TRL)');
    const options = await trl.locator('option').allTextContents();
    expect(options).toEqual(['Seçiniz', 'TRL 1', 'TRL 2', 'TRL 3', 'TRL 4', 'TRL 5', 'TRL 6', 'TRL 7', 'TRL 8', 'TRL 9']);

    for (const value of ['1', '9']) {
      await trl.selectOption(value);
      await page.getByRole('button', { name: 'Fikri kaydet' }).click();
      await expect(page.locator('form#proje-fikri-form [role="alert"]')).not.toContainText('TRL');
    }
  });

  test('a complete form saves, and the idea reads back after a reload', async ({ page }) => {
    await tenant.signIn(page);
    await page.goto(`/tr/${tenant.workspace}/proje-fikri`);

    await page.getByLabel('Kurum').fill('Örnek Üniversite');
    await page.getByLabel('Başlık').fill('Akıllı sulama');
    await page.getByLabel('Özet').fill('Toprak nemine göre sulama.');
    await page.getByLabel('Anahtar kelimeler').fill('sulama, IoT, iot');
    await page.getByLabel('Teknoloji hazırlık seviyesi (TRL)').selectOption('4');
    await page.getByRole('checkbox', { name: 'Horizon Europe' }).check();

    await page.getByRole('button', { name: 'Fikri kaydet' }).click();

    await expect(page.locator('form#proje-fikri-form [role="alert"]')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('"Akıllı sulama" kaydedildi.');
    await expect(page.getByRole('region', { name: 'TRL kriteri' })).toContainText('karşılandı');

    // Read back: a fresh load shows the stored row, not the form's state.
    await page.reload();
    const row = page.getByRole('row', { name: /Akıllı sulama/ });
    await expect(row).toContainText('TRL 4');
    await expect(row).toContainText('Horizon Europe');
    await expect(row).toContainText('Henüz yok');
    await page.screenshot({ path: `${SHOTS}/03-form-saved-listed-tr-1280.png`, fullPage: true });
  });
});
