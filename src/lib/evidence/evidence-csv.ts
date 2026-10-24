import { csvCell } from '@/lib/csv-cell';

export interface EvidenceCsvRow {
  id: string;
  title: string;
  category?: string;
  kind?: string;
  issuingAuthority?: string;
  validUntil?: Date | string | null;
  status?: string;
  fileName?: string | null;
}

/**
 * ValidUntil is a day: a Date and its ISO string print the same UTC `YYYY-MM-DD` (FO-133 M2).
 * String(Date) would print the local, long form instead.
 */
function validUntilDay(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

/**
 * The evidence pack export (FO-126). It carries no file link (B-2, TASK-MUNODY0DVDWC5):
 * a CSV travels, so the name identifies the file and the file is downloaded in the app.
 */
export function evidenceCsv(items: EvidenceCsvRow[]): string {
  const header = 'ID,Title,Category,IssuingAuthority,ValidUntil,Status,FileName\n';
  const rows = items.map((i) =>
    [
      csvCell(i.id),
      csvCell(i.title),
      csvCell(i.category || i.kind || ''),
      csvCell(i.issuingAuthority || ''),
      csvCell(validUntilDay(i.validUntil)),
      csvCell(i.status || 'UNVERIFIED'),
      csvCell(i.fileName || ''),
    ].join(',')
  );

  return header + rows.join('\n');
}
