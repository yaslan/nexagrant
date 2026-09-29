import { describe, expect, it } from 'vitest';
import { readXlsx, XlsxReadError, XLSX_LIMITS } from '@/lib/k3-topic-stats/xlsx';
import {
  HorizonLayoutError,
  parseCountry,
  parseCount,
  parseHorizonDashboard,
  parseRateCell,
} from '@/lib/k3-topic-stats/horizonDashboard';
import { buildXlsx, zip, type FixtureCell } from './helpers/xlsx-fixture';

/**
 * TASK-MULQKV3BJT6VM — the K3 Horizon Dashboard parser, fed real `.xlsx` bytes.
 * The DB half (upsert, idempotency, unmatched codes) is tests/k3-topic-stats-import.live.test.ts.
 */

const HEADER: FixtureCell[] = ['Topic', 'Country', 'Legal entity type', 'Eligible proposals', 'Retained proposals', 'Success rate'];

async function parse(rows: FixtureCell[][], name = 'Export') {
  return parseHorizonDashboard(await readXlsx(buildXlsx([{ name, rows }])));
}

describe('readXlsx', () => {
  it('reads shared strings, inline strings and numbers into a grid', async () => {
    const sheets = await readXlsx(
      buildXlsx([{ name: 'S', rows: [['a', { inline: 'b & c' }, 3.5], [null, 'a', 7]] }]),
    );
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.rows).toEqual([
      ['a', 'b & c', '3.5'],
      ['', 'a', '7'],
    ]);
  });

  it('refuses a file that is not a zip (renamed .xls / csv)', async () => {
    await expect(readXlsx(Buffer.from('Topic,Success rate\nX,8%\n'))).rejects.toMatchObject({ code: 'NOT_XLSX' });
  });

  it('refuses a zip that is not a workbook', async () => {
    const bytes = zip([{ name: 'hello.txt', data: Buffer.from('hi') }]);
    await expect(readXlsx(bytes)).rejects.toMatchObject({ code: 'NOT_XLSX' });
  });

  it('refuses a part that declares a DOCTYPE (no entity expansion, no XXE)', async () => {
    const evil = zip([
      {
        name: 'xl/workbook.xml',
        data: Buffer.from('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><workbook><sheets/></workbook>'),
      },
    ]);
    await expect(readXlsx(evil)).rejects.toMatchObject({ code: 'MALFORMED' });
  });

  it('stops inflating a part that grows past the cap, whatever its header claims (zip bomb)', async () => {
    const bomb = Buffer.alloc(XLSX_LIMITS.maxPartBytes + 1024, 0x61);
    const onlyBomb = zip([
      { name: 'xl/workbook.xml', data: Buffer.from('<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/sharedStrings.xml', data: bomb },
    ]);
    expect(onlyBomb.length).toBeLessThan(1024 * 1024);
    await expect(readXlsx(onlyBomb)).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('refuses an upload over the byte cap before unzipping', async () => {
    const big = Buffer.alloc(XLSX_LIMITS.maxFileBytes + 1);
    big.writeUInt32LE(0x04034b50, 0);
    await expect(readXlsx(big)).rejects.toBeInstanceOf(XlsxReadError);
  });

  it('reads self-closing rows and cells, skips phonetic runs and does not mistake <rowBreaks> for a row', async () => {
    const sheets = await readXlsx(
      zip([
        { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK_ONE) },
        { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(RELS_ONE) },
        {
          name: 'xl/sharedStrings.xml',
          data: Buffer.from('<sst><si><r><t>Kan</t></r><rPh sb="0" eb="1"><t>KANA</t></rPh><r><t xml:space="preserve">ji</t></r></si><si/></sst>'),
        },
        {
          name: 'xl/worksheets/sheet1.xml',
          data: Buffer.from(
            `<worksheet><sheetData><row r="1" spans="1:3"><c r="A1" t="s"><v>0</v></c><c r="B1"/><c r="C1" t='s'><v>1</v></c></row><row r="2"/><row r="3"><c r="B3" t="b"><v>1</v></c></row></sheetData><rowBreaks count="1"><brk id="1"/></rowBreaks></worksheet>`,
          ),
        },
      ]),
    );
    expect(sheets[0]!.rows).toEqual([['Kanji', '', ''], [], ['', 'TRUE']]);
  });
});

// TASK-MUM187B5EN9LZ — the hostile-bytes cases the review measured (Ö-1, Ö-2).
const WORKBOOK_ONE = '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>';
const RELS_ONE = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';

function oneSheet(sheetXml: string): Buffer {
  return zip([
    { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK_ONE) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(RELS_ONE) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml) },
  ]);
}

async function timed(bytes: Buffer): Promise<{ ms: number; error: unknown }> {
  const t0 = performance.now();
  let error: unknown = null;
  try {
    await readXlsx(bytes);
  } catch (err) {
    error = err;
  }
  return { ms: performance.now() - t0, error };
}

describe('readXlsx under hostile bytes', () => {
  it('refuses unclosed <row> tags in linear time (was O(k·n): 160 000 took ~35 s)', async () => {
    // 2^14 → 2^18 unclosed rows. The old regex re-scanned to the end per opening tag, so the
    // largest step alone would have taken minutes; now each size is one failed search.
    const curve: number[] = [];
    for (const n of [1 << 14, 1 << 16, 1 << 18]) {
      const bytes = oneSheet('<worksheet><sheetData>' + '<row>'.repeat(n));
      expect(bytes.length).toBeLessThan(8 * 1024);
      const { ms, error } = await timed(bytes);
      expect(error).toMatchObject({ code: 'MALFORMED' });
      curve.push(ms);
    }
    expect(Math.max(...curve)).toBeLessThan(1_000);
  });

  it('refuses unclosed <c>, <si> and <rPh> the same way, after one search', async () => {
    const cells = oneSheet('<worksheet><sheetData><row r="1">' + '<c r="A1">'.repeat(1 << 16) + '</row></sheetData></worksheet>');
    const strings = zip([
      { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK_ONE) },
      { name: 'xl/sharedStrings.xml', data: Buffer.from('<sst>' + '<si>'.repeat(1 << 16)) },
    ]);
    const phonetic = zip([
      { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK_ONE) },
      { name: 'xl/sharedStrings.xml', data: Buffer.from('<sst><si>' + '<rPh>'.repeat(1 << 16) + '</si></sst>') },
    ]);
    for (const bytes of [cells, strings, phonetic]) {
      const { ms, error } = await timed(bytes);
      expect(error).toMatchObject({ code: 'MALFORMED' });
      expect(ms).toBeLessThan(1_000);
    }
  });

  it('refuses a start tag longer than the cap instead of scanning its attributes', async () => {
    const quotes = "<row a='".repeat(4_000);
    const { error } = await timed(oneSheet(`<worksheet><sheetData>${quotes}></row></sheetData></worksheet>`));
    expect(error).toMatchObject({ code: 'MALFORMED' });
  });

  it('reads a worksheet part once however many <sheet> entries point at it', async () => {
    const part = '<worksheet><sheetData>' + '<row><c r="B1"><v>1</v></c></row>'.repeat(1_000) + '</sheetData></worksheet>';
    const ids = Array.from({ length: 50 }, (_, i) => `rId${i + 1}`);
    const bytes = zip([
      { name: 'xl/workbook.xml', data: Buffer.from(`<workbook><sheets>${ids.map((id, i) => `<sheet name="S${i}" r:id="${id}"/>`).join('')}</sheets></workbook>`) },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: Buffer.from(`<Relationships>${ids.map((id) => `<Relationship Id="${id}" Target="worksheets/sheet1.xml"/>`).join('')}</Relationships>`),
      },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(part) },
    ]);
    const sheets = await readXlsx(bytes);
    expect(sheets).toHaveLength(50);
    expect(sheets.map((s) => s.name).slice(0, 2)).toEqual(['S0', 'S1']);
    // One grid, shared: 50 entries cost the cells of one.
    expect(new Set(sheets.map((s) => s.rows)).size).toBe(1);
    expect(sheets[0]!.rows).toHaveLength(1_000);
    expect(sheets[0]!.rows[0]).toEqual(['', '1']);
  });

  it('stops a column-padding bomb at the cell budget, not at the heap', async () => {
    // Every row pads to the last allowed column: rows × maxColumns slots from a ~2 KB file.
    const rows = Math.ceil(XLSX_LIMITS.maxCells / XLSX_LIMITS.maxColumns) + 1;
    const bytes = oneSheet('<worksheet><sheetData>' + '<row><c r="GR1"><v>1</v></c></row>'.repeat(rows) + '</sheetData></worksheet>');
    expect(bytes.length).toBeLessThan(16 * 1024);
    const { ms, error } = await timed(bytes);
    expect(error).toMatchObject({ code: 'TOO_LARGE' });
    expect(ms).toBeLessThan(2_000);
  });

  it('charges row holes to the same budget (<row r="100000"/> in many parts)', async () => {
    const parts = Math.ceil(XLSX_LIMITS.maxCells / XLSX_LIMITS.maxRows) + 1;
    const ids = Array.from({ length: parts }, (_, i) => i + 1);
    const bytes = zip([
      { name: 'xl/workbook.xml', data: Buffer.from(`<workbook><sheets>${ids.map((i) => `<sheet name="S${i}" r:id="rId${i}"/>`).join('')}</sheets></workbook>`) },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: Buffer.from(`<Relationships>${ids.map((i) => `<Relationship Id="rId${i}" Target="worksheets/sheet${i}.xml"/>`).join('')}</Relationships>`),
      },
      ...ids.map((i) => ({
        name: `xl/worksheets/sheet${i}.xml`,
        data: Buffer.from(`<worksheet><sheetData><row r="${XLSX_LIMITS.maxRows}"/></sheetData></worksheet>`),
      })),
    ]);
    await expect(readXlsx(bytes)).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });
});

describe('value parsers', () => {
  it.each([
    ['8%', { kind: 'percent', value: 8 }],
    ['8,5 %', { kind: 'percent', value: 8.5 }],
    ['0.08', { kind: 'bare', value: 0.08 }],
    ['19.13', { kind: 'bare', value: 19.13 }],
    ['', null],
    ['n/a%', undefined],
    ['#N/A', undefined],
  ])('parseRateCell(%j)', (raw, expected) => {
    expect(parseRateCell(raw)).toEqual(expected);
  });

  it.each([
    ['1234', 1234],
    ['1,234', 1234],
    ['1.234', 1234],
    ['1 234', 1234],
    ['', null],
    ['12.5', undefined],
    ['-3', undefined],
  ])('parseCount(%j)', (raw, expected) => {
    expect(parseCount(raw)).toEqual(expected);
  });

  it.each([
    ['TR', 'TR'],
    ['tr', 'TR'],
    ['Türkiye', 'TR'],
    ['Turkey', 'TR'],
    ['Germany', 'DE'],
    ['EL', 'GR'],
    ['UK', 'GB'],
    ['All countries', null],
    ['', null],
    ['Atlantis', undefined],
  ])('parseCountry(%j)', (raw, expected) => {
    expect(parseCountry(raw)).toBe(expected);
  });
});

describe('parseHorizonDashboard', () => {
  it('finds the header under a title block and maps every column', async () => {
    const res = await parse([
      ['Horizon Europe Dashboard — export'],
      [],
      HEADER,
      ['HORIZON-CL5-2026-09-D4-01', 'TR', 'PRC', 230, 44, 0.1913],
    ]);
    expect(res.headerRowNumber).toBe(3);
    expect(res.mapping).toMatchObject({ topicCode: 'Topic', successRate: 'Success rate', funded: 'Retained proposals' });
    expect(res.rows).toEqual([
      {
        rowNumber: 4,
        topicCode: 'HORIZON-CL5-2026-09-D4-01',
        country: 'TR',
        orgType: 'PRC',
        proposals: 230,
        funded: 44,
        successRate: 19.13,
      },
    ]);
    expect(res.rateScale).toBe('fraction');
  });

  it('reads "8%" and "0.08" as the same 8% (fraction column, checked against the counts)', async () => {
    const res = await parse([
      ['Topic', 'Eligible proposals', 'Retained proposals', 'Success rate'],
      ['HORIZON-A-2026-01-X-01', 100, 8, '8%'],
      ['HORIZON-A-2026-01-X-02', 100, 8, 0.08],
    ]);
    expect(res.rateScale).toBe('fraction');
    expect(res.rows.map((r) => r.successRate)).toEqual([8, 8]);
    expect(res.rejected).toEqual([]);
  });

  it('refuses a rate column whose scale can only be guessed (values ≤ 1, no "%", no counts)', async () => {
    // "0.5" here may be 50% or 0.5%. Before TASK-MUM187B5EN9LZ this was read as 50% silently.
    const run = parse([
      ['Topic', 'Success rate'],
      ['HORIZON-A-2026-01-X-01', 0.5],
      ['HORIZON-A-2026-01-X-02', 0.08],
    ]);
    await expect(run).rejects.toBeInstanceOf(HorizonLayoutError);
    await expect(run).rejects.toThrow(/could be 50% or 0\.5%/);

    // Counts in the header but on no row do not check anything either.
    await expect(
      parse([
        ['Topic', 'Eligible proposals', 'Retained proposals', 'Success rate'],
        ['HORIZON-A-2026-01-X-01', null, null, 0.5],
      ]),
    ).rejects.toBeInstanceOf(HorizonLayoutError);

    // An all-zero column is 0% either way — nothing to guess.
    const zero = await parse([
      ['Topic', 'Success rate'],
      ['HORIZON-A-2026-01-X-01', 0],
    ]);
    expect(zero.rows[0]!.successRate).toBe(0);
  });

  it('decides the rate scale from data rows only, not from a total or a note row', async () => {
    // The "Total" row's bare 12 used to make the whole column percent, so 0.08 became 0.08%.
    const res = await parse([
      ['Topic', 'Eligible proposals', 'Retained proposals', 'Success rate'],
      ['HORIZON-A-2026-01-X-01', 100, 8, 0.08],
      ['Total', 100, 12, 12],
    ]);
    expect(res.rateScale).toBe('fraction');
    expect(res.rows.map((r) => r.successRate)).toEqual([8]);
    expect(res.rejected.map((r) => r.reason)).toEqual(['aggregateRow']);
  });

  it('reads bare numbers > 1 as percentages, and a "(%)" header as percent whatever the values', async () => {
    const a = await parse([
      ['Topic', 'Success rate'],
      ['HORIZON-A-2026-01-X-01', 12.5],
      ['HORIZON-A-2026-01-X-02', 0.5],
    ]);
    expect(a.rateScale).toBe('percent');
    expect(a.rows.map((r) => r.successRate)).toEqual([12.5, 0.5]);

    const b = await parse([
      ['Topic', 'Success rate (%)'],
      ['HORIZON-A-2026-01-X-01', 0.9],
    ]);
    expect(b.rateScale).toBe('percent');
    expect(b.rows[0]!.successRate).toBe(0.9);
  });

  it('computes the rate from counts when there is no rate column', async () => {
    const res = await parse([
      ['Topic', 'Eligible proposals', 'Retained proposals'],
      ['HORIZON-A-2026-01-X-01', 185, 12],
    ]);
    expect(res.rateScale).toBe('n/a');
    expect(res.rows[0]!.successRate).toBe(6.49);
  });

  it('counts blank rows and never reports them as errors', async () => {
    const res = await parse([
      HEADER,
      ['HORIZON-A-2026-01-X-01', 'TR', 'PRC', 100, 10, '10%'],
      [],
      [null, '', null],
      ['HORIZON-A-2026-01-X-02', 'TR', 'PRC', 100, 20, '20%'],
    ]);
    expect(res.rows).toHaveLength(2);
    expect(res.blankRows).toBe(2);
    expect(res.rejected).toEqual([]);
  });

  it('rejects bad rows loudly, each with its row number and reason code', async () => {
    const res = await parse([
      HEADER,
      [null, 'TR', 'PRC', 100, 10, '10%'], // 2 empty code
      ['Total', null, null, 5000, 600, '12%'], // 3 aggregate
      ['HORIZON; DROP', 'TR', 'PRC', 100, 10, '10%'], // 4 bad code
      ['HORIZON-A-2026-01-X-01', 'Atlantis', 'PRC', 100, 10, '10%'], // 5 country
      ['HORIZON-A-2026-01-X-02', 'TR', 'PRC', 10, 20, null], // 6 funded > proposals
      ['HORIZON-A-2026-01-X-03', 'TR', 'PRC', null, null, '#N/A'], // 7 rate not a number
      ['HORIZON-A-2026-01-X-04', 'TR', 'PRC', 100, 10, '30%'], // 8 mismatch
      ['HORIZON-A-2026-01-X-05', 'TR', 'PRC', null, null, null], // 9 nothing
      ['HORIZON-A-2026-01-X-06', 'TR', 'PRC', null, null, '150%'], // 10 range
      ['HORIZON-A-2026-01-X-07', 'TR', 'PRC', 100, 10, '10%'], // 11 ok
      ['horizon-a-2026-01-x-07', 'tr', 'prc', 100, 10, '10%'], // 12 duplicate of 11 after normalising
      ['HORIZON-A-2026-01-X-08', 'TR', 'PRC', '12.5', 1, null], // 13 non-integer count
    ]);
    expect(res.rows.map((r) => r.rowNumber)).toEqual([11]);
    expect(res.rejected.map((r) => [r.rowNumber, r.reason])).toEqual([
      [2, 'emptyCode'],
      [3, 'aggregateRow'],
      [4, 'badCode'],
      [5, 'badCountry'],
      [6, 'fundedExceeds'],
      [7, 'badRate'],
      [8, 'rateMismatch'],
      [9, 'noRate'],
      [10, 'outOfRange'],
      [12, 'duplicate'],
      [13, 'badCount'],
    ]);
    expect(res.rejected.find((r) => r.rowNumber === 12)!.detail).toBe('11');
  });

  it('fails with a LAYOUT error naming the headers it saw when a required column is gone', async () => {
    const run = parse([
      ['Topic identifier renamed', 'Rate of success'],
      ['HORIZON-A-2026-01-X-01', '8%'],
    ]);
    await expect(run).rejects.toBeInstanceOf(HorizonLayoutError);
    await expect(run).rejects.toMatchObject({
      code: 'LAYOUT_CHANGED',
      headersSeen: ['Topic identifier renamed', 'Rate of success'],
    });
  });

  it('fails when two columns claim the same field, rather than picking one', async () => {
    await expect(
      parse([
        ['Topic', 'Success rate', 'Proposal success rate'],
        ['HORIZON-A-2026-01-X-01', '8%', '9%'],
      ]),
    ).rejects.toThrow(/two columns map to "successRate"/);
  });

  it('skips a cover sheet and reads the first sheet that has the columns', async () => {
    const sheets = await readXlsx(
      buildXlsx([
        { name: 'About', rows: [['This file was exported from the dashboard']] },
        { name: 'Data', rows: [['Topic', 'Success rate'], ['HORIZON-A-2026-01-X-01', '8%']] },
      ]),
    );
    const res = parseHorizonDashboard(sheets);
    expect(res.sheetName).toBe('Data');
    expect(res.rows).toHaveLength(1);
  });
});
