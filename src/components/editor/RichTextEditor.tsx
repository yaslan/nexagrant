'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote } from 'lucide-react';
import { useEffect } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  editorRef?: React.MutableRefObject<Editor | null>;
}

export function RichTextEditor({ content, onChange, readOnly = false, editorRef }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base focus:outline-none min-h-[200px] w-full p-4 border border-border rounded-b-xl bg-surface text-ink',
      },
    },
  });

  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // Sync external content changes if editor is empty or on initial load
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content && editor.isEmpty) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
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
