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

  it('reads "8%" and "0.08" as the same 8% (fraction column)', async () => {
    const res = await parse([
      ['Topic', 'Success rate'],
      ['HORIZON-A-2026-01-X-01', '8%'],
      ['HORIZON-A-2026-01-X-02', 0.08],
    ]);
    expect(res.rows.map((r) => r.successRate)).toEqual([8, 8]);
    expect(res.rejected).toEqual([]);
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
