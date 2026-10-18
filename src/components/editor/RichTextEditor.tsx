'use client';

import { useEditor, useEditorState, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ListItem, OrderedList } from '@tiptap/extension-list';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Quote, Undo2, Redo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { docToMarkdown, markdownToDoc } from '@/lib/blog-markdown';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  editorRef?: React.MutableRefObject<Editor | null>;
  /**
   * `html` (default): content in and out is HTML, full StarterKit.
   * `markdown`: content in and out is the blog markdown subset of
   * src/lib/blog-markdown.ts, and the editor offers only what that subset
   * can say (TASK-MVDKHOXGRQQS5).
   */
  format?: 'html' | 'markdown';
  /** markdown only: id of the visible label that names the editable area. */
  labelledBy?: string;
  /** markdown only: marks the editable area required / invalid for assistive tech. */
  required?: boolean;
  invalid?: boolean;
}

/**
 * What the public post page can render, and nothing more: anything else would
 * show in the editor and reach the site as raw `*`/`_` markers. Disabled marks
 * and nodes also drop out of pasted HTML. A list item holds one paragraph —
 * the page has no nested lists — so Tab leaves the editor instead of nesting.
 */
const MARKDOWN_EXTENSIONS = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
    italic: false,
    link: false,
    strike: false,
    underline: false,
    listItem: false,
    orderedList: false,
    heading: { levels: [1, 2, 3] },
  }),
  ListItem.extend({ content: 'paragraph' }),
  // The page numbers every list from 1; a pasted `<ol start="4">` does too.
  OrderedList.extend({
    addAttributes() {
      return { ...this.parent?.(), start: { default: 1, parseHTML: () => 1, renderHTML: () => ({}) } };
    },
  }),
];

/** Mirrors the post page's block styles; the `prose` classes have no plugin behind them. */
const MARKDOWN_CONTENT_CLASS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent min-h-[200px] w-full p-4 border border-border rounded-b-xl bg-surface text-ink text-sm leading-relaxed space-y-3 ' +
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:font-heading [&_h1]:pb-1 [&_h1]:border-b [&_h1]:border-border ' +
  '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:font-heading [&_h3]:text-lg [&_h3]:font-bold [&_h3]:font-heading [&_h3]:text-accent ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1';

export function RichTextEditor({
  content,
  onChange,
  readOnly = false,
  editorRef,
  format = 'html',
  labelledBy,
  required = false,
  invalid = false,
}: RichTextEditorProps) {
  const isMarkdown = format === 'markdown';
  // markdown: the values this editor reported that the parent may still hand
  // back. While typing, a render can carry an older one of them (state updates
  // are batched); that is an echo, not a change. Any other `content` comes from
  // outside (another post loaded) and replaces the document.
  const emitted = useRef<string[]>([content]);
  const editor = useEditor({
    extensions: isMarkdown ? MARKDOWN_EXTENSIONS : [StarterKit],
    content: isMarkdown ? markdownToDoc(content) : content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (isMarkdown) {
        const md = docToMarkdown(editor.getJSON());
        emitted.current = [...emitted.current.slice(-49), md];
        onChange(md);
        return;
      }
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: isMarkdown
        ? {
            class: MARKDOWN_CONTENT_CLASS,
            role: 'textbox',
            'aria-multiline': 'true',
            ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
            ...(required ? { 'aria-required': 'true' } : {}),
            ...(invalid ? { 'aria-invalid': 'true' } : {}),
          }
        : {
            class: 'prose prose-sm sm:prose-base focus:outline-none min-h-[200px] w-full p-4 border border-border rounded-b-xl bg-surface text-ink',
          },
      // markdown: pasted plain text is read as post markdown, so `* item`
      // or `## title` lines become the blocks the page will show for them.
      ...(isMarkdown
        ? {
            clipboardTextParser: (text: string, _$context: unknown, _plain: boolean, view: { state: { schema: Editor['schema'] } }) => {
              const doc = view.state.schema.nodeFromJSON(markdownToDoc(text.replace(/\r\n?/g, '\n')));
              return doc.slice(doc.content.size > 0 ? 1 : 0, Math.max(0, doc.content.size - 1));
            },
          }
        : {}),
    },
  });

  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // Sync external content changes if editor is empty or on initial load
  useEffect(() => {
    if (!editor) return;
    if (isMarkdown) {
      const echo = emitted.current.lastIndexOf(content);
      if (echo >= 0) {
        emitted.current = emitted.current.slice(echo);
      } else {
        emitted.current = [content];
        editor.commands.setContent(markdownToDoc(content), { emitUpdate: false });
      }
      return;
    }
    if (content && editor.getHTML() !== content && editor.isEmpty) {
      editor.commands.setContent(content);
    }
  }, [content, editor, isMarkdown]);

  if (!editor) {
    return null;
  }

  if (isMarkdown) {
    return (
      <div className="w-full flex flex-col shadow-2xs rounded-xl overflow-hidden">
        {!readOnly && <MarkdownToolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col shadow-2xs rounded-xl overflow-hidden">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 p-2 bg-ground/80 border-x border-t border-border rounded-t-xl">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-lg hover:bg-surface transition-colors ${editor.isActive('bold') ? 'bg-accent/15 text-accent-ink font-bold' : 'text-ink-2'}`}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-lg hover:bg-surface transition-colors ${editor.isActive('italic') ? 'bg-accent/15 text-accent-ink' : 'text-ink-2'}`}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          
          <div className="w-px h-5 bg-border mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded-lg hover:bg-surface transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-accent/15 text-accent-ink font-bold' : 'text-ink-2'}`}
            title="Heading 1"
          >
            <Heading1 size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded-lg hover:bg-surface transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-accent/15 text-accent-ink font-bold' : 'text-ink-2'}`}
            title="Heading 2"
          >
            <Heading2 size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded-lg hover:bg-surface transition-colors ${editor.isActive('bulletList') ? 'bg-accent/15 text-accent-ink' : 'text-ink-2'}`}
            title="Bullet List"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded-lg hover:bg-surface transition-colors ${editor.isActive('orderedList') ? 'bg-accent/15 text-accent-ink' : 'text-ink-2'}`}
            title="Ordered List"
          >
            <ListOrdered size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded-lg hover:bg-surface transition-colors ${editor.isActive('blockquote') ? 'bg-accent/15 text-accent-ink' : 'text-ink-2'}`}
            title="Quote"
          >
            <Quote size={16} />
          </button>
        </div>
      )}
      
      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}

const TOOL_CLASS =
  'p-1.5 rounded-lg hover:bg-surface transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * A mouse press on a tool must not take focus from the text: Tiptap gives it
 * back only on the next frame, and keys typed meanwhile went to the button.
 * Keyboard users still reach the tools with Tab.
 */
const keepEditorFocus = (e: React.MouseEvent) => e.preventDefault();

/** The blog toolbar: only the blocks and the one mark the post page renders. */
function MarkdownToolbar({ editor }: { editor: Editor }) {
  const t = useTranslations('richTextEditor');
  // Focus the text first, synchronously, then run the command. The `focus()`
  // chain command focuses on the next frame and re-applies the selection
  // then, which drops a pending mark: a keyboard user pressing Space on Bold
  // would type plain text.
  const chain = () => {
    if (!editor.view.hasFocus()) editor.view.focus();
    return editor.chain();
  };
  // Tiptap 3 does not re-render on every transaction; read the active state explicitly.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const toggles = [
    { key: 'h1', label: t('heading1'), Icon: Heading1, active: state.h1, run: () => chain().toggleHeading({ level: 1 }).run() },
    { key: 'h2', label: t('heading2'), Icon: Heading2, active: state.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: 'h3', label: t('heading3'), Icon: Heading3, active: state.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    { key: 'bold', label: t('bold'), Icon: Bold, active: state.bold, run: () => chain().toggleBold().run() },
    { key: 'bulletList', label: t('bulletList'), Icon: List, active: state.bulletList, run: () => chain().toggleBulletList().run() },
    { key: 'orderedList', label: t('orderedList'), Icon: ListOrdered, active: state.orderedList, run: () => chain().toggleOrderedList().run() },
  ];

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      className="flex flex-wrap items-center gap-1 p-2 bg-ground/80 border-x border-t border-border rounded-t-xl"
    >
      {toggles.map(({ key, label, Icon, active, run }, i) => (
        <span key={key} className="contents">
          {(i === 3 || i === 4) && <span aria-hidden="true" className="w-px h-5 bg-border mx-1" />}
          <button
            type="button"
            onMouseDown={keepEditorFocus}
            onClick={run}
            aria-label={label}
            aria-pressed={active}
            title={label}
            data-testid={`rte-${key}`}
            className={`${TOOL_CLASS} ${active ? 'bg-accent/15 text-accent-ink font-bold' : 'text-ink-2'}`}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        </span>
      ))}
      <span aria-hidden="true" className="w-px h-5 bg-border mx-1" />
      <button
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => chain().undo().run()}
        disabled={!state.canUndo}
        aria-label={t('undo')}
        title={t('undo')}
        data-testid="rte-undo"
        className={`${TOOL_CLASS} text-ink-2`}
      >
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => chain().redo().run()}
        disabled={!state.canRedo}
        aria-label={t('redo')}
        title={t('redo')}
        data-testid="rte-redo"
        className={`${TOOL_CLASS} text-ink-2`}
      >
        <Redo2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
