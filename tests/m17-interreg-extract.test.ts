/**
 * FO-186 (TASK-MVRIV9LCDHYKO) — M17 Interreg pre-assessment, F1 extraction.
 *
 * The DOCX files are real: built by the `docx` package (what Word reads), or —
 * for the hostile cases the package will not write — a stored-entry zip built
 * here. The PDFs are real too (tests/helpers/synthetic-pdf.ts) and go through
 * the shared worker-thread extractor, which is not mocked.
 */
import { crc32, deflateRawSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';

import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import tr from '../messages/tr.json';
import { formatFromFileName, INTERREG_API_ERRORS, INTERREG_ERROR_ARGS, INTERREG_UPLOAD_LIMITS } from '../src/modules/m17/limits';
import { DocxReadError, documentXmlToText, readDocxText } from '../src/modules/m17/server/docx-text';
import { extractInterregDocument, InterregExtractError, tidy } from '../src/modules/m17/server/extract';
import { acceptsUpload } from '../src/modules/m17/server/status';
import { decodeXmlText as xlsxDecodeXmlText } from '../src/lib/k3-topic-stats/xlsx';
import { decodeXmlText } from '../src/modules/m17/server/docx.worker';
import { HOSTILE_FLAT, legitLargeDocx } from './helpers/hostile-docx';
import { syntheticPdf, densePageLines } from './helpers/synthetic-pdf';

const PROSE =
  'The project addresses cross-border cooperation between regions in the programme area, with measurable outputs. ';

/**
 * A zip of stored (uncompressed) entries — enough for a DOCX whose XML we write ourselves.
 * `deflate` compresses them instead (method 8), for the small-file / huge-XML cases.
 */
function storedZip(entries: Record<string, string>, deflate = false): Buffer {
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
const body = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${inner}</w:body></w:document>`;
const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc><w:tcPr><w:tcW w:w="100"/></w:tcPr>${p(text)}</w:tc>`;

async function realDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun('1. Relevance of the project')] }),
          new Paragraph({ children: [new TextRun(PROSE.repeat(3))] }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Work package')] }),
                  new TableCell({ children: [new Paragraph('Budget (EUR)')] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('WP1 Management'), new Paragraph('and coordination')] }),
                  new TableCell({ children: [new Paragraph('120 000')] }),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun('2. Partnership'), new TextRun({ text: ' & cooperation', bold: true })] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

describe('documentXmlToText — reading order', () => {
  it('keeps paragraphs and table cells in document order, one line per row', () => {
    const xml = body(
      p('Intro') +
        `<w:tbl><w:tblPr><w:tblW w:w="0"/></w:tblPr><w:tr>${cell('A1')}${cell('B1')}</w:tr><w:tr>${cell('A2')}${cell('B2')}</w:tr></w:tbl>` +
        p('Outro'),
    );
    expect(documentXmlToText(xml)).toBe('Intro\nA1 | B1\nA2 | B2\nOutro');
  });

  it('inlines a nested table into its parent cell and joins a cell’s paragraphs with a space', () => {
    const inner = `<w:tbl><w:tr>${cell('x')}${cell('y')}</w:tr></w:tbl>`;
    const xml = body(`<w:tbl><w:tr><w:tc>${p('outer')}${inner}${p('after')}</w:tc>${cell('right')}</w:tr></w:tbl>`);
    expect(documentXmlToText(xml)).toBe('outer x | y after | right');
  });

  it('decodes the predefined entities, keeps runs together, turns w:tab into a tab and ignores tab stops', () => {
    const xml = body(
      '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>' +
        '<w:r><w:t>R&amp;D</w:t></w:r><w:r><w:tab/><w:t>&lt;3&gt; &#8364;</w:t></w:r></w:p>',
    );
    expect(documentXmlToText(xml)).toBe('R&D\t<3> €');
  });

  it('skips deleted (tracked-change) text and the mc:Fallback copy of a text box', () => {
    const xml = body(
      '<w:p><w:r><w:t>kept</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>' +
        `<w:p><w:r><mc:AlternateContent><mc:Choice>${p('box')}</mc:Choice><mc:Fallback>${p('box')}</mc:Fallback></mc:AlternateContent></w:r></w:p>`,
    );
    expect(documentXmlToText(xml)).toBe('kept\nbox');
  });

  it('drops empty paragraphs and empty table rows', () => {
    const xml = body(`${p('')}<w:p/>${p('a')}<w:tbl><w:tr>${cell('')}${cell('')}</w:tr></w:tbl>${p('b')}`);
    expect(documentXmlToText(xml)).toBe('a\nb');
  });

  it('refuses text past maxChars with too_long', () => {
    const xml = body(p('x'.repeat(50)) + p('y'.repeat(50)));
    expect(() => documentXmlToText(xml, 60)).toThrow(DocxReadError);
    expect(() => documentXmlToText(xml, 60)).toThrow(/60 characters/);
  });

  it('reads tables and paragraphs nested up to maxNesting and refuses one level more as malformed (se-fb B3)', () => {
    const nested = (depth: number) =>
      body('<w:tbl><w:tr><w:tc>'.repeat(depth) + p('deep') + '</w:tc></w:tr></w:tbl>'.repeat(depth));
    expect(documentXmlToText(nested(3), Infinity, 3)).toBe('deep');
    expect(() => documentXmlToText(nested(4), Infinity, 3)).toThrow(/Tables nested deeper than 3/);
    expect(() => documentXmlToText(nested(4), Infinity, 3)).toThrow(DocxReadError);

    const boxes = (depth: number) => body('<w:p><w:r>'.repeat(depth) + '<w:t>box</w:t>' + '</w:r></w:p>'.repeat(depth));
    expect(documentXmlToText(boxes(3), Infinity, 3)).toBe('box');
    expect(() => documentXmlToText(boxes(4), Infinity, 3)).toThrow(/Paragraphs nested deeper than 3/);
    // The default is the upload limit, not unbounded.
    expect(() => documentXmlToText(nested(INTERREG_UPLOAD_LIMITS.maxDocxNesting + 1))).toThrow(/nested deeper/);
  });

  it('stays linear on a hostile document (no quadratic rescans)', () => {
    const xml = body('<w:p><w:r><w:t>a</w:t></w:r>'.repeat(200_000));
    // 200 000 unclosed paragraphs: the depth cap refuses it at the 11th…
    expect(() => documentXmlToText(xml)).toThrow(/nested deeper/);
    // …and with the cap lifted the scan itself is still one linear pass.
    const t0 = Date.now();
    documentXmlToText(xml, Infinity, Infinity);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});

describe('readDocxText — real .docx files', () => {
  const limits = {
    maxXmlBytes: INTERREG_UPLOAD_LIMITS.maxDocxXmlBytes,
    maxEntries: INTERREG_UPLOAD_LIMITS.maxDocxEntries,
    maxChars: INTERREG_UPLOAD_LIMITS.maxChars,
    maxNesting: INTERREG_UPLOAD_LIMITS.maxDocxNesting,
  };

  it('reads a Word document built by the docx package, table text in order', async () => {
    const text = await readDocxText(await realDocx(), limits);
    const lines = text.split('\n');
    expect(lines[0]).toBe('1. Relevance of the project');
    expect(lines[2]).toBe('Work package | Budget (EUR)');
    expect(lines[3]).toBe('WP1 Management and coordination | 120 000');
    expect(lines[4]).toBe('2. Partnership & cooperation');
  });

  it('refuses a document.xml that declares a DOCTYPE (no entity expansion)', async () => {
    const zip = storedZip({
      'word/document.xml': `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]>${body(p('&a;'))}`,
    });
    await expect(readDocxText(zip, limits)).rejects.toMatchObject({ code: 'malformed' });
  });

  it('refuses document.xml that inflates past the byte cap, whatever the zip claims', async () => {
    const zip = storedZip({ 'word/document.xml': body(p('z'.repeat(5_000))) });
    await expect(readDocxText(zip, { ...limits, maxXmlBytes: 1_000 })).rejects.toMatchObject({ code: 'too_large' });
  });

  // se-fb B3 `deeptbl`: ~118 KB on disk, ~2.6 M nested <w:tbl><w:tr><w:tc>. Before the
  // fix it held ~564 MB and the event loop for ~1 s, then answered no_text.
  it('refuses the deeply nested table bomb fast, at either size (se-fb deeptbl)', async () => {
    const open = '<w:tbl><w:tr><w:tc>';
    const bomb = (xmlBytes: number) => storedZip({ 'word/document.xml': body(open.repeat(Math.floor(xmlBytes / open.length))) }, true);

    const original = bomb(49 * 1024 * 1024); // se-fb's sample: past the 20 MB XML cap
    expect(original.length).toBeLessThan(200 * 1024);
    let t0 = Date.now();
    await expect(readDocxText(original, limits)).rejects.toMatchObject({ code: 'too_large' });
    expect(Date.now() - t0).toBeLessThan(1_500);

    const underCap = bomb(INTERREG_UPLOAD_LIMITS.maxDocxXmlBytes - 1024 * 1024); // fits the cap: the depth cap decides
    t0 = Date.now();
    await expect(readDocxText(underCap, limits)).rejects.toMatchObject({ code: 'malformed' });
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  it('reads one document at a time and answers every caller', async () => {
    const docx = await realDocx();
    const texts = await Promise.all([readDocxText(docx, limits), readDocxText(docx, limits), readDocxText(docx, limits)]);
    expect(new Set(texts).size).toBe(1);
    // A refusal does not block the queue for the next document.
    await expect(readDocxText(storedZip({ 'x.xml': '<x/>' }), limits)).rejects.toMatchObject({ code: 'not_docx' });
    await expect(readDocxText(docx, limits)).resolves.toBe(texts[0]);
  });

  // FO-195 Ö1 (se-fb re-review of FO-186): flat hostile XML under the 20 MB cap — 30–50 KB on
  // disk, nothing nested — was walked on the web server's thread and held the event loop for
  // 250–580 ms here (seconds under load). The read now runs in its own thread, so a 1 ms
  // heartbeat on this thread must keep ticking. The gap is the longest wait any other
  // request would have had.
  describe.each(Object.entries(HOSTILE_FLAT))('flat hostile file %s (FO-195 Ö1)', (_name, make) => {
    it('does not hold the event loop, and is still refused', async () => {
      const bytes = make();
      expect(bytes.length).toBeLessThan(100 * 1024);
      let maxGap = 0;
      let last = performance.now();
      const beat = setInterval(() => {
        const now = performance.now();
        maxGap = Math.max(maxGap, now - last);
        last = now;
      }, 1);
      try {
        await expect(readDocxText(bytes, limits)).resolves.toBe(''); // empty paragraphs/cells: no text
      } finally {
        await new Promise((r) => setTimeout(r, 5));
        clearInterval(beat);
      }
      expect(maxGap).toBeLessThan(120);
    });
  });

  it('ends the reading thread at its deadline and refuses with parse_too_heavy; the next read is unaffected', async () => {
    const t0 = Date.now();
    await expect(readDocxText(HOSTILE_FLAT.para19(), { ...limits, maxParseMs: 25 })).rejects.toMatchObject({
      code: 'parse_too_heavy',
    });
    expect(Date.now() - t0).toBeLessThan(1_500);
    await expect(readDocxText(await realDocx(), limits)).resolves.toContain('Partnership');
  });

  it('ends the reading thread at its heap ceiling and refuses with parse_too_heavy', async () => {
    await expect(readDocxText(HOSTILE_FLAT.wide19(), { ...limits, maxHeapMb: 4 })).rejects.toMatchObject({
      code: 'parse_too_heavy',
    });
  });

  it('still reads an 80-page application (≈350 000 characters) within the default bounds', async () => {
    const text = await readDocxText(legitLargeDocx(), limits);
    expect(text.length).toBeGreaterThan(300_000);
    expect(text.length).toBeLessThanOrEqual(INTERREG_UPLOAD_LIMITS.maxChars);
  });

  it("the worker's copy of decodeXmlText agrees with the shared one (it cannot import it)", () => {
    for (const s of ['R&amp;D', '&lt;3&gt; &quot;q&quot; &apos;a&apos;', '&#65;&#x42;&#xD800;&#0;&#x110000;', '&unknown; & plain', '']) {
      expect(decodeXmlText(s)).toBe(xlsxDecodeXmlText(s));
    }
  });

  it('refuses a zip that is not a Word document, and an archive with too many entries', async () => {
    await expect(readDocxText(storedZip({ 'xl/workbook.xml': '<x/>' }), limits)).rejects.toMatchObject({
      code: 'not_docx',
    });
    const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.txt`, 'x']));
    await expect(readDocxText(storedZip(many), { ...limits, maxEntries: 4 })).rejects.toMatchObject({
      code: 'too_large',
    });
  });
});

async function refusal(name: string, bytes: Buffer, maxChars?: number): Promise<string> {
  const err = await extractInterregDocument(name, bytes, { maxChars }).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(InterregExtractError);
  return (err as InterregExtractError).code;
}

describe('extractInterregDocument — formats, limits and refusals', () => {
  it('maps file extensions, and nothing else, to formats', () => {
    expect(formatFromFileName('Call Guide.PDF')).toBe('PDF');
    expect(formatFromFileName('a.b.docx')).toBe('DOCX');
    expect(formatFromFileName('notes.markdown')).toBe('MD');
    expect(formatFromFileName('x.txt')).toBe('TXT');
    expect(formatFromFileName('old.doc')).toBeNull();
    expect(formatFromFileName('docx')).toBeNull();
    expect(formatFromFileName('x.constructor')).toBeNull();
  });

  it('extracts a real PDF through the shared worker extractor', async () => {
    const doc = await extractInterregDocument('call.pdf', syntheticPdf(densePageLines(), 1));
    expect(doc.format).toBe('PDF');
    expect(doc.pages).toBe(1);
    expect(doc.text).toContain('Horizon Europe work programme text');
    expect(doc.chars).toBe(doc.text.length);
  });

  it('extracts a real DOCX and a UTF-8 Markdown file (BOM dropped, CRLF normalised)', async () => {
    const docx = await extractInterregDocument('project.docx', await realDocx());
    expect(docx).toMatchObject({ format: 'DOCX', pages: null });
    expect(docx.text).toContain('WP1 Management and coordination | 120 000');

    const md = await extractInterregDocument(
      'project.md',
      Buffer.from(`﻿# Başlık\r\n\r\n\r\n\r\n${PROSE.repeat(3)}çğıöşü\r\n`, 'utf8'),
    );
    expect(md.format).toBe('MD');
    expect(md.text.startsWith('# Başlık\n\n')).toBe(true);
    expect(md.text).not.toContain('\r');
    expect(md.text.endsWith('çğıöşü')).toBe(true);
  });

  it('refuses an unsupported type before reading it', async () => {
    expect(await refusal('application.doc', Buffer.from('anything'))).toBe('unsupported_type');
    expect(await refusal('slides.pptx', Buffer.from('PK\u0003\u0004'))).toBe('unsupported_type');
    expect(await refusal('no-extension', Buffer.from(PROSE))).toBe('unsupported_type');
  });

  it('refuses bytes that do not match the extension', async () => {
    const pdf = syntheticPdf(densePageLines(), 1);
    const docx = await realDocx();
    expect(await refusal('renamed.docx', pdf)).toBe('type_mismatch');
    expect(await refusal('renamed.pdf', docx)).toBe('type_mismatch');
    expect(await refusal('renamed.txt', docx)).toBe('type_mismatch');
    expect(await refusal('renamed.md', pdf)).toBe('type_mismatch');
  });

  it('refuses text that is not UTF-8 or carries NUL bytes', async () => {
    expect(await refusal('latin1.txt', Buffer.from(`${PROSE.repeat(3)}caf\xe9`, 'latin1'))).toBe('bad_encoding');
    expect(await refusal('nul.md', Buffer.from(`${PROSE.repeat(3)}\u0000`, 'utf8'))).toBe('bad_encoding');
  });

  it('refuses a file over the byte cap, text over the character cap, and too many PDF pages', async () => {
    expect(await refusal('big.txt', Buffer.alloc(INTERREG_UPLOAD_LIMITS.maxFileBytes + 1, 0x61))).toBe('too_large');
    expect(await refusal('long.md', Buffer.from(PROSE.repeat(20), 'utf8'), 1_000)).toBe('too_long');
    expect(await refusal('long.docx', await realDocx(), 100)).toBe('too_long');
    expect(await refusal('long.pdf', syntheticPdf(densePageLines(), 1), 1_000)).toBe('too_long');
    expect(await refusal('pages.pdf', syntheticPdf(['page'], INTERREG_UPLOAD_LIMITS.maxPages + 1))).toBe(
      'too_many_pages',
    );
  });

  it('refuses a file with no readable text (empty, symbols only, a PDF with no text layer)', async () => {
    expect(await refusal('empty.md', Buffer.from('   \n\n  ', 'utf8'))).toBe('no_text');
    expect(await refusal('symbols.txt', Buffer.from('— · — · — '.repeat(100), 'utf8'))).toBe('no_text');
    expect(await refusal('scan.pdf', syntheticPdf([], 3))).toBe('no_text');
  });

  it('drops NUL and replaces lone surrogates a DOCX smuggles in as character references (se-fb D2)', async () => {
    const zip = storedZip({ 'word/document.xml': body(p(`${PROSE.repeat(3)}a&#0;b&#xD800;c&#xDC00;d`)) });
    const doc = await extractInterregDocument('nul.docx', zip);
    expect(doc.text).not.toContain('\u0000');
    expect(doc.text.endsWith('ab\uFFFDc\uFFFDd')).toBe(true);
    expect(doc.text.isWellFormed()).toBe(true);
  });

  it('tidy keeps a valid surrogate pair and normalises line structure', () => {
    expect(tidy('x\u0000y')).toBe('xy');
    expect(tidy('\uD800 \uDC00 \uD83D\uDE00')).toBe('\uFFFD \uFFFD \uD83D\uDE00');
    expect(tidy('a  \r\n\r\n\r\n\r\nb')).toBe('a\n\nb');
  });

  it('answers malformed for a PDF the extractor cannot parse', async () => {
    expect(await refusal('broken.pdf', Buffer.from('%PDF-1.4 not really'))).toBe('malformed');
  });
});

// The status rule itself lives in saveDocument's SQL and is measured on a real
// database: tests/m17-interreg-analyses.live.test.ts.
describe('analysis status', () => {
  it('refuses a new upload only while an analysis run is reading the texts', () => {
    expect(acceptsUpload('ANALYZING')).toBe(false);
    for (const s of ['UPLOADING', 'EXTRACTING', 'CALL_READY', 'READY', 'DONE', 'FAILED'] as const) {
      expect(acceptsUpload(s)).toBe(true);
    }
  });
});

describe('i18n', () => {
  it('has a Turkish and an English message for every API error code, and the assessment notice', () => {
    for (const messages of [tr, en] as const) {
      const ir = (messages as unknown as { InterregReview: { errors: Record<string, string>; assessmentNotice: string } })
        .InterregReview;
      for (const code of INTERREG_API_ERRORS) expect(ir.errors[code], code).toBeTruthy();
      expect(ir.assessmentNotice).toBeTruthy();
    }
    expect(tr.InterregReview.assessmentNotice).toContain('resmî puan değildir');
    expect(en.InterregReview.assessmentNotice).toContain('not an official score');
  });

  it('takes the limits in the messages from INTERREG_ERROR_ARGS, formatted per locale (crw2 Ö4)', () => {
    const say = (locale: 'tr' | 'en', messages: typeof tr, code: string) =>
      createTranslator({ locale, messages, namespace: 'InterregReview.errors' as never })(code as never, INTERREG_ERROR_ARGS as never);
    expect(INTERREG_ERROR_ARGS).toEqual({ maxMb: 20, maxChars: 400_000 });
    expect(say('tr', tr, 'too_large')).toBe('Dosya çok büyük (en fazla 20 MB).');
    expect(say('en', en, 'too_large')).toBe('The file is too large (20 MB at most).');
    expect(say('tr', tr, 'too_long')).toBe('Belge çok uzun (en fazla 400.000 karakter).');
    expect(say('en', en, 'too_long')).toBe('The document is too long (400,000 characters at most).');
    // No limit is written into a message by hand any more.
    for (const messages of [tr, en]) {
      const errors = (messages as unknown as { InterregReview: { errors: Record<string, string> } }).InterregReview.errors;
      expect(errors.too_large).toContain('{maxMb}');
      expect(errors.too_long).toContain('{maxChars, number}');
      expect(Object.values(errors).join(' ')).not.toMatch(/\b(20|400[.,]000)\b/);
    }
  });
});
