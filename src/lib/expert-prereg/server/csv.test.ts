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

  it('writes numbers as they are and null as an empty cell', () => {
    expect(csvCell(7)).toBe('7');
    expect(csvCell(null)).toBe('');
    expect(csvCell('Ankara')).toBe('Ankara');
  });
});

describe('toCsv', () => {
  it('starts with a byte-order mark and uses CRLF line ends', () => {
    const text = toCsv(['ad', 'il'], [['Ayşe', 'Ankara']]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toBe('﻿ad,il\r\nAyşe,Ankara\r\n');
  });
});
