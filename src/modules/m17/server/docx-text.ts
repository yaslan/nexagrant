/**
 * Plain text of a .docx, in reading order — paragraphs and table cells as they
 * appear in `word/document.xml` (FO-186).
 *
 * The file is a stranger's upload, so it is read the way src/lib/k3-topic-stats/xlsx.ts
 * reads a workbook: zip signature first, an entry-count cap, `document.xml` inflated
 * under a byte counter that ignores what the archive declares, any `<!DOCTYPE` refused
 * (no entity expansion), only the predefined entities decoded, and one forward
 * `indexOf` pass over the XML so a hostile document cannot make the parse quadratic.
 *
 * Output shape: one line per paragraph; a table row is one line with its cells joined
 * by " | " (a cell's own paragraphs joined by a space); a table nested in a cell is
 * inlined into that cell. Headers, footers, footnotes, comments and deleted
 * (tracked-change) text are not read.
 */
import unzipper from 'unzipper';

import { decodeXmlText } from '@/lib/k3-topic-stats/xlsx';

export type DocxReadErrorCode = 'not_docx' | 'malformed' | 'too_large' | 'too_long';

export class DocxReadError extends Error {
  constructor(
    readonly code: DocxReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocxReadError';
  }
}

export interface DocxLimits {
  /** Bytes `word/document.xml` may inflate to. */
  maxXmlBytes: number;
  maxEntries: number;
  /** Characters of extracted text; one more is `too_long`. */
  maxChars: number;
}

/** A table being read: finished rows, the row in progress, the cell in progress. */
interface TableFrame {
  rows: string[];
  row: string[] | null;
  cell: string[] | null;
}

/**
 * Text of a `word/document.xml` body. Pure; exported for the unit tests.
 * Throws {@link DocxReadError} `too_long` past `maxChars`.
 */
export function documentXmlToText(xml: string, maxChars: number = Number.POSITIVE_INFINITY): string {
  const lines: string[] = [];
  const tables: TableFrame[] = [];
  // Paragraphs nest when a text box sits inside a run; each keeps its own buffer.
  const paragraphs: string[][] = [];
  let tabsDepth = 0; // <w:tabs> holds tab-stop definitions, also spelled <w:tab/>
  let fallbackDepth = 0; // <mc:Fallback> repeats the <mc:Choice> content
  let total = 0;

  const sink = (): string[] => {
    const top = tables[tables.length - 1];
    return top?.cell ?? lines;
  };
  const emit = (target: string[], line: string) => {
    const clean = line.replace(/[ \t]+$/u, '');
    if (clean.trim() === '') return;
    total += clean.length + 1;
    if (total > maxChars) throw new DocxReadError('too_long', `Text passes ${maxChars} characters.`);
    target.push(clean);
  };
  const append = (s: string) => {
    const p = paragraphs[paragraphs.length - 1];
    if (p) p.push(s);
  };

  let pos = 0;
  const n = xml.length;
  while (pos < n) {
    const lt = xml.indexOf('<', pos);
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      pos = end < 0 ? n : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      pos = end < 0 ? n : end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      pos = end < 0 ? n : end + 3;
      continue;
    }
    const gt = xml.indexOf('>', lt + 1);
    if (gt < 0) break;
    pos = gt + 1;

    const closing = xml[lt + 1] === '/';
    const selfClosing = xml[gt - 1] === '/';
    let i = closing ? lt + 2 : lt + 1;
    const nameStart = i;
    while (i < gt) {
      const ch = xml[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '/') break;
      i++;
    }
    const name = xml.slice(nameStart, i);

    if (name === 'mc:Fallback') {
      if (selfClosing) continue;
      fallbackDepth += closing ? -1 : 1;
      if (fallbackDepth < 0) fallbackDepth = 0;
      continue;
    }
    if (fallbackDepth > 0) continue;

    switch (name) {
      case 'w:t': {
        if (closing || selfClosing) break;
        const end = xml.indexOf('<', pos);
        const raw = xml.slice(pos, end < 0 ? n : end);
        append(decodeXmlText(raw));
        pos = end < 0 ? n : end;
        break;
      }
      case 'w:tabs':
        if (!selfClosing) tabsDepth += closing ? -1 : 1;
        if (tabsDepth < 0) tabsDepth = 0;
        break;
      case 'w:tab':
        if (!closing && tabsDepth === 0) append('\t');
        break;
      case 'w:br':
      case 'w:cr':
        if (!closing) append(' ');
        break;
      case 'w:p':
        if (selfClosing) break;
        if (!closing) {
          paragraphs.push([]);
        } else {
          const buf = paragraphs.pop();
          if (buf) emit(sink(), buf.join(''));
        }
        break;
      case 'w:tbl':
        if (selfClosing) break;
        if (!closing) {
          tables.push({ rows: [], row: null, cell: null });
        } else {
          const done = tables.pop();
          if (done) for (const row of done.rows) emit(sink(), row);
        }
        break;
      case 'w:tr': {
        const t = tables[tables.length - 1];
        if (!t || selfClosing) break;
        if (!closing) {
          t.row = [];
        } else if (t.row) {
          const row = t.row.join(' | ');
          if (row.replace(/[\s|]/gu, '') !== '') t.rows.push(row);
          t.row = null;
        }
        break;
      }
      case 'w:tc': {
        const t = tables[tables.length - 1];
        if (!t) break;
        if (selfClosing) {
          t.row?.push('');
        } else if (!closing) {
          t.cell = [];
        } else {
          (t.row ??= []).push((t.cell ?? []).join(' ').trim());
          t.cell = null;
        }
        break;
      }
      default:
        break;
    }
  }
  // An unterminated document still yields what was read.
  for (const buf of paragraphs) emit(sink(), buf.join(''));
  return lines.join('\n');
}

type ZipFile = Awaited<ReturnType<typeof unzipper.Open.buffer>>['files'][number];

/** Inflate one entry, refusing to go past `limit` bytes whatever the entry claims. */
async function readEntry(file: ZipFile, limit: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = file.stream();
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        stream.destroy();
        reject(new DocxReadError('too_large', `${file.path} inflates past ${limit} bytes.`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err: Error) =>
      reject(new DocxReadError('malformed', `${file.path} could not be inflated: ${err.message}`)),
    );
  });
}

/** Whether the bytes start with a zip local-file header (a .docx is a zip). */
export function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Text of a .docx file. Throws {@link DocxReadError} on anything that is not a readable, bounded document. */
export async function readDocxText(bytes: Buffer, limits: DocxLimits): Promise<string> {
  if (!hasZipSignature(bytes)) throw new DocxReadError('not_docx', 'Zip signature missing.');
  let directory: Awaited<ReturnType<typeof unzipper.Open.buffer>>;
  try {
    directory = await unzipper.Open.buffer(bytes);
  } catch (err) {
    throw new DocxReadError('not_docx', `Not a readable zip: ${(err as Error).message}`);
  }
  if (directory.files.length > limits.maxEntries) {
    throw new DocxReadError('too_large', `Archive holds more than ${limits.maxEntries} entries.`);
  }
  const file = directory.files.find((f) => f.path.replace(/^\/+/, '') === 'word/document.xml');
  if (!file) throw new DocxReadError('not_docx', 'No word/document.xml — not a Word document.');
  const xml = (await readEntry(file, limits.maxXmlBytes)).toString('utf8');
  if (/<!DOCTYPE/i.test(xml)) throw new DocxReadError('malformed', 'document.xml declares a DOCTYPE; refused.');
  return documentXmlToText(xml, limits.maxChars);
}
