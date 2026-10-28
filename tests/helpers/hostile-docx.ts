/**
 * Hostile .docx files for the M17 extractor tests (FO-195 Ö1, FO-186 se-fb B3).
 *
 * The package that writes real Word files will not write these, so each is a zip
 * built here from a hand-written `word/document.xml`. All stay under the 20 MB XML
 * cap, are a few dozen KB on disk (deflate), and are NOT nested: the depth cap does
 * not see them, which is exactly what the CPU bound has to catch.
 */
import { crc32, deflateRawSync } from 'node:zlib';

/** A single-entry zip; `deflate` compresses the entry (method 8) for the small-file / huge-XML cases. */
export function zipOf(entries: Record<string, string>, deflate = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const plain = Buffer.from(content, 'utf8');
    const data = deflate ? deflateRawSync(plain) : plain;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(plain);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export const documentXml = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${inner}</w:body></w:document>`;

/** Repeats `unit` until the body is about `xmlBytes` long. */
function repeated(unit: string, xmlBytes: number, prefix = '', suffix = ''): string {
  return documentXml(prefix + unit.repeat(Math.floor(xmlBytes / unit.length)) + suffix);
}

const MB = 1024 * 1024;

/**
 * The four flat shapes of se-fb's re-review (TASK-MVRIV9LCDHYKO, Ö1). Names are
 * hers; sizes are the XML she measured (17–19 MB), none over the 20 MB cap.
 */
export const HOSTILE_FLAT = {
  /** ~1.5 M empty paragraphs (34 KB on disk). */
  para19: () => zipOf({ 'word/document.xml': repeated('<w:p></w:p>', 17 * MB) }, true),
  /** One row, ~2.7 M empty cells (28 KB on disk). */
  wide19: () =>
    zipOf({ 'word/document.xml': repeated('<w:tc/>', 19 * MB, '<w:tbl><w:tr>', '</w:tr></w:tbl>') }, true),
  /** ~1.2 M tables in a row, none inside another (38 KB on disk). */
  seqtbl19: () => zipOf({ 'word/document.xml': repeated('<w:tbl></w:tbl>', 19 * MB) }, true),
  /** One table, ~1 M rows of one empty cell (47 KB on disk). */
  rows19: () =>
    zipOf(
      { 'word/document.xml': repeated('<w:tr><w:tc></w:tc></w:tr>', 19 * MB, '<w:tbl>', '</w:tbl>') },
      true,
    ),
} as const;

/** A normal 80-page application: ~5 000 paragraphs, ~400 000 characters. Must keep parsing. */
export function legitLargeDocx(): Buffer {
  const line =
    'The partnership delivers measurable cross-border outputs for the programme area, with named partners. ';
  const paragraphs = Array.from(
    { length: 3_300 },
    (_, i) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${i} ${line}</w:t></w:r></w:p>`,
  ).join('');
  return zipOf({ 'word/document.xml': documentXml(paragraphs) }, true);
}
