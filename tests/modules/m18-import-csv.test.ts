import { describe, expect, it } from 'vitest';

import {
  CsvImportError,
  detectDelimiter,
  parseCsvText,
  planImport,
  suggestMapping,
  summarisePlan,
  IMPORT_MAX_ROWS,
} from '@/modules/m18/server/import-csv';

/**
 * NG-135 (M18-F3). The CSV import's pure layer: delimiter, header mapping, row validation
 * and exact-duplicate skipping. The tenant write is covered by the e2e walk.
 */
describe('M18 CSV import (pure layer)', () => {
  it('detects comma, semicolon and tab delimiters from the header line', () => {
    expect(detectDelimiter('name,provinceCode\nA,06')).toBe(',');
    expect(detectDelimiter('ad;il\nA;06')).toBe(';');
    expect(detectDelimiter('ad\til\nA\t06')).toBe('\t');
    expect(detectDelimiter('﻿ad;il;web\n')).toBe(';');
  });

  it('suggests a mapping from Turkish and English headers, ignoring case, spaces and unknown columns', () => {
    const mapping = suggestMapping(['Kurum Adı', 'İL KODU', 'Web Sitesi', 'Not', 'Ölçek']);
    expect(mapping).toEqual({ name: 'Kurum Adı', provinceCode: 'İL KODU', website: 'Web Sitesi', sizeBand: 'Ölçek' });
    expect(suggestMapping(['Name', 'Legal name'])).toEqual({ name: 'Name', legalName: 'Legal name' });
  });

  it('parses a BOM file with a semicolon delimiter and quoted cells, numbering data rows from 1', () => {
    const csv = parseCsvText('﻿ad;il\r\n"Ankara, Kooperatifi";06\r\n\r\nİzmir Derneği;35\r\n');
    expect(csv.headers).toEqual(['ad', 'il']);
    expect(csv.rows.map((r) => r.line)).toEqual([1, 2]);
    expect(csv.rows[0]?.cells.ad).toBe('Ankara, Kooperatifi');
  });

  it('refuses an empty file and a file over the row limit', () => {
    expect(() => parseCsvText('')).toThrow(CsvImportError);
    const many = ['name', ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `Org ${i}`)].join('\n');
    expect(() => parseCsvText(many)).toThrow(CsvImportError);
  });

  it('marks rows with an empty name or a bad province as invalid, with the failing field', () => {
    const csv = parseCsvText('name,provinceCode,sizeBand\n,06,SMALL\nBeta A.Ş.,Ankara,SMALL\nGamma,35,small\n');
    const plan = planImport(csv, { name: 'name', provinceCode: 'provinceCode', sizeBand: 'sizeBand' }, []);
    expect(plan.invalid).toEqual([
      { line: 1, fields: ['name'] },
      { line: 2, fields: ['provinceCode'] },
    ]);
    expect(plan.valid.map((v) => v.input.name)).toEqual(['Gamma']);
    expect(plan.valid[0]?.input.sizeBand).toBe('SMALL');
  });

  it('skips exact duplicates within the file and against existing organisations, not near-matches', () => {
    const csv = parseCsvText(
      'name,provinceCode\nAlfa Ltd. Şti.,06\nalfa ltd şti,06\nAlfa Ltd,35\nBeta,06\nBeta Derneği,06\n',
    );
    const existing = [{ id: 'x1', name: 'Beta', provinceCode: '06', dedupeKey: null }];
    const plan = planImport(csv, { name: 'name', provinceCode: 'provinceCode' }, existing);
    expect(plan.duplicates).toEqual([
      { line: 2, name: 'alfa ltd şti', reason: 'FILE' },
      { line: 4, name: 'Beta', reason: 'EXISTING' },
    ]);
    // "Beta Derneği" is near "Beta" but not exact: left in, for the duplicate screen to judge.
    expect(plan.valid.map((v) => v.line)).toEqual([1, 3, 5]);
  });

  it('requires a name column mapping before planning', () => {
    const csv = parseCsvText('ad\nA\n');
    expect(() => planImport(csv, {}, [])).toThrow(CsvImportError);
  });

  it('summarises a 1.000-row file with counts and caps the listed problems', () => {
    const lines = ['name,provinceCode'];
    for (let i = 0; i < 1000; i += 1) lines.push(`Kurum ${i},${i % 2 === 0 ? '06' : 'XX'}`);
    const plan = planImport(parseCsvText(lines.join('\n')), { name: 'name', provinceCode: 'provinceCode' }, []);
    const summary = summarisePlan(plan, 10);
    expect(summary.total).toBe(1000);
    expect(summary.validCount).toBe(500);
    expect(summary.invalidCount).toBe(500);
    expect(summary.invalid).toHaveLength(10);
  });
});
