/**
 * FO-186 (TASK-MVRIV9LCDHYKO) — M17 Interreg pre-assessment, F1 extraction.
 *
 * The DOCX files are real: built by the `docx` package (what Word reads), or —
 * for the hostile cases the package will not write — a stored-entry zip built
 * here. The PDFs are real too (tests/helpers/synthetic-pdf.ts) and go through
 * the shared worker-thread extractor, which is not mocked.
 */
import { crc32 } from 'node:zlib';

import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import tr from '../messages/tr.json';
import { formatFromFileName, INTERREG_API_ERRORS, INTERREG_UPLOAD_LIMITS } from '../src/modules/m17/limits';
import { DocxReadError, documentXmlToText, readDocxText } from '../src/modules/m17/server/docx-text';
import { extractInterregDocument, InterregExtractError } from '../src/modules/m17/server/extract';
import { acceptsUpload, statusAfterUpload } from '../src/modules/m17/server/status';
import { syntheticPdf, densePageLines } from './helpers/synthetic-pdf';

const PROSE =
  'The project addresses cross-border cooperation between regions in the programme area, with measurable outputs. ';

/** A zip of stored (uncompressed) entries — enough for a DOCX whose XML we write ourselves. */
function storedZip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
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

  it('stays linear on a hostile document (no quadratic rescans)', () => {
    const xml = body('<w:p><w:r><w:t>a</w:t></w:r>'.repeat(200_000));
    const t0 = Date.now();
    documentXmlToText(xml);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});

describe('readDocxText — real .docx files', () => {
  const limits = {
    maxXmlBytes: INTERREG_UPLOAD_LIMITS.maxDocxXmlBytes,
    maxEntries: INTERREG_UPLOAD_LIMITS.maxDocxEntries,
    maxChars: INTERREG_UPLOAD_LIMITS.maxChars,
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

  it('answers malformed for a PDF the extractor cannot parse', async () => {
    expect(await refusal('broken.pdf', Buffer.from('%PDF-1.4 not really'))).toBe('malformed');
  });
});

describe('analysis status', () => {
  it('is CALL_READY with the call guide alone and READY with both documents', () => {
    expect(statusAfterUpload(false, false)).toBe('UPLOADING');
    expect(statusAfterUpload(true, false)).toBe('CALL_READY');
    expect(statusAfterUpload(false, true)).toBe('UPLOADING');
    expect(statusAfterUpload(true, true)).toBe('READY');
  });

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
});
