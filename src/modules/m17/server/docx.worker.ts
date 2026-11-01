/**
 * The body of the DOCX reading thread (FO-195 Ö1).
 *
 * `readDocxText` (./docx-text.ts) runs this in a `worker_threads` Worker, never on
 * the web server's own thread. The XML of a stranger's upload is walked by one
 * synchronous loop, and a flat hostile document under the 20 MB cap (1.5 M empty
 * `<w:p></w:p>`, 2.7 M `<w:tc/>`, …) is 30–50 KB on disk and held that loop for
 * hundreds of milliseconds to seconds (se-fb re-review of FO-186, Ö1), whatever the
 * nesting cap says: every other request of every tenant waited behind one upload.
 * Here it only holds this thread, which the caller terminates at its deadline or
 * when its heap ceiling is hit.
 *
 * Everything that touches the file's bytes happens here: zip directory, inflating
 * `word/document.xml` under a byte counter, the DOCTYPE refusal and the XML walk.
 * The main thread gets back the text or a refusal code, nothing else.
 *
 * Self-contained on purpose, as src/lib/rag-pdf.worker.ts: it imports only Node
 * built-ins and `unzipper`, and takes its limits from `workerData`, so it runs the
 * same bundled by Next.js and loaded as a plain `.ts` file by Node in the tests.
 * Erasable TypeScript only (no enums, no parameter properties). That is why
 * {@link decodeXmlText} is a copy of the one in src/lib/k3-topic-stats/xlsx.ts
 * (an `@/` import does not resolve here); tests/m17-interreg-extract.test.ts
 * checks the two agree.
 */
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import unzipper from 'unzipper';

export type DocxRefusalCode = 'not_docx' | 'malformed' | 'too_large' | 'too_long';

export interface DocxWorkerInput {
  bytes: Uint8Array;
  limits: {
    /** Bytes `word/document.xml` may inflate to. */
    maxXmlBytes: number;
    maxEntries: number;
    /** Characters of extracted text; one more is `too_long`. */
    maxChars: number;
    /** Tables in tables, or paragraphs in paragraphs, deeper than this are `malformed`. */
    maxNesting: number;
  };
}

export type DocxWorkerOutput =
  | { kind: 'ok'; text: string }
  | { kind: 'refused'; code: DocxRefusalCode; message: string }
  | { kind: 'error'; message: string };

/** A refusal with the code the caller maps to an API error. Thrown only inside this file's functions. */
export class DocxRefusal extends Error {
  readonly code: DocxRefusalCode;
  constructor(code: DocxRefusalCode, message: string) {
    super(message);
    this.name = 'DocxRefusal';
    this.code = code;
  }
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decodes the predefined XML entities and numeric references; anything else stays literal. */
export function decodeXmlText(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ENTITY[ent] ?? '';
  });
}

/** A table being read: finished rows, the row in progress, the cell in progress. */
interface TableFrame {
  rows: string[];
  row: string[] | null;
  cell: string[] | null;
}

/**
 * Text of a `word/document.xml` body. Pure. Throws {@link DocxRefusal} `too_long`
 * past `maxChars`, `malformed` past `maxNesting`.
 */
export function parseDocumentXml(xml: string, maxChars: number, maxNesting: number): string {
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
    if (total > maxChars) throw new DocxRefusal('too_long', `Text passes ${maxChars} characters.`);
    target.push(clean);
  };
  const tooDeep = (what: string) =>
    new DocxRefusal('malformed', `${what} nested deeper than ${maxNesting}; refused.`);
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
          if (paragraphs.length >= maxNesting) throw tooDeep('Paragraphs');
          paragraphs.push([]);
        } else {
          const buf = paragraphs.pop();
          if (buf) emit(sink(), buf.join(''));
        }
        break;
      case 'w:tbl':
        if (selfClosing) break;
        if (!closing) {
          if (tables.length >= maxNesting) throw tooDeep('Tables');
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
function readEntry(file: ZipFile, limit: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = file.stream();
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        stream.destroy();
        reject(new DocxRefusal('too_large', `${file.path} inflates past ${limit} bytes.`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err: Error) =>
      reject(new DocxRefusal('malformed', `${file.path} could not be inflated: ${err.message}`)),
    );
  });
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** The whole read: zip directory, `word/document.xml` inflated under a counter, DOCTYPE refused, XML walked. */
export async function readDocx(bytes: Uint8Array, limits: DocxWorkerInput['limits']): Promise<string> {
  if (!hasZipSignature(bytes)) throw new DocxRefusal('not_docx', 'Zip signature missing.');
  let directory: Awaited<ReturnType<typeof unzipper.Open.buffer>>;
  try {
    directory = await unzipper.Open.buffer(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch (err) {
    throw new DocxRefusal('not_docx', `Not a readable zip: ${(err as Error).message}`);
  }
  if (directory.files.length > limits.maxEntries) {
    throw new DocxRefusal('too_large', `Archive holds more than ${limits.maxEntries} entries.`);
  }
  const file = directory.files.find((f) => f.path.replace(/^\/+/, '') === 'word/document.xml');
  if (!file) throw new DocxRefusal('not_docx', 'No word/document.xml — not a Word document.');
  const xml = (await readEntry(file, limits.maxXmlBytes)).toString('utf8');
  if (/<!DOCTYPE/i.test(xml)) throw new DocxRefusal('malformed', 'document.xml declares a DOCTYPE; refused.');
  return parseDocumentXml(xml, limits.maxChars, limits.maxNesting);
}

// Imported on the main thread only for `parseDocumentXml` / `decodeXmlText`: there is no parent port then.
if (!isMainThread && parentPort) {
  const input = workerData as DocxWorkerInput;
  const port = parentPort;
  readDocx(input.bytes, input.limits).then(
    (text) => port.postMessage({ kind: 'ok', text } satisfies DocxWorkerOutput),
    (err: unknown) =>
      port.postMessage(
        err instanceof DocxRefusal
          ? ({ kind: 'refused', code: err.code, message: err.message } satisfies DocxWorkerOutput)
          : ({ kind: 'error', message: err instanceof Error ? err.message : String(err) } satisfies DocxWorkerOutput),
      ),
  );
}
