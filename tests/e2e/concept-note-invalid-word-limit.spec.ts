import { test, expect } from '@playwright/test';
import { withTenant } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * NG-99 — a tenant template whose `maxWords` is over the prompt's ceiling still
 * shows its section in the editor. Its "AI draft" button has to name the section,
 * as the M2 path does, instead of the generic failure.
 */

const SHOTS = shotsDir('NG-99-screenshots');
const SUFFIX = Math.random().toString(36).slice(2, 8);
const NOTE_ID = `e2e-ng99-note-${SUFFIX}`;
const TEMPLATE_ID = `e2e-ng99-template-${SUFFIX}`;
const USER = {
  userId: 'e2e-ng99-word-limit',
  email: 'ng99-word-limit@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

test.describe.serial('concept note AI draft — invalid word limit', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...USER, workspaceIds: [] });
    await withTenant(USER.tenantId, async (tx) => {
      await tx.conceptTemplate.create({
        data: {
          id: TEMPLATE_ID,
          tenantId: USER.tenantId,
          key: TEMPLATE_ID,
          name: 'NG-99 template',
          version: '1',
          schema: [{ key: 'ozet', labelKey: 'Özet', maxWords: 25000, promptKey: 'Write the summary.' }],
        },
      });
      await tx.conceptNote.create({
        data: {
          id: NOTE_ID,
          tenantId: USER.tenantId,
          opportunityId: 'demo-opp-1',
          templateId: TEMPLATE_ID,
          content: {},
          createdBy: USER.userId,
        },
      });
    });
  });

  test.afterAll(async () => {
    await withTenant(USER.tenantId, async (tx) => {
      await tx.conceptNote.deleteMany({ where: { id: NOTE_ID } });
      await tx.conceptTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
    });
    await cleanupIdentity([USER.userId]);
  });

  test('the button names the section and says no credits were used', async ({ page, baseURL }) => {
    await signInAs(page, { id: USER.userId, email: USER.email, tenantId: USER.tenantId, role: USER.role }, baseURL as string);
    await page.goto(`/tr/default/concept-notes/${NOTE_ID}`);

    const dialog = page.waitForEvent('dialog');
    await page.getByRole('button', { name: /YZ Taslağı/ }).click();
    const alert = await dialog;
    const message = alert.message();
    await alert.accept();

    expect(message).toBe(
      'Taslak üretilemedi: şablondaki "Özet" bölümünün kelime sınırı geçersiz. Şablonu düzeltip yeniden deneyin. Kredi harcanmadı.'
    );

    // A native alert is not part of a page screenshot, so its text is drawn on the page for the shot.
    await page.evaluate((text) => {
      const box = document.createElement('div');
      box.textContent = `alert(): ${text}`;
      box.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;max-width:640px;padding:16px;background:#fff;color:#111;border:2px solid #111';
      document.body.append(box);
    }, message);
    await page.screenshot({ path: `${SHOTS}/invalid-word-limit.png` });
  });
});
