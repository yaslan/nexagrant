import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import { isAgencyTenant } from '@/lib/agency/funnel';
import { agencyReportHtml, readAgencyReportIn } from '@/lib/agency/report';
import type { ExportLocale } from '@/lib/document-exporter';

/**
 * View one stored agency region report on screen (FB KAMU B3, TASK-MULRR08Y9YI77).
 *
 * NG-341 (HUKUK-5 5d, veri sorumlusu kararı 23.11.2026): the report is not given as a file.
 * The CSV is gone: a `csv` format — and any format other than the on-screen view — is a 404,
 * so no URL hands the agency a CSV, PDF, XLSX or similar. The view is an HTML page answered
 * `Content-Disposition: inline`, with no print button and no "save as PDF" hint. `?format=print`
 * (links opened before NG-341) is the same view: it never was a file. Stopping copy or the
 * browser's own print menu is out of scope (card).
 *
 * Only a member of the agency that owns the report gets it: the tenant is the session's, never
 * a parameter, and the row is read with that tenant in the where clause and under `withTenant`
 * (RLS). Another tenant's report id is a 404, not a 403, so ids cannot be probed.
 */
const VIEW_FORMATS = new Set([null, 'view', 'print']);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantApi();
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.scope;
  if (!(await isAgencyTenant(tenantId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  if (!VIEW_FORMATS.has(url.searchParams.get('format'))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const locale: ExportLocale = url.searchParams.get('locale') === 'en' ? 'en' : 'tr';

  const { id } = await params;
  const found = await withTenant(tenantId, async (tx) => {
    const snapshot = await readAgencyReportIn(tx, tenantId, id);
    if (!snapshot) return null;
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId }, select: { name: true } });
    return { snapshot, agencyName: tenant?.name ?? '' };
  });
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new Response(agencyReportHtml(found.snapshot, found.agencyName, locale), {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline',
    },
  });
}
