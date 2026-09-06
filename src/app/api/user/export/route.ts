import { NextResponse } from 'next/server';
import { exportUserData } from '@/actions/user/export-data';

/**
 * POST /api/user/export — KVKK md.11 / GDPR art.20 data portability.
 * Returns the signed-in subject's data as a downloadable JSON document.
 */
export async function POST() {
  const result = await exportUserData();

  if (!result.success || !result.data) {
    const status = result.error === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: result.error ?? 'Export failed' }, { status });
  }

  const filename = `fabrika-data-export-${new Date().toISOString().split('T')[0]}.json`;

  return new NextResponse(JSON.stringify(result.data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
