import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import { isAgencyTenant } from '@/lib/agency/funnel';
import { agencyReportCsv, agencyReportHtml, readAgencyReportIn } from '@/lib/agency/report';
import type { ExportLocale } from '@/lib/document-exporter';

/**
 * Download one stored agency region report (FB KAMU B3, TASK-MULRR08Y9YI77).
 *
 * `?format=csv` → CSV (UTF-8 BOM); anything else → the printable page, which the
 * browser saves as PDF. Only a member of the agency that owns the report gets it:
 * the tenant is the session's, never a parameter, and the row is read with that
 * tenant in the where clause and under `withTenant` (RLS). Another tenant's report
 * id is a 404, not a 403, so ids cannot be probed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantApi();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.scope;
  if (!(await isAgencyTenant(tenantId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const url = new URL(req.url);
  const locale: ExportLocale = url.searchParams.get('locale') === 'en' ? 'en' : 'tr';
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'print';

  const found = await withTenant(tenantId, async (tx) => {
    const snapshot = await readAgencyReportIn(tx, tenantId, id);
    if (!snapshot) return null;
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });
    return { snapshot, agencyName: tenant?.name ?? '' };
  });
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { snapshot, agencyName } = found;
  const base = `bolge-raporu-${snapshot.period}`;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (format === 'csv') {
    return new Response(agencyReportCsv(snapshot, locale), {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
      },
    });
  }
  return new Response(agencyReportHtml(snapshot, agencyName, locale), {
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
