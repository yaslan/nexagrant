import { describe, test, expect } from 'vitest';

import { opportunityCsv } from '../src/lib/dashboard/opportunity-csv';
import { evidenceCsv } from '../src/lib/evidence/evidence-csv';
import { formulaCells, readLikeASpreadsheet } from './helpers/spreadsheet-csv';

const PAYLOAD = "=cmd|' /C calc'!A0";

describe('dashboard export (FO-126)', () => {
  const at = new Date('2026-10-01T09:00:00.000Z');

  test('neutralises a formula title under both delimiters and keeps every row intact', () => {
    const csv = opportunityCsv([
      { id: 'opp1', title: PAYLOAD, stage: 'G2', status: 'ACTIVE', createdAt: at, updatedAt: at },
      { id: 'opp2', title: 'Kurum;=1+1', stage: null, status: null, createdAt: null, updatedAt: null },
      { id: 'opp4', title: 'Satır\r=1+1', stage: null, status: null, createdAt: null, updatedAt: null },
    ]);

    expect(formulaCells(csv)).toEqual({ ',': [], ';': [] });

    const rows = readLikeASpreadsheet(csv, ',');
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.length === 6)).toBe(true);
    expect(rows[1]?.[1]).toBe(`'${PAYLOAD}`);
    expect(rows[2]?.[1]).toBe("Kurum;'=1+1");
    expect(rows[3]?.[1]).toBe("Satır\r'=1+1");
  });

  test('keeps the header and the fallback cells as before', () => {
    const csv = opportunityCsv([
      { id: 'opp3', title: null, stage: null, status: null, createdAt: null, updatedAt: null },
    ]);

    expect(csv.split('\n')[0]).toBe('ID,Title,Stage,Status,Created,Updated');
    expect(csv.split('\n')[1]).toBe('opp3,,G0,N/A,,');
  });

  test('an empty export is the header line alone', () => {
    expect(opportunityCsv([])).toBe('ID,Title,Stage,Status,Created,Updated');
  });
});

describe('evidence pack export (FO-126)', () => {
  test('neutralises a formula in the title, the issuing authority and the file name', () => {
    const csv = evidenceCsv([
      {
        id: 'ev1',
        title: PAYLOAD,
        category: 'CAT-01',
        issuingAuthority: 'TSE;=cmd|x',
        validUntil: null,
        status: 'VALID',
        fileName: '+SUM(A1)',
      },
      { id: 'ev3', title: 'Başlık\r;=1+1', category: 'CAT-02', status: 'VALID' },
    ]);

    expect(formulaCells(csv)).toEqual({ ',': [], ';': [] });

    const rows = readLikeASpreadsheet(csv, ',');
    expect(rows).toHaveLength(3);
    expect(rows[1]?.[1]).toBe(`'${PAYLOAD}`);
    expect(rows[1]?.[3]).toBe("TSE;'=cmd|x");
    expect(rows[1]?.[6]).toBe("'+SUM(A1)");
    expect(rows[2]?.[1]).toBe("Başlık\r;'=1+1");
  });

  test('keeps the header, the category fallback and the status fallback as before', () => {
    const csv = evidenceCsv([{ id: 'ev2', title: 'Belge', kind: 'corporate', status: undefined }]);
    const rows = readLikeASpreadsheet(csv, ',');

    expect(rows[0]).toEqual(['ID', 'Title', 'Category', 'IssuingAuthority', 'ValidUntil', 'Status', 'FileName']);
    expect(rows[1]).toEqual(['ev2', 'Belge', 'corporate', '', '', 'UNVERIFIED', '']);
  });

  test('an empty pack is the header line with its line break', () => {
    expect(evidenceCsv([])).toBe('ID,Title,Category,IssuingAuthority,ValidUntil,Status,FileName\n');
  });
});
