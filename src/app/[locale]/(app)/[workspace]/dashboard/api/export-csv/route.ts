import { NextRequest, NextResponse } from 'next/server';
import { exportDashboardCSV } from '../../export-csv';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    const result = await exportDashboardCSV({ from, to });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dashboard-metrics-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
