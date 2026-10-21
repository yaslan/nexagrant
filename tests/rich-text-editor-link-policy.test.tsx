// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { Editor, JSONContent } from '@tiptap/react';

import messages from '../messages/tr.json';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { isAllowedLinkHref } from '@/lib/blog-content-policy';

/**
 * TASK-MVDTW6KVN5BSA (FO-85) — the markdown editor takes a link exactly when
 * the post policy does (`isAllowedLinkHref`). An address the policy refuses
 * used to pass as long as it had no scheme (`example.com`, `#top`, `./x`): the
 * editor showed a link that the save then dropped without a word.
 */

const editorRef: React.MutableRefObject<Editor | null> = { current: null };

function mount() {
  render(
    <NextIntlClientProvider locale="tr" messages={messages}>
      <RichTextEditor format="markdown" content="" onChange={() => {}} editorRef={editorRef} />
    </NextIntlClientProvider>
  );
  if (!editorRef.current) throw new Error('editor not mounted');
  return editorRef.current;
}

/** Every link href in the document, in order. */
function hrefs(doc: JSONContent): string[] {
  const own = (doc.marks ?? []).flatMap((m) => (m.type === 'link' ? [String(m.attrs?.href)] : []));
  return [...own, ...(doc.content ?? []).flatMap(hrefs)];
}

const REFUSED = ['example.com', 'www.example.com/a', '#top', './x', '../x', 'x?y=1', '//evil.example/x', 'ftp://example.com', 'tel:123', 'javascript:alert(1)'];
const ALLOWED = ['https://example.org/a', 'http://example.org', '/tr/fiyatlar', 'mailto:a@b.org'];

afterEach(() => {
  cleanup();
  editorRef.current = null;
});

describe('markdown editor link check = post policy', () => {
  test.each([...REFUSED, ...ALLOWED])('setLink(%s) is taken exactly when the policy allows it', (href) => {
    const editor = mount();
    editor.commands.setContent('<p>metin</p>');
    editor.commands.selectAll();
    expect(editor.commands.setLink({ href })).toBe(isAllowedLinkHref(href));
  });

  test('a pasted <a> keeps its link only when the policy allows the href', () => {
    const editor = mount();
    const anchors = [...REFUSED, ...ALLOWED].map((h, i) => `<a href="${h.replace(/"/g, '&quot;')}">l${i}</a>`).join(' ');
    editor.commands.setContent(`<p>${anchors}</p>`);
    expect(hrefs(editor.getJSON())).toEqual(ALLOWED);
  });

  test('typing an address links it only when it is already an allowed href', () => {
    const editor = mount();
    // Autolink looks at the word before each typed space, so type word by word.
    for (const word of ['bkz ', 'https://example.org/a ', 've ', 'example.com ']) editor.chain().focus('end').insertContent(word).run();
    expect(hrefs(editor.getJSON())).toEqual(['https://example.org/a']);
  });
});
