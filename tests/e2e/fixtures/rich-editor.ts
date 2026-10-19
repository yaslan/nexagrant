import type { Locator, Page } from '@playwright/test';

/**
 * TASK-MVDKHOXGRQQS5 — the admin blog content field is a Tiptap editor, not a
 * textarea, so `fill()` no longer means "these lines of markdown". These
 * helpers drive it the way a person does.
 */

/** The blog post content editor, found by its visible label. */
export function blogContentEditor(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Makale İçeriği *' });
}

/**
 * A real paste: the payload goes onto the browser's clipboard and is pasted
 * with the keyboard shortcut into the focused editor. With `html` the editor
 * gets what a copy from Word or a web page carries; with `text` alone it gets
 * plain text, which the blog editor reads as post markdown.
 *
 * The paste goes where the caller left the selection. An editor that already
 * holds focus is not clicked: a click collapses a Ctrl+A selection to a caret
 * mid-editor, and ProseMirror takes that up on a later `selectionchange`, so
 * whether Ctrl+V replaced the document or landed inside its paragraph was a
 * race (TASK-MVDP07GF2EVIU, `admin-blog-rich-editor` "paste from Word" 3/5).
 */
export async function pasteInto(editor: Locator, payload: { text: string; html?: string }): Promise<void> {
  const page = editor.page();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(async ({ text, html }) => {
    const parts: Record<string, Blob> = { 'text/plain': new Blob([text], { type: 'text/plain' }) };
    if (html) parts['text/html'] = new Blob([html], { type: 'text/html' });
    await navigator.clipboard.write([new ClipboardItem(parts)]);
  }, payload);
  if (!(await editor.evaluate((el) => el.contains(document.activeElement)))) await editor.click();
  await page.keyboard.press('ControlOrMeta+V');
}
