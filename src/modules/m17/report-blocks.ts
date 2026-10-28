/**
 * The M17 report Markdown (FO-188 `buildReportMarkdown`) → plain blocks the
 * report screen renders as React elements (FO-189). Never HTML: the report
 * quotes the user's own project file, so nothing in it is ever interpreted as
 * markup — every string ends up a React text node.
 *
 * It reads exactly the subset report.ts writes: `## ` sections, `### `
 * headings, `- ` items with `  - ` children, `| … |` tables, `> ` quotes and
 * paragraphs. Anything else is a paragraph. Pure, so it is unit-tested against
 * a report built by the real generator's shape.
 */

export type ReportBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: { text: string; children: string[] }[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'quote'; lines: string[] };

export interface ReportSection {
  title: string;
  blocks: ReportBlock[];
}

/** Cells of one `| a | b |` row; `\|` inside a cell is a literal pipe. */
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

const isSeparatorRow = (line: string) => /^\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim());

/**
 * The sections of the report, in order. Text before the first `## ` (the
 * assessment notice) is not a section: the screen prints its own notice.
 */
export function parseReportSections(markdown: string): ReportSection[] {
  const sections: ReportSection[] = [];
  let current: ReportSection | null = null;
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

  const last = () => current?.blocks[current.blocks.length - 1];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), blocks: [] };
      sections.push(current);
      continue;
    }
    if (!current || line.trim() === '') continue;

    if (line.startsWith('### ')) {
      current.blocks.push({ type: 'heading', text: line.slice(4).trim() });
      continue;
    }
    if (line.trimStart().startsWith('|')) {
      const next = lines[i + 1] ?? '';
      if (isSeparatorRow(next)) {
        const table: ReportBlock = { type: 'table', header: cells(line), rows: [] };
        i++;
        while (i + 1 < lines.length && (lines[i + 1] ?? '').trimStart().startsWith('|')) {
          i++;
          table.rows.push(cells(lines[i] ?? ''));
        }
        current.blocks.push(table);
        continue;
      }
    }
    const child = /^\s{2,}- (.*)$/.exec(line);
    if (child) {
      const prev = last();
      if (prev?.type === 'list' && prev.items.length) {
        prev.items[prev.items.length - 1]!.children.push(child[1] ?? '');
        continue;
      }
    }
    if (line.startsWith('- ')) {
      const prev = last();
      const item = { text: line.slice(2), children: [] };
      if (prev?.type === 'list') prev.items.push(item);
      else current.blocks.push({ type: 'list', items: [item] });
      continue;
    }
    if (line.startsWith('>')) {
      const text = line.replace(/^>\s?/, '');
      const prev = last();
      // Consecutive quote lines are one quote; a blank line ends it (skipped above, so
      // check the source line before this one).
      if (prev?.type === 'quote' && (lines[i - 1] ?? '').startsWith('>')) prev.lines.push(text);
      else current.blocks.push({ type: 'quote', lines: [text] });
      continue;
    }
    current.blocks.push({ type: 'paragraph', text: line.trim() });
  }
  return sections;
}

export type InlineToken = { kind: 'text' | 'strong' | 'em'; text: string };

/**
 * `**bold**` anywhere and a leading `_italic_` (report.ts writes both, nothing
 * else). An unmatched marker stays literal text.
 */
export function inlineTokens(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let rest = text;
  const lead = /^_([^_]+)_/.exec(rest);
  if (lead) {
    out.push({ kind: 'em', text: lead[1] ?? '' });
    rest = rest.slice(lead[0].length);
  }
  const re = /\*\*([^*]+)\*\*/g;
  let at = 0;
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    if (m.index > at) out.push({ kind: 'text', text: rest.slice(at, m.index) });
    out.push({ kind: 'strong', text: m[1] ?? '' });
    at = m.index + m[0].length;
  }
  if (at < rest.length) out.push({ kind: 'text', text: rest.slice(at) });
  return out;
}
