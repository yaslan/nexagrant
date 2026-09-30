import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { exportDashboardCSV } from '../../export-csv';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    const result = await exportDashboardCSV({ from, to });

    if (!result.success) {
      if (result.error === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (result.error === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return internalError({ error: 'ExportFailed' });
    }

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dashboard-metrics-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('[Dashboard] CSV export route failed:', error);
    return internalError({ error: 'InternalServerError' });
  }
}
