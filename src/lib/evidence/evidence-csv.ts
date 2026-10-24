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
      csvCell(String(i.validUntil || '')),
      csvCell(i.status || 'UNVERIFIED'),
      csvCell(i.fileName || ''),
    ].join(',')
  );

  return header + rows.join('\n');
}
