import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { attachmentContentDisposition } from '@/lib/content-disposition';
import { exportExpertPreRegistrationsCsv, expertPreRegFilterSchema } from '@/lib/expert-prereg/server/admin';
import { logger } from '@/lib/logger';
import { requirePlatformAdminApi } from '@/lib/tenant';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — GET /api/admin/expert-preregistrations/export.csv
 * Platform admins only (403/401 otherwise, and no row is read). Same filters as
 * the list: province, area, status, q. The file name carries the export date.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePlatformAdminApi();
  if (!gate.ok) return gate.response;

  const parsed = expertPreRegFilterSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'bad_filters' }, { status: 400 });

  try {
    const csv = await exportExpertPreRegistrationsCsv(parsed.data);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentContentDisposition(`uzman-on-kayit-${day}`, '.csv', 'expert-preregistrations'),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('expert pre-registration export failed', { error: error instanceof Error ? error.name : 'unknown' });
    return internalError({ error: 'export_failed' });
  }
}
