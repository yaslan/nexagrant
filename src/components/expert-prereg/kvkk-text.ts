/**
 * FO-20 — the KVKK notice of the expert pre-registration form lives in
 * content/kvkk-uzman-v<N>*.md so a lawyer can edit prose without touching code.
 * The repo has no Markdown dependency and the notice needs only headings,
 * paragraphs and bullet lists, so this reads that subset and nothing more.
 * Pure: the file is read by kvkk-text.server.ts.
 */
export type KvkkBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

export function parseKvkkMarkdown(source: string): KvkkBlock[] {
  const blocks: KvkkBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    if (list) blocks.push({ kind: 'list', items: list });
    paragraph = [];
    list = null;
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('# ')) {
      flush();
      blocks.push({ kind: 'title', text: line.slice(2).trim() });
    } else if (line.startsWith('- ')) {
      if (paragraph.length > 0) flush();
      (list ??= []).push(line.slice(2).trim());
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
