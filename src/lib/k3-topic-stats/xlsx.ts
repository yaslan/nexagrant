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
 *    a million-row array.
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

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeXmlText(m[2] ?? m[3] ?? '') : null;
}

/** Concatenated text of every `<t>` in a fragment, skipping phonetic (`<rPh>`) runs. */
function textRuns(fragment: string): string {
  const withoutPhonetic = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of withoutPhonetic.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) {
    out += decodeXmlText(m[1] ?? '');
  }
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
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) out.push(textRuns(m[1] ?? ''));
  return out;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let nextRow = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = attr(rm[1] ?? '', 'r');
    const rowIndex = rAttr ? parseInt(rAttr, 10) - 1 : nextRow;
    if (!Number.isFinite(rowIndex) || rowIndex < 0) throw new XlsxReadError('MALFORMED', `Bad row reference "${rAttr}".`);
    if (rowIndex >= XLSX_LIMITS.maxRows) {
      throw new XlsxReadError('TOO_LARGE', `Sheet has more than ${XLSX_LIMITS.maxRows} rows.`);
    }
    nextRow = rowIndex + 1;

    const cells: string[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = cm[1] ?? '';
      const ref = attr(head, 'r');
      const letters = ref ? /^([A-Z]{1,3})/.exec(ref)?.[1] : undefined;
      const col = letters ? columnNumber(letters) - 1 : nextCol;
      nextCol = col + 1;
      if (col >= XLSX_LIMITS.maxColumns) continue; // far-right junk is ignored, not allocated

      const body = cm[2] ?? '';
      const type = attr(head, 't');
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') {
        const idx = v === undefined ? NaN : parseInt(v, 10);
        value = Number.isInteger(idx) && idx >= 0 && idx < shared.length ? shared[idx]! : '';
      } else if (type === 'inlineStr') {
        const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1];
        value = is ? textRuns(is) : '';
      } else if (type === 'b') {
        value = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
      } else {
        // 'n', 'str' (formula result), 'e' (error text such as #N/A) and untyped cells.
        value = v === undefined ? '' : decodeXmlText(v);
      }
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
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) targets.set(id, resolveTarget(target));
  }

  const sharedXml = await readPart('xl/sharedStrings.xml');
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  const sheets: XlsxSheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name') ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], 'r:id');
    const path = (rid && targets.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await readPart(path);
    if (xml === null) continue; // chart sheets and dangling references have no cell grid
    sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  if (sheets.length === 0) throw new XlsxReadError('MALFORMED', 'Workbook has no readable worksheet.');
  return sheets;
}
