import { NextResponse } from 'next/server';
import { exportUserData } from '@/actions/user/export-data';

/**
 * GET /api/gdpr/export — legacy path kept for links published in the privacy
 * notice. Delegates to the audited export action, which authenticates the real
 * session and omits OAuth/session secrets from the payload.
 */
export async function GET() {
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
