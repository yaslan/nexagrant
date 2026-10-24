import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('neutralises a formula at the start of a text cell', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe(`'+1`);
    expect(csvCell('-2')).toBe(`'-2`);
    expect(csvCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvCell('\tcmd')).toBe(`'\tcmd`);
  });

  it('quotes a cell with a comma, a quote or a line break, and doubles its quotes', () => {
    expect(csvCell('Ayşe, Yılmaz')).toBe('"Ayşe, Yılmaz"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('quotes a cell with a semicolon, and neutralises a formula after the semicolon too', () => {
    expect(csvCell('Ali;=1+1;')).toBe(`"Ali;'=1+1;"`);
    expect(csvCell("Kurum;=cmd|' /C calc'!A0;")).toBe(`"Kurum;'=cmd|' /C calc'!A0;"`);
    expect(csvCell('a; "=1')).toBe(`"a;' ""=1"`);
    expect(csvCell('a\r\n+1')).toBe(`"a\r\n'+1"`);
    expect(csvCell('Ali; Veli')).toBe('"Ali; Veli"');
  });

  it('writes numbers as they are and null as an empty cell', () => {
    expect(csvCell(7)).toBe('7');
    expect(csvCell(null)).toBe('');
    expect(csvCell('Ankara')).toBe('Ankara');
  });
});

/**
 * Splits CSV the way a spreadsheet does: a field is quoted only when its first
 * character is a quote, text after the closing quote is kept, and anything
 * else runs to the next delimiter or line break.
 */
function readLikeASpreadsheet(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    let cell = '';
    if (text[i] === '"') {
      i++;
      while (i < text.length && !(text[i] === '"' && text[i + 1] !== '"')) {
        cell += text[i];
        i += text[i] === '"' ? 2 : 1;
      }
      i++;
    }
    while (i < text.length && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') cell += text[i++];
    row.push(cell);
    if (text[i] === delimiter) {
      i++;
      continue;
    }
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    rows.push(row);
    row = [];
  }
  return rows;
}

const FORMULA_CELL = /^[=+\-@\t\r]/;

describe('toCsv', () => {
  it('leaves no formula cell when read with a comma or with a semicolon (FO-101)', () => {
    const text = toCsv(
      ['ad', 'e-posta', 'kurum', 'il'],
      [
        ['Ali;=1+1;', 'ali@example.invalid', "Kurum;=cmd|' /C calc'!A0;", 'İstanbul'],
        ['=SUM(A1)', 'x@example.invalid', 'a\r\n@b', 'Ankara'],
      ],
    );
    const byComma = readLikeASpreadsheet(text, ',');
    expect(byComma[1]).toEqual(["Ali;'=1+1;", 'ali@example.invalid', "Kurum;'=cmd|' /C calc'!A0;", 'İstanbul']);
    for (const delimiter of [',', ';'] as const) {
      const cells = readLikeASpreadsheet(text, delimiter).flat();
      expect(cells.length).toBeGreaterThan(4);
      expect(cells.filter((cell) => FORMULA_CELL.test(cell))).toEqual([]);
    }
  });


  it('starts with a byte-order mark and uses CRLF line ends', () => {
    const text = toCsv(['ad', 'il'], [['Ayşe', 'Ankara']]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toBe('﻿ad,il\r\nAyşe,Ankara\r\n');
  });
});
