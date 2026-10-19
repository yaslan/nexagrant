'use client';

import { useEditor, useEditorState, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ListItem, OrderedList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Quote, Undo2, Redo2, Link2, ImagePlus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { docToMarkdown, markdownToDoc } from '@/lib/blog-markdown';
import { cleanBracketText, isAllowedBlogImageSrc, isAllowedLinkHref } from '@/lib/blog-content-policy';
import {
  BLOG_IMAGE_UPLOAD_MAX_MB,
  BLOG_IMAGE_UPLOAD_TYPES,
  uploadBlogImage,
  type BlogImageUploadError,
} from '@/lib/blog-image-upload';

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
  /**
   * markdown only: the public bucket's base URL. An image in the post is an
   * upload under `<imageBase>/blog/` (src/lib/blog-content-policy.ts); without
   * it no image is read or inserted.
   */
  imageBase?: string;
}

/** A scheme at the start of an address: `https:`, `mailto:`, `javascript:` … */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * What the public post page can render, and nothing more: anything else would
 * show in the editor and reach the site as raw `*`/`_` markers. Disabled marks
 * and nodes also drop out of pasted HTML. A list item holds one paragraph —
 * the page has no nested lists — so Tab leaves the editor instead of nesting.
 *
 * Links and images (TASK-MVDPHZQCTVJ2R) follow src/lib/blog-content-policy.ts:
 * a pasted or typed address the policy refuses stays text, and an image comes
 * only from the Image tool's upload — a pasted `<img>` is never read, since
 * outside images are not allowed in a post.
 */
const MARKDOWN_EXTENSIONS = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
    italic: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      // A typed or pasted address with no scheme (`example.com`, `a@b.org`)
      // is completed by the link extension and checked again as an href
      // before it is rendered; every other address is the policy's to judge.
      isAllowedUri: (url, ctx) => isAllowedLinkHref(url) || (!URL_SCHEME.test(url) && !url.startsWith('/') && ctx.defaultValidate(url)),
    },
    strike: false,
    underline: false,
    listItem: false,
    orderedList: false,
    heading: { levels: [1, 2, 3] },
  }),
  ListItem.extend({ content: 'paragraph' }),
  Image.extend({ parseHTML: () => [] }).configure({ inline: false, allowBase64: false }),
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
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 ' +
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 ' +
  '[&_img]:w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:border [&_img]:border-border [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-accent';

export function RichTextEditor({
  content,
  onChange,
  readOnly = false,
  editorRef,
  format = 'html',
  labelledBy,
  required = false,
  invalid = false,
  imageBase,
}: RichTextEditorProps) {
  const isMarkdown = format === 'markdown';
  // markdown: the values this editor reported that the parent may still hand
  // back. While typing, a render can carry an older one of them (state updates
  // are batched); that is an echo, not a change. Any other `content` comes from
  // outside (another post loaded) and replaces the document.
  const emitted = useRef<string[]>([content]);
  const editor = useEditor({
    extensions: isMarkdown ? MARKDOWN_EXTENSIONS : [StarterKit],
    content: isMarkdown ? markdownToDoc(content, imageBase) : content,
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
              const doc = view.state.schema.nodeFromJSON(markdownToDoc(text.replace(/\r\n?/g, '\n'), imageBase));
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
        editor.commands.setContent(markdownToDoc(content, imageBase), { emitUpdate: false });
      }
      return;
    }
    if (content && editor.getHTML() !== content && editor.isEmpty) {
      editor.commands.setContent(content);
    }
  }, [content, editor, isMarkdown, imageBase]);

  if (!editor) {
    return null;
  }

  if (isMarkdown) {
    return (
      <div className="w-full flex flex-col shadow-2xs rounded-xl overflow-hidden">
        {!readOnly && <MarkdownToolbar editor={editor} imageBase={imageBase} />}
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

/**
 * Focus the text first, synchronously, then start a command chain. The
 * `focus()` chain command focuses on the next frame and re-applies the
 * selection then, which drops a pending mark: a keyboard user pressing Space
 * on Bold would type plain text.
 */
function focusChain(editor: Editor) {
  if (!editor.view.hasFocus()) editor.view.focus();
  return editor.chain();
}

/** The blog toolbar: only the blocks, the bold mark, links and images the post page renders. */
function MarkdownToolbar({ editor, imageBase }: { editor: Editor; imageBase?: string }) {
  const t = useTranslations('richTextEditor');
  const chain = () => focusChain(editor);
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
      link: e.isActive('link'),
      image: e.isActive('image'),
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

  const [dialog, setDialog] = useState<'link' | 'image' | null>(null);

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
      {(
        [
          { key: 'link', label: t('link'), Icon: Link2, active: state.link },
          { key: 'image', label: t('image'), Icon: ImagePlus, active: state.image },
        ] as const
      ).map(({ key, label, Icon, active }) => (
        <button
          key={key}
          type="button"
          onMouseDown={keepEditorFocus}
          onClick={() => setDialog(key)}
          aria-label={label}
          aria-pressed={active}
          aria-haspopup="dialog"
          title={label}
          data-testid={`rte-${key}`}
          className={`${TOOL_CLASS} ${active ? 'bg-accent/15 text-accent-ink font-bold' : 'text-ink-2'}`}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
      {dialog === 'link' && <LinkDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'image' && <ImageDialog editor={editor} imageBase={imageBase} onClose={() => setDialog(null)} />}
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

const FIELD_CLASS =
  'w-full px-3 py-2 bg-ground border border-border rounded-lg text-sm text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:border-bad';
const BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50';

type Finish = (edit?: () => void) => void;

/**
 * A modal native <dialog> for a toolbar tool: showModal() gives the focus
 * trap, Escape and the inert background (as KvkkDialog does). It is portalled
 * to <body> because the blog editor sits inside the post <form>, and a form
 * may not hold another; React still bubbles the inner submit to the outer
 * form's handler, so `onSubmit` stops it. `finish` closes the dialog first —
 * the browser hands focus back to the tool — and then runs the edit, which
 * puts focus back in the text.
 */
function ToolDialog({
  title,
  onClose,
  onSubmit,
  children,
  testId,
  extra,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (finish: Finish) => void;
  children: React.ReactNode;
  testId: string;
  /** A destructive action beside Cancel and Apply (Remove link); it closes the dialog too. */
  extra?: { label: string; testId: string; edit: () => void };
}) {
  const t = useTranslations('richTextEditor');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const finish: Finish = (edit) => {
    ref.current?.close();
    edit?.();
  };
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSubmit(finish);
        }}
        className="space-y-4 p-5"
      >
        <h2 id={titleId} className="font-heading text-base font-bold">
          {title}
        </h2>
        {children}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {extra && (
            <button
              type="button"
              data-testid={extra.testId}
              onClick={() => finish(extra.edit)}
              className={`${BUTTON_CLASS} mr-auto border border-bad/40 text-bad hover:bg-bad/10`}
            >
              {extra.label}
            </button>
          )}
          <button type="button" onClick={() => finish()} className={`${BUTTON_CLASS} border border-border text-ink-2 hover:bg-surface-hover`}>
            {t('cancel')}
          </button>
          <button type="submit" data-testid="rte-dialog-submit" className={`${BUTTON_CLASS} bg-accent text-white hover:opacity-90`}>
            {t('apply')}
          </button>
        </div>
      </form>
    </dialog>,
    document.body
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 text-[11px] font-semibold text-bad break-words">
      {children}
    </p>
  );
}

/**
 * Link tool: adds, edits or removes the link on the selected text. With
 * nothing selected (and the caret not in a link) it also asks for the text to
 * show. The address is judged by the post policy, so only what the site will
 * render as a link can be set here.
 */
function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const t = useTranslations('richTextEditor.linkDialog');
  const ids = useId();
  const current = editor.getAttributes('link').href;
  const editing = typeof current === 'string' && current.length > 0;
  const needsText = editor.state.selection.empty && !editing;
  const [href, setHref] = useState(editing ? current : '');
  const [text, setText] = useState('');
  const [error, setError] = useState<'url' | 'text' | null>(null);

  const submit = (finish: Finish) => {
    const url = href.trim();
    if (!isAllowedLinkHref(url)) return setError('url');
    const label = cleanBracketText(text).trim();
    if (needsText && !label) return setError('text');
    finish(() => {
      if (needsText) {
        // The new link ends where it was inserted: what is typed next is plain text.
        focusChain(editor)
          .insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] })
          .unsetMark('link')
          .run();
      } else {
        focusChain(editor).extendMarkRange('link').setLink({ href: url }).run();
      }
    });
  };

  return (
    <ToolDialog
      title={editing ? t('editTitle') : t('title')}
      onClose={onClose}
      onSubmit={submit}
      testId="rte-link-dialog"
      extra={
        editing
          ? { label: t('remove'), testId: 'rte-link-remove', edit: () => focusChain(editor).extendMarkRange('link').unsetLink().run() }
          : undefined
      }
    >
      {needsText && (
        <div>
          <label htmlFor={`${ids}-text`} className="block text-xs font-bold mb-1">
            {t('text')}
          </label>
          <input
            id={`${ids}-text`}
            data-testid="rte-link-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            aria-invalid={error === 'text'}
            aria-describedby={error === 'text' ? `${ids}-text-error` : undefined}
            className={FIELD_CLASS}
          />
          {error === 'text' && <FieldError id={`${ids}-text-error`}>{t('textRequired')}</FieldError>}
        </div>
      )}
      <div>
        <label htmlFor={`${ids}-url`} className="block text-xs font-bold mb-1">
          {t('url')}
        </label>
        <input
          id={`${ids}-url`}
          data-testid="rte-link-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setError(null);
          }}
          placeholder="https://"
          aria-invalid={error === 'url'}
          aria-describedby={`${ids}-url-hint${error === 'url' ? ` ${ids}-url-error` : ''}`}
          className={FIELD_CLASS}
        />
        <p id={`${ids}-url-hint`} className="mt-1 text-[11px] text-muted">
          {t('urlHint')}
        </p>
        {error === 'url' && <FieldError id={`${ids}-url-error`}>{t('invalidUrl')}</FieldError>}
      </div>
    </ToolDialog>
  );
}

/**
 * Image tool: upload a file (the cover image's route, limits and messages),
 * then name it — alt text is required — and insert it as a block. With an
 * image selected it edits that image instead. There is no address field: an
 * image in a post is only ever an upload.
 */
function ImageDialog({ editor, imageBase, onClose }: { editor: Editor; imageBase?: string; onClose: () => void }) {
  const t = useTranslations('richTextEditor.imageDialog');
  const tUpload = useTranslations('adminBlog.image');
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  // An image block is active only while it is the selected node.
  const selected = editor.isActive('image');
  const attrs = selected ? editor.getAttributes('image') : {};
  const [src, setSrc] = useState<string>(String(attrs.src ?? ''));
  const [alt, setAlt] = useState<string>(String(attrs.alt ?? ''));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<BlogImageUploadError | null>(null);
  const [error, setError] = useState<'file' | 'alt' | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setError(null);
    // The same file can be picked again after an error.
    if (fileInput.current) fileInput.current.value = '';
    setUploading(true);
    try {
      const result = await uploadBlogImage(file);
      if (result.ok) setSrc(result.url);
      else setUploadError(result.error);
    } finally {
      setUploading(false);
    }
  };

  const submit = (finish: Finish) => {
    if (uploading) return;
    if (!isAllowedBlogImageSrc(src, imageBase)) return setError('file');
    const text = cleanBracketText(alt).trim();
    if (!text) return setError('alt');
    finish(() => {
      if (selected) focusChain(editor).updateAttributes('image', { src, alt: text }).run();
      else focusChain(editor).insertContent({ type: 'image', attrs: { src, alt: text } }).run();
    });
  };

  return (
    <ToolDialog title={selected ? t('editTitle') : t('title')} onClose={onClose} onSubmit={submit} testId="rte-image-dialog">
      <div className="space-y-2">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- a preview of the upload just made, any size
          <img src={src} alt={t('preview')} className="max-h-40 w-full rounded-lg border border-border object-contain bg-ground" />
        )}
        <input
          ref={fileInput}
          type="file"
          accept={BLOG_IMAGE_UPLOAD_TYPES.join(',')}
          className="hidden"
          data-testid="rte-image-file"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          aria-describedby={`${ids}-file-hint`}
          className={`${BUTTON_CLASS} border border-border text-ink hover:bg-surface-hover`}
        >
          {src ? t('change') : t('choose')}
        </button>
        <p id={`${ids}-file-hint`} className="text-[11px] text-muted">
          {tUpload('hint', { maxMb: BLOG_IMAGE_UPLOAD_MAX_MB })}
        </p>
        {uploading && (
          <p role="status" data-testid="rte-image-uploading" className="text-[11px] font-semibold text-ink-2">
            {tUpload('uploading')}
          </p>
        )}
        {uploadError && (
          <FieldError id={`${ids}-upload-error`}>{tUpload(`errors.${uploadError}`, { maxMb: BLOG_IMAGE_UPLOAD_MAX_MB })}</FieldError>
        )}
        {error === 'file' && !uploadError && <FieldError id={`${ids}-file-error`}>{t('fileRequired')}</FieldError>}
      </div>
      <div>
        <label htmlFor={`${ids}-alt`} className="block text-xs font-bold mb-1">
          {t('alt')} *
        </label>
        <input
          id={`${ids}-alt`}
          data-testid="rte-image-alt"
          value={alt}
          onChange={(e) => {
            setAlt(e.target.value);
            setError(null);
          }}
          required
          aria-invalid={error === 'alt'}
          aria-describedby={`${ids}-alt-hint${error === 'alt' ? ` ${ids}-alt-error` : ''}`}
          className={FIELD_CLASS}
        />
        <p id={`${ids}-alt-hint`} className="mt-1 text-[11px] text-muted">
          {t('altHint')}
        </p>
        {error === 'alt' && <FieldError id={`${ids}-alt-error`}>{t('altRequired')}</FieldError>}
      </div>
    </ToolDialog>
  );
}
