/**
 * K3 — Horizon Dashboard sheet → normalised `TopicStat` rows (TASK-MULQKV3BJT6VM).
 *
 * Pure: no database, no I/O. The route reads the workbook ({@link readXlsx}), this turns the
 * cell grid into rows, and `importer.ts` decides insert / update / unmatched against the DB.
 *
 * The column map is the contract with the upstream file, the same idea as the CORDIS field map
 * in src/lib/k2-cordis/cordisSchema.ts: each field lists the header spellings it accepts. When
 * the dashboard's export layout changes so that a required field no longer resolves, the parse
 * FAILS with the headers it found and the ones it wanted — it never guesses a column.
 *
 * ⚠ The alias lists were written from the Horizon Europe dashboard's published field names, not
 * from a real export (none was available in the repo on 2026-09-29). The first real upload is
 * the test of them; a miss surfaces as a LAYOUT error naming the headers, not as silent data.
 */
import type { XlsxSheet } from './xlsx';

export type TopicStatField = 'topicCode' | 'country' | 'orgType' | 'proposals' | 'funded' | 'successRate';

/** Accepted header spellings per field, compared after {@link normaliseHeader}. */
export const HORIZON_DASHBOARD_COLUMNS: Record<TopicStatField, readonly string[]> = {
  topicCode: ['topic', 'topic code', 'topic id', 'topic identifier', 'call topic', 'topic call identifier'],
  country: ['country', 'country code', 'country iso', 'applicant country', 'participant country'],
  orgType: [
    'legal entity type',
    'organisation type',
    'organization type',
    'type of organisation',
    'type of organization',
    'org type',
    'activity type',
  ],
  proposals: [
    'eligible proposals',
    'number of eligible proposals',
    'proposals',
    'submitted proposals',
    'eligible applications',
  ],
  funded: [
    'retained proposals',
    'mainlisted proposals',
    'main listed proposals',
    'funded proposals',
    'signed grants',
    'retained applications',
    'funded',
  ],
  successRate: ['success rate', 'success rate %', 'proposal success rate', 'success rate of proposals'],
};

/** Header rows are looked for in this many leading rows (dashboard exports carry a title block). */
const HEADER_SCAN_ROWS = 20;

/** A stated rate and one computed from the counts may differ by this many points before the row is refused. */
const RATE_TOLERANCE_PP = 1;

export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[()[\]_\-:./]/g, ' ')
    .replace(/%/g, ' % ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ParsedTopicStatRow {
  /** 1-based spreadsheet row number, for messages the admin can find in the file. */
  rowNumber: number;
  /** Upper-cased as written: a full topic identifier or a topic-family prefix (the importer decides). */
  topicCode: string;
  country: string | null;
  orgType: string | null;
  proposals: number | null;
  funded: number | null;
  /** Percentage, 0–100, two decimals — the unit `pickBaseRatePct` reads. */
  successRate: number;
}

/** Why a row was refused. A code, so the admin screen can say it in the viewer's language. */
export type RejectReason =
  | 'emptyCode'
  | 'aggregateRow'
  | 'badCode'
  | 'badCountry'
  | 'badCount'
  | 'fundedExceeds'
  | 'badRate'
  | 'rateMismatch'
  | 'noRate'
  | 'outOfRange'
  | 'duplicate';

export interface RejectedRow {
  rowNumber: number;
  topicCode: string | null;
  reason: RejectReason;
  /** The offending value(s), verbatim or computed, for the admin to find in the file. */
  detail?: string;
}

export interface HorizonDashboardParse {
  sheetName: string;
  headerRowNumber: number;
  /** Field → the header text it was bound to, for the preview's mapping table. */
  mapping: Partial<Record<TopicStatField, string>>;
  rows: ParsedTopicStatRow[];
  rejected: RejectedRow[];
  blankRows: number;
  /** How bare numbers in the rate column were read: fractions (×100) or already percent. */
  rateScale: 'fraction' | 'percent' | 'n/a';
}

export class HorizonLayoutError extends Error {
  readonly code = 'LAYOUT_CHANGED';
  readonly headersSeen: string[];

  constructor(message: string, headersSeen: string[]) {
    super(message);
    this.name = 'HorizonLayoutError';
    this.headersSeen = headersSeen;
  }
}

function bindHeaders(header: string[]): { mapping: Map<TopicStatField, number>; duplicate: string | null } {
  const mapping = new Map<TopicStatField, number>();
  let duplicate: string | null = null;
  header.forEach((raw, col) => {
    const h = normaliseHeader(raw);
    if (!h) return;
    for (const field of Object.keys(HORIZON_DASHBOARD_COLUMNS) as TopicStatField[]) {
      if (HORIZON_DASHBOARD_COLUMNS[field].includes(h)) {
        if (mapping.has(field)) duplicate ??= field;
        else mapping.set(field, col);
      }
    }
  });
  return { mapping, duplicate };
}

function isUsable(mapping: Map<TopicStatField, number>): boolean {
  return mapping.has('topicCode') && (mapping.has('successRate') || (mapping.has('proposals') && mapping.has('funded')));
}

// ── value parsing ────────────────────────────────────────────────────────────

const AGGREGATE = new Set(['', '-', '—', 'all', 'total', 'all countries', 'all types', 'n/a', 'na']);

let countryIndex: Map<string, string> | null = null;
/** English country name → ISO 3166-1 alpha-2, built from the runtime's ICU data (no dependency). */
function countryByName(): Map<string, string> {
  if (countryIndex) return countryIndex;
  const index = new Map<string, string>();
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        name = undefined;
      }
      if (name && name !== code) index.set(name.toLowerCase(), code);
    }
  }
  // Spellings the EU uses or that ICU renamed.
  for (const [n, c] of [
    ['turkey', 'TR'],
    ['türkiye', 'TR'],
    ['turkiye', 'TR'],
    ['czech republic', 'CZ'],
    ['the netherlands', 'NL'],
    ['united kingdom', 'GB'],
  ] as const) {
    index.set(n, c);
  }
  countryIndex = index;
  return index;
}

/** `null` = all countries; `undefined` = unrecognised (the row is refused). */
export function parseCountry(raw: string): string | null | undefined {
  const s = raw.trim();
  if (AGGREGATE.has(s.toLowerCase())) return null;
  if (/^[A-Za-z]{2}$/.test(s)) {
    const up = s.toUpperCase();
    // The Commission writes Greece as EL and the UK as UK; tenants store ISO codes.
    return up === 'EL' ? 'GR' : up === 'UK' ? 'GB' : up;
  }
  return countryByName().get(s.toLowerCase()) ?? undefined;
}

export function parseOrgType(raw: string): string | null {
  const s = raw.trim();
  return AGGREGATE.has(s.toLowerCase()) ? null : s.toUpperCase();
}

/**
 * Parses a count cell. Accepts "1234", "1,234", "1.234" (thousands), "1 234".
 * Returns `null` for an empty cell and `undefined` for anything that is not a whole number ≥ 0.
 */
export function parseCount(raw: string): number | null | undefined {
  const s = raw.trim().replace(/[\s  ]/g, '');
  if (s === '') return null;
  const n = /^\d{1,3}([.,]\d{3})+$/.test(s) ? Number(s.replace(/[.,]/g, '')) : Number(s);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** A rate cell before the column's scale is known. */
export type RawRate = { kind: 'percent'; value: number } | { kind: 'bare'; value: number };

/** "8%" / "8,5 %" → percent; "0.08" / "8.13" → bare (scale decided per column). */
export function parseRateCell(raw: string): RawRate | null | undefined {
  const s = raw.trim().replace(/[\s  ]/g, '');
  if (s === '') return null;
  const hasPct = s.endsWith('%');
  const num = Number((hasPct ? s.slice(0, -1) : s).replace(',', '.'));
  if (!Number.isFinite(num)) return undefined;
  return hasPct ? { kind: 'percent', value: num } : { kind: 'bare', value: num };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Finds the first worksheet with a recognisable header and turns it into rows.
 * Throws {@link HorizonLayoutError} when no sheet carries the required columns.
 */
export function parseHorizonDashboard(sheets: XlsxSheet[]): HorizonDashboardParse {
  let firstHeaders: string[] = [];

  for (const sheet of sheets) {
    for (let r = 0; r < Math.min(HEADER_SCAN_ROWS, sheet.rows.length); r++) {
      const header = sheet.rows[r] ?? [];
      if (firstHeaders.length === 0 && header.some((c) => c.trim())) firstHeaders = header.filter((c) => c.trim());
      const { mapping, duplicate } = bindHeaders(header);
      if (!isUsable(mapping)) continue;
      if (duplicate) {
        throw new HorizonLayoutError(
          `Sheet "${sheet.name}" row ${r + 1}: two columns map to "${duplicate}"; the file is ambiguous.`,
          header.filter((c) => c.trim()),
        );
      }
      return parseBody(sheet, r, mapping);
    }
  }

  const need = `"${HORIZON_DASHBOARD_COLUMNS.topicCode[0]}" and either "${HORIZON_DASHBOARD_COLUMNS.successRate[0]}" or "${HORIZON_DASHBOARD_COLUMNS.proposals[0]}" + "${HORIZON_DASHBOARD_COLUMNS.funded[0]}"`;
  throw new HorizonLayoutError(
    `No worksheet has the expected Horizon Dashboard columns (${need}) in its first ${HEADER_SCAN_ROWS} rows. The export layout may have changed; update HORIZON_DASHBOARD_COLUMNS.`,
    firstHeaders,
  );
}

function parseBody(sheet: XlsxSheet, headerIndex: number, mapping: Map<TopicStatField, number>): HorizonDashboardParse {
  const header = sheet.rows[headerIndex] ?? [];
  const cell = (row: string[], f: TopicStatField) => {
    const col = mapping.get(f);
    return col === undefined ? '' : (row[col] ?? '');
  };

  // Scale of bare numbers in the rate column, decided once for the whole column: a success-rate
  // column whose every bare value is ≤ 1 is fractions (Excel stores 8% as 0.08). Per-cell
  // guessing would read "0.5" as 50% in one row and 0.5% in the next.
  const bare: number[] = [];
  for (let r = headerIndex + 1; r < sheet.rows.length; r++) {
    const rate = parseRateCell(cell(sheet.rows[r] ?? [], 'successRate'));
    if (rate && rate.kind === 'bare') bare.push(rate.value);
  }
  // A header that says "%" settles it without looking at the values.
  const rateHeaderIsPercent = (header[mapping.get('successRate') ?? -1] ?? '').includes('%');
  const rateScale: HorizonDashboardParse['rateScale'] =
    bare.length === 0
      ? 'n/a'
      : rateHeaderIsPercent || !bare.every((v) => v >= 0 && v <= 1)
        ? 'percent'
        : 'fraction';

  const rows: ParsedTopicStatRow[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Map<string, number>();
  let blankRows = 0;

  for (let r = headerIndex + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const rowNumber = r + 1;
    if (row.every((c) => c.trim() === '')) {
      blankRows++;
      continue;
    }
    const codeRaw = cell(row, 'topicCode').trim().toUpperCase();
    const reject = (reason: RejectReason, detail?: string) =>
      rejected.push({ rowNumber, topicCode: codeRaw || null, reason, ...(detail !== undefined ? { detail } : {}) });

    if (!codeRaw) {
      reject('emptyCode');
      continue;
    }
    if (AGGREGATE.has(codeRaw.toLowerCase())) {
      reject('aggregateRow');
      continue;
    }
    if (!/^[A-Z0-9][A-Z0-9-]{2,120}$/.test(codeRaw)) {
      reject('badCode');
      continue;
    }

    const country = mapping.has('country') ? parseCountry(cell(row, 'country')) : null;
    if (country === undefined) {
      reject('badCountry', cell(row, 'country').trim());
      continue;
    }
    const orgType = mapping.has('orgType') ? parseOrgType(cell(row, 'orgType')) : null;

    const proposals = parseCount(cell(row, 'proposals'));
    const funded = parseCount(cell(row, 'funded'));
    if (proposals === undefined || funded === undefined) {
      reject('badCount', `${cell(row, 'proposals').trim()} / ${cell(row, 'funded').trim()}`);
      continue;
    }
    if (proposals !== null && funded !== null && funded > proposals) {
      reject('fundedExceeds', `${funded} > ${proposals}`);
      continue;
    }

    const rateCell = parseRateCell(cell(row, 'successRate'));
    if (rateCell === undefined) {
      reject('badRate', cell(row, 'successRate').trim());
      continue;
    }
    const computed = proposals !== null && funded !== null && proposals > 0 ? (funded / proposals) * 100 : null;
    let successRate: number;
    if (rateCell) {
      successRate = rateCell.kind === 'percent' || rateScale === 'percent' ? rateCell.value : rateCell.value * 100;
      if (computed !== null && Math.abs(computed - successRate) > RATE_TOLERANCE_PP) {
        reject('rateMismatch', `${round2(successRate)}% ≠ ${round2(computed)}%`);
        continue;
      }
    } else if (computed !== null) {
      successRate = computed;
    } else {
      reject('noRate');
      continue;
    }
    successRate = round2(successRate);
    if (successRate < 0 || successRate > 100) {
      reject('outOfRange', `${successRate}%`);
      continue;
    }

    const key = `${codeRaw}|${country ?? ''}|${orgType ?? ''}`;
    const firstRow = seen.get(key);
    if (firstRow !== undefined) {
      reject('duplicate', String(firstRow));
      continue;
    }
    seen.set(key, rowNumber);

    rows.push({
      rowNumber,
      topicCode: codeRaw,
      country,
      orgType,
      proposals,
      funded,
      successRate,
    });
  }

  const boundMapping: Partial<Record<TopicStatField, string>> = {};
  for (const [f, col] of mapping) boundMapping[f] = header[col] ?? '';

  return { sheetName: sheet.name, headerRowNumber: headerIndex + 1, mapping: boundMapping, rows, rejected, blankRows, rateScale };
}
