import { test, expect } from '@playwright/test';
import { withTenant } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { seedIdentity, cleanupIdentity, signInAs } from './fixtures/session';

/**
 * TASK-MVDKHOXGRQQS5 — RichTextEditor gained a markdown mode for the blog. The
 * concept note editor uses its default HTML mode, which must not change: the
 * full toolbar (italic and quote included) and HTML saved per section.
 */

const SHOTS = shotsDir('TASK-MVDKHOXGRQQS5-screenshots');
const NOTE_ID = `e2e-rte-note-${Math.random().toString(36).slice(2, 8)}`;
const USER = {
  userId: 'e2e-concept-note-editor',
  email: 'concept-note-editor@e2e.fabrika.test',
  role: 'TENANT_OWNER' as const,
  tenantId: 'demo-tenant',
};

test.describe.serial('concept note editor — HTML mode unchanged', () => {
  test.beforeAll(async () => {
    await seedIdentity({ ...USER, workspaceIds: [] });
    await withTenant(USER.tenantId, (tx) =>
      tx.conceptNote.create({
        data: {
          id: NOTE_ID,
          tenantId: USER.tenantId,
          opportunityId: 'demo-opp-1',
          // No such template: the editor falls back to its default sections.
          templateId: 'e2e-no-template',
          content: { excellence: '<p>Önceki metin</p>' },
          createdBy: USER.userId,
        },
      })
    );
  });

  test.afterAll(async () => {
    await withTenant(USER.tenantId, (tx) => tx.conceptNote.deleteMany({ where: { id: NOTE_ID } }));
    await cleanupIdentity([USER.userId]);
  });

  test('loads HTML, italic and quote still offered, saves HTML', async ({ page, baseURL }) => {
    await signInAs(page, { id: USER.userId, email: USER.email, tenantId: USER.tenantId, role: USER.role }, baseURL as string);
    await page.goto(`/tr/default/concept-notes/${NOTE_ID}`);

    const editor = page.locator('.ProseMirror');
    await expect(editor).toHaveText('Önceki metin');
    for (const title of ['Bold', 'Italic', 'Heading 1', 'Heading 2', 'Bullet List', 'Ordered List', 'Quote']) {
      await expect(page.locator(`button[title="${title}"]`)).toBeVisible();
    }

    await editor.click();
    await expect(editor).toBeFocused();
    await editor.locator('p').last().click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
    await page.keyboard.press('Enter');
    await page.locator('button[title="Italic"]').click();
    // HTML mode keeps its old toolbar, whose button holds focus until Tiptap
    // hands it back on the next frame (the blog mode no longer does this).
    await expect(editor).toBeFocused();
    await page.keyboard.type('eğik ek');
    await expect(editor.locator('em')).toHaveText('eğik ek');
    await page.screenshot({ path: `${SHOTS}/06-concept-note-editor.png` });

    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect
      .poll(async () => {
        const note = await withTenant(USER.tenantId, (tx) => tx.conceptNote.findUnique({ where: { id: NOTE_ID } }));
        return (note?.content as Record<string, string> | undefined)?.excellence;
      })
      .toBe('<p>Önceki metin</p><p><em>eğik ek</em></p>');
  });
});
