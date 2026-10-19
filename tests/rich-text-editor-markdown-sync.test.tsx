// @vitest-environment jsdom
import React, { useEffect, useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { Editor } from '@tiptap/react';

import messages from '../messages/tr.json';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { docToMarkdown } from '@/lib/blog-markdown';

/**
 * TASK-MVDP07GF2EVIU (FO-77) — markdown mode tells an echo of what the editor
 * itself reported apart from a `content` the parent sets. A reset must reach
 * the document; a batched render that still carries an older keystroke must
 * not rewind it (the FO-75 bug).
 */

const outer: React.MutableRefObject<(md: string) => void> = { current: () => {} };
const setOuter = (md: string) => outer.current(md);
const editorRef: React.MutableRefObject<Editor | null> = { current: null };

/** A parent that holds the markdown in state and feeds it back, as the admin form does. */
function Controlled({ initial }: { initial: string }) {
  const [content, setContent] = useState(initial);
  useEffect(() => {
    outer.current = setContent;
  }, []);
  return <RichTextEditor format="markdown" content={content} onChange={setContent} editorRef={editorRef} />;
}

function mount(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="tr" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

function editor(): Editor {
  if (!editorRef.current) throw new Error('editor not mounted');
  return editorRef.current;
}

const shown = () => docToMarkdown(editor().getJSON());

/** A parent that sets `content` itself (a load, a reset) and only records what the editor reports. */
function Outside({ content }: { content: string }) {
  return <RichTextEditor format="markdown" content={content} onChange={() => {}} editorRef={editorRef} />;
}

/** A keystroke at the end of the document, through the editor like typing is. */
function type(text: string) {
  editor().chain().focus('end').insertContent(text).run();
}

afterEach(() => {
  cleanup();
  editorRef.current = null;
});

describe('RichTextEditor markdown — outside content vs. its own echo', () => {
  test('typed text, then the parent resets content to empty: the document is empty', () => {
    mount(<Controlled initial="" />);
    act(() => type('a'));
    expect(shown()).toBe('a');
    act(() => setOuter(''));
    expect(shown()).toBe('');
  });

  test('a reset to a value the author passed through while typing still reaches the document', () => {
    // The author clears a loaded post and starts over; the parent then loads an
    // empty post. `''` was reported on the way, but it is not what the editor
    // shows now, so it cannot be an echo.
    const view = mount(<Outside content="Merhaba" />);
    act(() => {
      editor().commands.selectAll();
      editor().commands.deleteSelection();
    });
    expect(shown()).toBe('');
    act(() => type('yeni taslak'));
    expect(shown()).toBe('yeni taslak');
    view.rerender(
      <NextIntlClientProvider locale="tr" messages={messages}>
        <Outside content="" />
      </NextIntlClientProvider>
    );
    expect(shown()).toBe('');
  });

  test('the same reset in one batch with typing: the parent value wins', () => {
    mount(<Controlled initial="x" />);
    act(() => {
      type('a');
      type('b');
      setOuter('xa');
    });
    expect(shown()).toBe('xa');
  });

  test('its own report rendered back is not applied again: the caret and the history stay', () => {
    mount(<Controlled initial="" />);
    act(() => type('ab'));
    act(() => type('c'));
    expect(shown()).toBe('abc');
    // One undo step per insert: no setContent sneaked an extra transaction in.
    act(() => {
      editor().commands.undo();
    });
    expect(shown()).toBe('ab');
  });
});
