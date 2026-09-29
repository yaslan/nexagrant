/**
 * Builds real `.xlsx` bytes for tests (TASK-MULQKV3BJT6VM) — a zip of the OOXML parts the K3
 * reader looks at, written with node:zlib so no spreadsheet library is needed.
 *
 * Cells: a string goes to sharedStrings (`t="s"`), a number is a numeric cell, `null` is omitted,
 * and `{ inline: 'x' }` is an inline string — the three shapes real exports use.
 */
import zlib from 'node:zlib';

export type FixtureCell = string | number | null | { inline: string };

interface Entry {
  name: string;
  data: Buffer;
  /** Store uncompressed (method 0) instead of deflate. */
  stored?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colLetters(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const body = e.stored ? e.data : zlib.deflateRawSync(e.data);
    const crc = zlib.crc32(e.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(e.stored ? 0 : 8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(e.stored ? 0 : 8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export function sheetXml(rows: FixtureCell[][], shared: string[]): string {
  const index = new Map<string, number>();
  const sst = (s: string) => {
    if (!index.has(s)) {
      index.set(s, shared.length);
      shared.push(s);
    }
    return index.get(s)!;
  };
  const body = rows
    .map((cells, r) => {
      const cs = cells
        .map((c, i) => {
          const ref = `${colLetters(i)}${r + 1}`;
          if (c === null) return '';
          if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`;
          if (typeof c === 'object') return `<c r="${ref}" t="inlineStr"><is><t>${esc(c.inline)}</t></is></c>`;
          return `<c r="${ref}" t="s"><v>${sst(c)}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** One workbook, one or more sheets, in the given order. */
export function buildXlsx(sheets: { name: string; rows: FixtureCell[][] }[], extra: Entry[] = []): Buffer {
  const shared: string[] = [];
  const sheetParts = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s.rows, shared)) }));
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('')}</Relationships>`;
  const sst = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
    .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
    .join('')}</sst>`;
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(rels) },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sst) },
    ...sheetParts,
    ...extra,
  ]);
}
