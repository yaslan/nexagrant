/**
 * Minimal, bounded `.xlsx` reader for the K3 Horizon Dashboard import (TASK-MULQKV3BJT6VM).
 *
 * Why not a spreadsheet library: the project had none, and a new dependency here needs a
 * lockfile change the card forbids without the lead's sign-off. An `.xlsx` is a zip of a few
 * XML parts, and `unzipper` is already a dependency (K2 CORDIS importer), so this reads the
 * three parts it needs — workbook, relationships, shared strings — and each worksheet's cells.
 * It returns cell *values* as text; formatting, formulas and dates are out of scope.
 *
 * The input is an uploaded file, so the reader is written against hostile bytes:
 *
 *  - **Zip bomb.** Every part is inflated through a byte counter and abandoned the moment it
 *    passes its cap. The declared `uncompressedSize` in the central directory is attacker-set
 *    and is not trusted.
 *  - **XML entity expansion / XXE.** No XML parser runs here, so no DTD is ever resolved; a part
 *    that declares a `<!DOCTYPE` is refused outright, and only the five predefined entities and
 *    numeric character references are decoded.
 *  - **Size.** Rows and columns are capped, so a sheet that claims `XFD1048576` cannot allocate
 *    a million-row array; every row and padded cell slot is charged to one workbook-wide budget,
 *    and a worksheet part that several `<sheet>` entries point at is read and parsed once.
 *  - **Time.** No backtracking regex runs over a whole part. Elements are found by an `indexOf`
 *    cursor that only moves forward, and an element whose close tag is missing is refused as
 *    MALFORMED after one search, so the scan stays linear in the part's size
 *    (TASK-MUM187B5EN9LZ: 160 000 unclosed `<row>` used to take ~35 s).
 */
import unzipper from 'unzipper';

export const XLSX_LIMITS = {
  /** Upload cap, checked by the route before the bytes get here and again here. */
  maxFileBytes: 10 * 1024 * 1024,
  maxEntries: 2_000,
  /** Inflated size of any one part. */
  maxPartBytes: 50 * 1024 * 1024,
  /** Inflated size of all parts read, together. */
  maxTotalBytes: 120 * 1024 * 1024,
  maxRows: 100_000,
  maxColumns: 200,
  /** Row slots plus (padded) cell slots allocated across all worksheets, together. */
  maxCells: 2_000_000,
  maxSharedStrings: 1_000_000,
  /** A real start tag is a few hundred bytes; a longer one is not a spreadsheet. */
  maxTagBytes: 16 * 1024,
} as const;

export class XlsxReadError extends Error {
  readonly code: 'NOT_XLSX' | 'TOO_LARGE' | 'MALFORMED';

  constructor(code: XlsxReadError['code'], message: string) {
    super(message);
    this.name = 'XlsxReadError';
    this.code = code;
  }
}

export interface XlsxSheet {
  name: string;
  /** Row-major cell text; `rows[r][c]`, missing cells are `''`. Row index is 0-based. */
  rows: string[][];
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
        reject(new XlsxReadError('TOO_LARGE', `Part ${file.path} inflates past ${limit} bytes.`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err: Error) =>
      reject(new XlsxReadError('MALFORMED', `Part ${file.path} could not be inflated: ${err.message}`)),
    );
  });
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

const isSpace = (ch: string | undefined) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

/**
 * Value of attribute `name` in a start tag's attribute text, read in one forward pass.
 * (A regex here re-scans to the end for every unclosed quote, so it goes quadratic.)
 */
function attr(head: string, name: string): string | null {
  let i = 0;
  while (i < head.length) {
    while (i < head.length && isSpace(head[i])) i++;
    const nameStart = i;
    while (i < head.length && head[i] !== '=' && !isSpace(head[i])) i++;
    const key = head.slice(nameStart, i);
    while (i < head.length && isSpace(head[i])) i++;
    if (head[i] !== '=') {
      if (i === nameStart) i++; // stray character, step over it
      continue;
    }
    i++;
    while (i < head.length && isSpace(head[i])) i++;
    const quote = head[i];
    if (quote !== '"' && quote !== "'") continue;
    const close = head.indexOf(quote, i + 1);
    if (close < 0) return null;
    if (key === name) return decodeXmlText(head.slice(i + 1, close));
    i = close + 1;
  }
  return null;
}

interface XmlElement {
  /** Attribute text of the start tag, without the tag name and a self-closing `/`. */
  head: string;
  /** Text between the start and end tag; `null` for a self-closing element. */
  body: string | null;
}

/**
 * Every `<tag …>…</tag>` and `<tag …/>` in `xml`, in order, found with a forward-only cursor.
 * Like the lazy regex it replaces, the body ends at the first `</tag>` (no nesting), but a
 * missing `</tag>` or `>` is one failed search and a MALFORMED error, never a re-scan per
 * opening tag.
 */
function* elements(xml: string, tag: string): Generator<XmlElement> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let pos = 0;
  for (;;) {
    const at = xml.indexOf(open, pos);
    if (at < 0) return;
    const after = xml[at + open.length];
    if (!(after === '>' || after === '/' || isSpace(after))) {
      pos = at + open.length; // <rowBreaks>, <cols> … — a longer name, not this tag
      continue;
    }
    const gt = xml.indexOf('>', at + open.length);
    if (gt < 0) throw new XlsxReadError('MALFORMED', `<${tag}> start tag is never closed.`);
    if (gt - at > XLSX_LIMITS.maxTagBytes) {
      throw new XlsxReadError('MALFORMED', `<${tag}> start tag is longer than ${XLSX_LIMITS.maxTagBytes} bytes.`);
    }
    if (xml[gt - 1] === '/') {
      yield { head: xml.slice(at + open.length, gt - 1), body: null };
      pos = gt + 1;
      continue;
    }
    const end = xml.indexOf(close, gt + 1);
    if (end < 0) throw new XlsxReadError('MALFORMED', `<${tag}> has no matching ${close}.`);
    yield { head: xml.slice(at + open.length, gt), body: xml.slice(gt + 1, end) };
    pos = end + close.length;
  }
}

function firstElement(xml: string, tag: string): XmlElement | undefined {
  for (const el of elements(xml, tag)) return el;
  return undefined;
}

/** Concatenated text of every `<t>` in a fragment, skipping phonetic (`<rPh>`) runs. */
function textRuns(fragment: string): string {
  let out = '';
  let rest = fragment;
  // Phonetic runs hold their own <t>; cut them out segment by segment, in one pass.
  for (;;) {
    const at = rest.indexOf('<rPh');
    if (at < 0) break;
    const end = rest.indexOf('</rPh>', at);
    if (end < 0) throw new XlsxReadError('MALFORMED', '<rPh> has no matching </rPh>.');
    for (const t of elements(rest.slice(0, at), 't')) out += decodeXmlText(t.body ?? '');
    rest = rest.slice(end + '</rPh>'.length);
  }
  for (const t of elements(rest, 't')) out += decodeXmlText(t.body ?? '');
  return out;
}

/** "AB" → 27 (1-based). */
function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of elements(xml, 'si')) {
    if (out.length >= XLSX_LIMITS.maxSharedStrings) {
      throw new XlsxReadError('TOO_LARGE', `Workbook has more than ${XLSX_LIMITS.maxSharedStrings} shared strings.`);
    }
    out.push(si.body === null ? '' : textRuns(si.body));
  }
  return out;
}

/** Row and cell slots still allowed across the workbook; `charge` throws once it runs out. */
interface CellBudget {
  left: number;
}

function charge(budget: CellBudget, slots: number): void {
  budget.left -= slots;
  if (budget.left < 0) {
    throw new XlsxReadError('TOO_LARGE', `Workbook allocates more than ${XLSX_LIMITS.maxCells} row and cell slots.`);
  }
}

function parseSheet(xml: string, shared: string[], budget: CellBudget): string[][] {
  const rows: string[][] = [];
  let nextRow = 0;
  for (const row of elements(xml, 'row')) {
    const rAttr = attr(row.head, 'r');
    const rowIndex = rAttr ? parseInt(rAttr, 10) - 1 : nextRow;
    if (!Number.isFinite(rowIndex) || rowIndex < 0) throw new XlsxReadError('MALFORMED', `Bad row reference "${rAttr}".`);
    if (rowIndex >= XLSX_LIMITS.maxRows) {
      throw new XlsxReadError('TOO_LARGE', `Sheet has more than ${XLSX_LIMITS.maxRows} rows.`);
    }
    nextRow = rowIndex + 1;
    // Holes up to this row become empty rows below, so they are paid for now.
    if (rowIndex >= rows.length) charge(budget, rowIndex + 1 - rows.length);

    const cells: string[] = [];
    let nextCol = 0;
    for (const c of elements(row.body ?? '', 'c')) {
      const ref = attr(c.head, 'r');
      const letters = ref ? /^([A-Z]{1,3})/.exec(ref)?.[1] : undefined;
      const col = letters ? columnNumber(letters) - 1 : nextCol;
      nextCol = col + 1;
      if (col >= XLSX_LIMITS.maxColumns) continue; // far-right junk is ignored, not allocated

      const body = c.body ?? '';
      const type = attr(c.head, 't');
      const v = firstElement(body, 'v')?.body ?? undefined;
      let value = '';
      if (type === 's') {
        const idx = v === undefined ? NaN : parseInt(v, 10);
        value = Number.isInteger(idx) && idx >= 0 && idx < shared.length ? shared[idx]! : '';
      } else if (type === 'inlineStr') {
        const is = firstElement(body, 'is')?.body;
        value = is ? textRuns(is) : '';
      } else if (type === 'b') {
        value = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
      } else {
        // 'n', 'str' (formula result), 'e' (error text such as #N/A) and untyped cells.
        value = v === undefined ? '' : decodeXmlText(v);
      }
      // Padding to a far column is allocation too: 200 columns × every row is the memory bomb.
      if (col >= cells.length) charge(budget, col + 1 - cells.length);
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rows[rowIndex] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

function resolveTarget(target: string): string {
  const t = target.replace(/\\/g, '/');
  if (t.startsWith('/')) return t.slice(1);
  const parts = `xl/${t}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/**
 * Reads every worksheet of an `.xlsx`, in workbook order.
 * Throws {@link XlsxReadError} on anything that is not a readable, bounded workbook.
 */
export async function readXlsx(bytes: Buffer): Promise<XlsxSheet[]> {
  if (bytes.length > XLSX_LIMITS.maxFileBytes) {
    throw new XlsxReadError('TOO_LARGE', `File is larger than ${XLSX_LIMITS.maxFileBytes} bytes.`);
  }
  // Local file header magic. A renamed .xls (OLE2) or CSV stops here with a clear answer.
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) {
    throw new XlsxReadError('NOT_XLSX', 'File is not an .xlsx workbook (zip signature missing).');
  }

  let directory: Awaited<ReturnType<typeof unzipper.Open.buffer>>;
  try {
    directory = await unzipper.Open.buffer(bytes);
  } catch (err) {
    throw new XlsxReadError('NOT_XLSX', `File is not a readable zip: ${(err as Error).message}`);
  }
  if (directory.files.length > XLSX_LIMITS.maxEntries) {
    throw new XlsxReadError('TOO_LARGE', `Archive holds more than ${XLSX_LIMITS.maxEntries} entries.`);
  }

  const byPath = new Map(directory.files.map((f) => [f.path.replace(/^\/+/, ''), f]));
  let budget: number = XLSX_LIMITS.maxTotalBytes;
  const readPart = async (path: string): Promise<string | null> => {
    const file = byPath.get(path);
    if (!file) return null;
    const buf = await readEntry(file, Math.min(XLSX_LIMITS.maxPartBytes, budget));
    budget -= buf.length;
    const xml = buf.toString('utf8');
    if (/<!DOCTYPE/i.test(xml)) throw new XlsxReadError('MALFORMED', `Part ${path} declares a DOCTYPE; refused.`);
    return xml;
  };

  const workbook = await readPart('xl/workbook.xml');
  if (workbook === null) throw new XlsxReadError('NOT_XLSX', 'Archive has no xl/workbook.xml — not an .xlsx workbook.');

  const rels = (await readPart('xl/_rels/workbook.xml.rels')) ?? '';
  const targets = new Map<string, string>();
  for (const rel of elements(rels, 'Relationship')) {
    const id = attr(rel.head, 'Id');
    const target = attr(rel.head, 'Target');
    if (id && target) targets.set(id, resolveTarget(target));
  }

  const sharedXml = await readPart('xl/sharedStrings.xml');
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  const sheets: XlsxSheet[] = [];
  const cellBudget: CellBudget = { left: XLSX_LIMITS.maxCells };
  // Several <sheet> entries may name the same part; it is inflated and parsed once and the
  // entries share the grid, so repeating a sheet costs neither bytes nor cells.
  const parsed = new Map<string, string[][] | null>();
  for (const el of elements(workbook, 'sheet')) {
    const name = attr(el.head, 'name') ?? `Sheet${sheets.length + 1}`;
    const rid = attr(el.head, 'r:id');
    const path = (rid && targets.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    if (!parsed.has(path)) {
      const xml = await readPart(path);
      parsed.set(path, xml === null ? null : parseSheet(xml, shared, cellBudget));
    }
    const rows = parsed.get(path);
    if (!rows) continue; // chart sheets and dangling references have no cell grid
    sheets.push({ name, rows });
  }
  if (sheets.length === 0) throw new XlsxReadError('MALFORMED', 'Workbook has no readable worksheet.');
  return sheets;
}
