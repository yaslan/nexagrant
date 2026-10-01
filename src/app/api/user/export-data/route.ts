import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { exportUserData } from '@/actions/user/export-data';

/**
 * POST /api/user/export-data — alias of `/api/user/export`.
 *
 * Both paths delegate to the same audited action. The earlier standalone
 * implementation queried by `tenantId`, so it returned the whole tenant's
 * opportunities, efforts and AI logs to any member who called it; a data
 * subject export must be scoped to the subject alone.
 */
export async function POST() {
  const result = await exportUserData();

  if (!result.success || !result.data) {
    if (result.error === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return internalError({ error: 'export_failed' });
  }

  const filename = `fonbridge-data-export-${new Date().toISOString().split('T')[0]}.json`;

  return new NextResponse(JSON.stringify(result.data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
