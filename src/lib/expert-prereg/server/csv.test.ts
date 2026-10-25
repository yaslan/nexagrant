import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { formulaCells, readLikeASpreadsheet } from '../../../../tests/helpers/spreadsheet-csv';

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
    expect(readLikeASpreadsheet(text, ';').flat().length).toBeGreaterThan(4);
    expect(formulaCells(text)).toEqual({ ',': [], ';': [] });
  });

  it('starts with a byte-order mark and uses CRLF line ends', () => {
    const text = toCsv(['ad', 'il'], [['Ayşe', 'Ankara']]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toBe('﻿ad,il\r\nAyşe,Ankara\r\n');
  });
});
