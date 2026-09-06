import React from 'react';

/**
 * Minimal Markdown renderer for the legal documents shipped in `docs/legal/`.
 *
 * It emits React elements rather than HTML strings, so no `dangerouslySetInnerHTML`
 * is involved and the documents cannot inject markup. It covers exactly the
 * subset those files use: headings, paragraphs, bullet lists, pipe tables and
 * inline bold/code.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold** and `code`, keeping the delimiters in the result.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  parts.forEach((part, index) => {
    if (!part) return;
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-ground border border-border text-[0.85em] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<React.Fragment key={key}>{part}</React.Fragment>);
    }
  });

  return nodes;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

const isTableSeparator = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());

export function MarkdownView({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: React.ReactNode[] = [];

  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      index++;
      continue;
    }

    // Headings
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={key++} className="text-xl font-bold text-ink mt-8 mb-3">
          {renderInline(trimmed.slice(3), `h2-${key}`)}
        </h2>
      );
      index++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={key++} className="text-3xl font-bold font-heading text-ink mb-6">
          {renderInline(trimmed.slice(2), `h1-${key}`)}
        </h1>
      );
      index++;
      continue;
    }

    // Pipe table: header row, separator row, then body rows
    if (trimmed.startsWith('|') && isTableSeparator(lines[index + 1]?.trim() ?? '')) {
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        rows.push(splitRow((lines[index] ?? '').trim()));
        index++;
      }

      blocks.push(
        <div key={key++} className="overflow-x-auto my-6">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead className="bg-ground">
              <tr>
                {header.map((cell, i) => (
                  <th key={i} className="text-left font-semibold text-ink px-3 py-2 border-b border-border">
                    {renderInline(cell, `th-${key}-${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 align-top text-ink-2">
                      {renderInline(cell, `td-${key}-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Bullet list
    if (trimmed.startsWith('- ')) {
      const items: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('- ')) {
        items.push((lines[index] ?? '').trim().slice(2));
        index++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-6 space-y-1.5 my-4 text-ink-2">
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph: consume until a blank line or a block starter
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = (lines[index] ?? '').trim();
      if (!current || current.startsWith('#') || current.startsWith('- ') || current.startsWith('|')) break;
      paragraph.push(current);
      index++;
    }
    blocks.push(
      <p key={key++} className="my-4 leading-relaxed text-ink-2">
        {renderInline(paragraph.join(' '), `p-${key}`)}
      </p>
    );
  }

  return <>{blocks}</>;
}
