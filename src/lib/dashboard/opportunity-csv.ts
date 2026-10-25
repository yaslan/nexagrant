import { csvCell } from '@/lib/csv-cell';

export interface OpportunityCsvRow {
  id: string;
  title: string | null;
  stage: string | null;
  status: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** The dashboard export (FO-126): every user-typed cell goes through csvCell. */
export function opportunityCsv(opportunities: OpportunityCsvRow[]): string {
  const headers = ['ID', 'Title', 'Stage', 'Status', 'Created', 'Updated'];
  const rows = opportunities.map((opp) => [
    csvCell(opp.id),
    csvCell(opp.title || ''),
    csvCell(opp.stage || 'G0'),
    csvCell(opp.status || 'N/A'),
    csvCell(opp.createdAt?.toISOString() || ''),
    csvCell(opp.updatedAt?.toISOString() || ''),
  ]);

  return [headers, ...rows].map((row) => row.join(',')).join('\n');
}
