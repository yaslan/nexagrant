import { parse } from 'csv-parse/sync';
import { dedupeKey, type ExistingOrganization } from './duplicates';
import { leadCreateSchema, type LeadCreateInput } from './schemas';

/**
 * CSV import of client organisations (NG-135 / F3, `/import`). Pure: text in, plan out. The
 * database is touched only through `import-leads.ts`, which calls `planImport` inside the
 * tenant transaction so the duplicate check sees the same rows that get written.
 *
 * Duplicates here are EXACT only (same `dedupeKey` as an existing row or an earlier line of
 * the file). Near-duplicates are left to the `/duplicates` screen: comparing every row with
 * every existing name would be quadratic on a 1.000-row file.
 */

export const IMPORT_FIELDS = ['name', 'legalName', 'provinceCode', 'website', 'sizeBand'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Maps each app field to the header name in the file. Missing key = column not mapped. */
export type ColumnMapping = Partial<Record<ImportField, string>>;

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_CHARS = 5 * 1024 * 1024;

export class CsvImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvImportError';
  }
}

const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR').replace(/[\s_-]+/g, '');

/** Header spellings accepted per field (Turkish and English), compared after `norm`. */
const ALIASES: Record<ImportField, readonly string[]> = {
  name: ['name', 'ad', 'kurum', 'kurumadı', 'organizasyon', 'organisation', 'organization', 'firma', 'unvan', 'ünvan'],
  legalName: ['legalname', 'yasalad', 'yasalunvan', 'yasalünvan', 'tamunvan', 'tamünvan'],
  provinceCode: ['provincecode', 'province', 'il', 'ilkodu', 'plaka', 'sehirkodu', 'şehirkodu', 'citycode'],
  website: ['website', 'web', 'websitesi', 'site', 'url'],
  sizeBand: ['sizeband', 'size', 'boyut', 'olcek', 'ölçek', 'buyukluk', 'büyüklük'],
};

/** Header → field, for the first header that matches. Unknown headers are ignored. */
export function suggestMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const hit = headers.find((h) => ALIASES[field].includes(norm(h)));
    if (hit !== undefined) mapping[field] = hit;
  }
  return mapping;
}

/** The delimiter that appears most in the header line. Excel exports with `;` in many locales. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const head = (text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '');
  const candidates = [',', ';', '\t'] as const;
  let best: (typeof candidates)[number] = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = head.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export interface ParsedCsv {
  headers: string[];
  rows: { line: number; cells: Record<string, string> }[];
}

/** Parses the whole file. `line` is the 1-based file line of the data row (header = line 1). */
export function parseCsvText(text: string): ParsedCsv {
  if (text.length > IMPORT_MAX_CHARS) throw new CsvImportError('file too large');
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
  } catch {
    throw new CsvImportError('malformed csv');
  }
  const [headerRow, ...dataRows] = records;
  if (!headerRow || headerRow.length === 0) throw new CsvImportError('no header row');
  if (dataRows.length > IMPORT_MAX_ROWS) throw new CsvImportError('too many rows');
  const headers = headerRow.map((h) => h.trim());
  // Blank lines are skipped by the parser, so this is the data-row number (header excluded,
  // first data row = 1), not the physical file line.
  const rows = dataRows.map((cells, i) => ({
    line: i + 1,
    cells: Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ''])),
  }));
  return { headers, rows };
}

export interface RowIssue {
  line: number;
  fields: string[];
}

export interface DuplicateRow {
  line: number;
  name: string;
  reason: 'FILE' | 'EXISTING';
}

export interface ImportPlan {
  total: number;
  valid: { line: number; input: LeadCreateInput; key: string | null }[];
  invalid: RowIssue[];
  duplicates: DuplicateRow[];
}

/** What the mapped cell of a row becomes before Zod sees it. Empty cell or unmapped column = "". */
function mappedRaw(cells: Record<string, string>, mapping: ColumnMapping) {
  const read = (field: ImportField) => (mapping[field] !== undefined ? (cells[mapping[field]] ?? '') : '');
  return {
    name: read('name'),
    legalName: read('legalName'),
    provinceCode: read('provinceCode'),
    website: read('website'),
    sizeBand: read('sizeBand').trim().toLocaleUpperCase('en-US') || null,
  };
}

export function planImport(
  csv: ParsedCsv,
  mapping: ColumnMapping,
  existing: readonly ExistingOrganization[],
): ImportPlan {
  if (mapping.name === undefined) throw new CsvImportError('name column not mapped');
  const existingKeys = new Set<string>();
  for (const org of existing) {
    const key = org.dedupeKey ?? dedupeKey(org);
    if (key) existingKeys.add(key);
  }

  const plan: ImportPlan = { total: csv.rows.length, valid: [], invalid: [], duplicates: [] };
  const seenInFile = new Set<string>();

  for (const row of csv.rows) {
    const parsed = leadCreateSchema.safeParse(mappedRaw(row.cells, mapping));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'name')))];
      plan.invalid.push({ line: row.line, fields });
      continue;
    }
    const input = parsed.data;
    const key = dedupeKey({ name: input.name, provinceCode: input.provinceCode });
    if (key && seenInFile.has(key)) {
      plan.duplicates.push({ line: row.line, name: input.name, reason: 'FILE' });
      continue;
    }
    if (key && existingKeys.has(key)) {
      plan.duplicates.push({ line: row.line, name: input.name, reason: 'EXISTING' });
      continue;
    }
    if (key) seenInFile.add(key);
    plan.valid.push({ line: row.line, input, key });
  }
  return plan;
}

/** Summary the preview screen needs: counts plus the first rows of each problem list. */
export function summarisePlan(plan: ImportPlan, sample = 50) {
  return {
    total: plan.total,
    validCount: plan.valid.length,
    invalidCount: plan.invalid.length,
    duplicateCount: plan.duplicates.length,
    invalid: plan.invalid.slice(0, sample),
    duplicates: plan.duplicates.slice(0, sample),
  };
}
