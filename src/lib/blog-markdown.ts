/**
 * TASK-MVDKHOXGRQQS5 — the admin blog editor edits `BlogPost.content`, which
 * stays plain markdown: the public post page renders it with
 * `renderBlogContent` (src/app/[locale]/(public)/blog/[slug]/page.tsx), and
 * that renderer knows exactly this subset — paragraph, `#`/`##`/`###`
 * heading, `**bold**`, `* ` bullet list, `1. ` numbered list. Nothing else
 * exists on the site, so nothing else exists here.
 *
 * `markdownToDoc` reads content the way the renderer does (line by line,
 * trimmed, the same patterns in the same order, consecutive paragraph lines
 * joined by a space), so a post opened in the editor shows the blocks the
 * site shows. `docToMarkdown` writes each block back in one canonical form
 * that the renderer reads as that same block. Opening a post and saving it
 * untouched may reformat the text (blank lines, `1.` numbering) but never
 * changes what the post page renders — tests/blog-markdown.test.tsx checks
 * that against the real page.
 *
 * Pure functions over Tiptap/ProseMirror JSON; no editor import, no HTML.
 */

export interface BlogDocText {
  type: 'text';
  text: string;
  marks?: { type: 'bold' }[];
}
export interface BlogDocParagraph {
  type: 'paragraph';
  content?: BlogDocText[];
}
export interface BlogDocHeading {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 };
  content?: BlogDocText[];
}
export interface BlogDocList {
  type: 'bulletList' | 'orderedList';
  content: { type: 'listItem'; content: BlogDocParagraph[] }[];
}
export type BlogDocBlock = BlogDocParagraph | BlogDocHeading | BlogDocList;
export interface BlogDoc {
  type: 'doc';
  content: BlogDocBlock[];
}

/** The renderer's `renderInline` split: `**…**` with no `*` inside is bold. */
const BOLD_SPLIT = /(\*\*[^*]+\*\*)/g;

function inlineToNodes(text: string): BlogDocText[] {
  const nodes: BlogDocText[] = [];
  for (const part of text.split(BOLD_SPLIT)) {
    if (part.length === 0) continue;
    // renderInline's own test, kept as is: any part that starts and ends with
    // `**` is bold, so a whole line `**a*b**` is bold "a*b" and `***` is nothing.
    if (part.startsWith('**') && part.endsWith('**')) {
      const bold = part.slice(2, -2);
      if (bold.length > 0) nodes.push({ type: 'text', text: bold, marks: [{ type: 'bold' }] });
    } else {
      nodes.push({ type: 'text', text: part });
    }
  }
  return nodes;
}

function withContent<T extends BlogDocParagraph | BlogDocHeading>(block: T, text: string): T {
  const content = inlineToNodes(text);
  return content.length > 0 ? { ...block, content } : block;
}

export function markdownToDoc(markdown: string): BlogDoc {
  const blocks: BlogDocBlock[] = [];
  let paragraphLines: string[] = [];
  let list: BlogDocList | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(withContent({ type: 'paragraph' }, paragraphLines.join(' ')));
    paragraphLines = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const pushItem = (type: BlogDocList['type'], text: string) => {
    flushParagraph();
    if (list?.type !== type) flushList();
    list ??= { type, content: [] };
    list.content.push({ type: 'listItem', content: [withContent({ type: 'paragraph' }, text)] });
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    // The renderer's patterns, checked in the renderer's order.
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const ulItem = line.match(/^\*\s+(.*)$/);
    const olItem = line.match(/^\d+\.\s+(.*)$/);
    const heading = h3 ? { level: 3 as const, m: h3 } : h2 ? { level: 2 as const, m: h2 } : h1 ? { level: 1 as const, m: h1 } : null;

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(withContent({ type: 'heading', attrs: { level: heading.level } }, heading.m[1] ?? ''));
    } else if (ulItem) {
      pushItem('bulletList', ulItem[1] ?? '');
    } else if (olItem) {
      pushItem('orderedList', olItem[1] ?? '');
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();
  return { type: 'doc', content: blocks };
}

/** The JSON an editor hands back: the same shape, loosely typed. */
export interface EditorJson {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: EditorJson[];
}

/**
 * Inline content as one renderer line. A line break becomes a space (the
 * renderer joins lines anyway). A bold run that holds a `*` is written
 * without its markers — inside a line `**a*b**` reaches the page as raw
 * asterisks — so the page shows that text plain rather than broken; only a
 * run that is the whole line keeps them, since the renderer bolds that one.
 */
function inlineToMarkdown(nodes: EditorJson[] | undefined): string {
  const runs: { text: string; bold: boolean }[] = [];
  for (const node of nodes ?? []) {
    if (node.type !== 'text' || !node.text) continue;
    const bold = (node.marks ?? []).some((m) => m.type === 'bold');
    const last = runs[runs.length - 1];
    if (last && last.bold === bold) last.text += node.text;
    else runs.push({ text: node.text, bold });
  }
  return runs
    .map(({ text, bold }) => {
      const flat = text.replace(/\s*\n\s*/g, ' ');
      const markable = flat.trim().length > 0 && (!flat.includes('*') || runs.length === 1);
      return bold && markable ? `**${flat}**` : flat;
    })
    .join('')
    .trim();
}

/** Any of the renderer's block patterns: `#`–`###`, `*` or `1.` followed by whitespace. */
const BLOCK_START = /^(?:#{1,3}|\*|\d+\.)\s/;

/**
 * A paragraph whose text starts like a block (`1. Ocak` pasted from Word as a
 * plain paragraph) would come back from the page as that block. There is no
 * escape in the renderer, but it joins paragraph lines with a space and a
 * line with no whitespace in it never matches a block pattern — so the
 * leading marker words go on lines of their own until the rest is safe.
 */
function paragraphToMarkdown(text: string): string {
  const lines: string[] = [];
  let rest = text;
  let m: RegExpMatchArray | null;
  while (BLOCK_START.test(rest) && (m = rest.match(/^(\S+) (\S[\s\S]*)$/))) {
    lines.push(m[1] ?? '');
    rest = m[2] ?? '';
  }
  lines.push(rest);
  return lines.join('\n');
}

function blockToMarkdown(block: EditorJson): string | null {
  switch (block.type) {
    case 'paragraph': {
      const text = inlineToMarkdown(block.content);
      return text.length > 0 ? paragraphToMarkdown(text) : null;
    }
    case 'heading': {
      const text = inlineToMarkdown(block.content);
      const level = Math.min(3, Math.max(1, Number(block.attrs?.level) || 1));
      // An empty `# ` trims to `#`, which the renderer shows as a paragraph.
      return text.length > 0 ? `${'#'.repeat(level)} ${text}` : null;
    }
    case 'bulletList':
    case 'orderedList': {
      const items = (block.content ?? [])
        // A list item is one paragraph in this editor; any other child is read for its text.
        .map((item) => inlineToMarkdown((item.content ?? []).flatMap((child) => child.content ?? [])))
        // An empty `* ` trims to `*`, a paragraph on the page.
        .filter((text) => text.length > 0);
      if (items.length === 0) return null;
      // The page numbers every list from 1, whatever the source said.
      return items.map((text, i) => (block.type === 'bulletList' ? `* ${text}` : `${i + 1}. ${text}`)).join('\n');
    }
    default:
      return null;
  }
}

/** Blocks separated by one blank line, so no two paragraphs or lists run together. */
export function docToMarkdown(doc: EditorJson): string {
  return (doc.content ?? [])
    .map(blockToMarkdown)
    .filter((md): md is string => md !== null)
    .join('\n\n');
}
