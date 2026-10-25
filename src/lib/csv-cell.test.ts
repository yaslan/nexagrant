import { describe, expect, it } from 'vitest';
import { csvCell } from './csv-cell';

describe('csvCell', () => {
  it('neutralises a formula at the start of a text cell', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe(`'+1`);
    expect(csvCell('-2')).toBe(`'-2`);
    expect(csvCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvCell('\tcmd')).toBe(`'\tcmd`);
  });

  it('neutralises a formula that starts after leading whitespace (FO-141 F10)', () => {
    expect(csvCell(' =1+1')).toBe(`' =1+1`);
    expect(csvCell('   @SUM(A1)')).toBe(`'   @SUM(A1)`);
    expect(csvCell(' \t-2')).toBe(`' \t-2`);
    expect(csvCell('\u00a0+1')).toBe(`'\u00a0+1`);
    expect(csvCell(' hello')).toBe(' hello');
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
    expect(csvCell('a;=1;=2')).toBe(`"a;'=1;'=2"`);
    expect(csvCell('a\r=1')).toBe(`"a\r'=1"`);
    expect(csvCell('a;-1')).toBe(`"a;'-1"`);
    expect(csvCell('\rcmd')).toBe('"\'\rcmd"');
  });

  it('writes numbers as they are and null as an empty cell', () => {
    expect(csvCell(7)).toBe('7');
    expect(csvCell(null)).toBe('');
    expect(csvCell('Ankara')).toBe('Ankara');
  });
});
