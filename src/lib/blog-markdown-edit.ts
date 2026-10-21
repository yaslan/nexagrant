/**
 * Pure text editing operations for the blog markdown editor.
 * Takes the textarea value, start index, and end index, and returns
 * the updated value and new selection positions.
 */

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export type BlockKind = 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote';

const BLOCK_PREFIX = /^(#{1,3}\s+|\*\s+|\d+\.\s+|>\s*)/;

function prefixFor(kind: BlockKind, index: number): string {
  switch (kind) {
    case 'h1':
      return '# ';
    case 'h2':
      return '## ';
    case 'h3':
      return '### ';
    case 'ul':
      return '* ';
    case 'ol':
      return `${index + 1}. `;
    case 'quote':
      return '> ';
  }
}

function kindOf(line: string): BlockKind | null {
  if (/^###\s+/.test(line)) return 'h3';
  if (/^##\s+/.test(line)) return 'h2';
  if (/^#\s+/.test(line)) return 'h1';
  if (/^\*\s+/.test(line)) return 'ul';
  if (/^\d+\.\s+/.test(line)) return 'ol';
  if (/^>\s*/.test(line)) return 'quote';
  return null;
}

/**
 * Wraps selection in `**`, or unwraps it if already bold.
 * If nothing is selected, inserts `****` with caret in the middle.
 */
export function toggleBold(value: string, start: number, end: number): TextEdit {
  const selected = value.slice(start, end);

  if (selected.length >= 4 && selected.startsWith('**') && selected.endsWith('**')) {
    const inner = selected.slice(2, -2);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  if (value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**') {
    return {
      value: value.slice(0, start - 2) + selected + value.slice(end + 2),
      selectionStart: start - 2,
      selectionEnd: end - 2,
    };
  }

  return {
    value: `${value.slice(0, start)}**${selected}**${value.slice(end)}`,
    selectionStart: start + 2,
    selectionEnd: end + 2,
  };
}

/**
 * Wraps selection in `*`, or unwraps it if already italic.
 * If nothing is selected, inserts `**` with caret in the middle.
 */
export function toggleItalic(value: string, start: number, end: number): TextEdit {
  const selected = value.slice(start, end);

  if (
    selected.length >= 2 &&
    selected.startsWith('*') &&
    selected.endsWith('*') &&
    !selected.startsWith('**')
  ) {
    const inner = selected.slice(1, -1);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  if (
    value.slice(start - 1, start) === '*' &&
    value.slice(end, end + 1) === '*' &&
    value.slice(start - 2, start) !== '**'
  ) {
    return {
      value: value.slice(0, start - 1) + selected + value.slice(end + 1),
      selectionStart: start - 1,
      selectionEnd: end - 1,
    };
  }

  return {
    value: `${value.slice(0, start)}*${selected}*${value.slice(end)}`,
    selectionStart: start + 1,
    selectionEnd: end + 1,
  };
}

/**
 * Toggles line block prefix (heading, list, quote).
 * Replaces existing block prefix, or removes it if already matching.
 */
export function toggleBlock(value: string, start: number, end: number, kind: BlockKind): TextEdit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const lastIndex = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextNewline = value.indexOf('\n', lastIndex);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;

  const lines = value.slice(lineStart, lineEnd).split('\n');
  const filled = lines.filter((line) => line.trim().length > 0);
  const removing = filled.length > 0 && filled.every((line) => kindOf(line.trimStart()) === kind);

  let index = 0;
  const edited = lines
    .map((line) => {
      const text = line.trimStart();
      if (text.length === 0) return line;
      const bare = text.replace(BLOCK_PREFIX, '');
      return removing ? bare : prefixFor(kind, index++) + bare;
    })
    .join('\n');

  return {
    value: value.slice(0, lineStart) + edited + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + edited.length,
  };
}

/**
 * Inserts markdown link: `[text](url)`
 */
export function insertLink(
  value: string,
  start: number,
  end: number,
  url: string,
  text?: string
): TextEdit {
  const selected = value.slice(start, end);
  const linkText = text?.trim() || selected.trim() || 'Bağlantı';
  const cleanUrl = url.trim();
  const md = `[${linkText}](${cleanUrl})`;
  const nextValue = value.slice(0, start) + md + value.slice(end);
  const newEnd = start + md.length;

  return {
    value: nextValue,
    selectionStart: start,
    selectionEnd: newEnd,
  };
}

/**
 * Inserts markdown image: `![alt](url)`
 */
export function insertImage(
  value: string,
  start: number,
  end: number,
  url: string,
  alt?: string
): TextEdit {
  const altText = alt?.trim() || '';
  const cleanUrl = url.trim();

  const before = value.slice(0, start);
  const after = value.slice(end);

  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n\n');
  const leading = needsLeadingNewline ? (before.endsWith('\n') ? '\n' : '\n\n') : '';

  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n\n');
  const trailing = needsTrailingNewline ? (after.startsWith('\n') ? '\n' : '\n\n') : '';

  const md = `${leading}![${altText}](${cleanUrl})${trailing}`;
  const nextValue = before + md + after;
  const newPos = start + md.length;

  return {
    value: nextValue,
    selectionStart: newPos,
    selectionEnd: newPos,
  };
}
