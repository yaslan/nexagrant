import React from 'react';
import Link from 'next/link';
import { moduleGate } from '@/lib/modules/guard';
import { requireTenantPage } from '@/lib/tenant';
import { withTenant } from '@/lib/db';
import { getWorkspaceRoute } from '@/lib/routes';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';

/**
 * TASK-MTQYXISOPUJ53 — fabricated fallbacks.
 *
 * This report used to open with a `MOCK_REPORTS` constant — Alice 12.5h and Bob
 * 8h on "Advanced AI solutions for climate modeling", Charlie 16h on "Smart
 * grids optimization" — and it never touched the database at all. Every tenant
 * read the same 40.5 hours / 5.1 person-days, and the opportunity link pointed
 * at `../pipeline/mock_id`. It is the same class of invention as a demo
 * fallback, minus even the query it was pretending to fall back from.
 *
 * Effort is a real, tenant-scoped table (`model Effort`: opportunityId, userId,
 * date, hours, deletedAt). The report now sums it, per opportunity, through
 * `withTenant` so RLS applies (CLAUDE.md rule 1).
 */

interface EffortGroup {
  opportunityId: string;
  title: string;
  hours: number;
}

interface EffortRow {
  opportunityId: string;
  hours: number;
  opportunity: { title: string } | null;
}

/** Sum hours per opportunity, largest first. Pure — unit tested. */
export function groupEffortByOpportunity(rows: EffortRow[]): EffortGroup[] {
  const byOpportunity = new Map<string, EffortGroup>();

  for (const row of rows) {
    const existing = byOpportunity.get(row.opportunityId);
    if (existing) {
      existing.hours += row.hours;
      continue;
    }
    byOpportunity.set(row.opportunityId, {
      opportunityId: row.opportunityId,
      // An effort row whose opportunity was hard-deleted keeps its hours but has
      // no title to show. Say so; do not invent one.
      title: row.opportunity?.title ?? '—',
      hours: row.hours,
    });
  }

  return [...byOpportunity.values()].sort((a, b) => b.hours - a.hours);
}

/** Hours → person-days, at the 8-hour day this report has always used. */
export function toPersonDays(hours: number): number {
  return hours / 8;
}

export default async function PersonDaysReportPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const locked = await moduleGate('M5', locale);
  if (locked) return locked;

  const { tenantId } = await requireTenantPage(locale);

  let groupedData: EffortGroup[] = [];
  let queryFailed = false;

  try {
    const efforts = await withTenant<EffortRow[]>(tenantId, (tx) =>
      tx.effort.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          opportunityId: true,
          hours: true,
          opportunity: { select: { title: true } },
        },
      })
    );
    groupedData = groupEffortByOpportunity(efforts);
  } catch (e) {
    // Reported, not replaced with invented rows (CLAUDE.md rule 6).
    queryFailed = true;
    console.error(`[PersonDaysReport] effort query failed: ${errorMessage(e)}`);
    await recordAlert({
      level: 'warn',
      source: 'person_days_report_query_failed',
      message: `Effort lookup failed: ${errorMessage(e)}`,
      meta: { module: 'M5', table: 'Effort' },
      // Same shape as the partners page: constant meta, moving error text, and
      // a fan-out that follows how often the report is opened.
      dedupeKey: 'person-days-report:effort-query-failed',
    });
  }

  const totalHours = groupedData.reduce((sum, item) => sum + item.hours, 0);
  const isTr = locale === 'tr';

  return (
    <div className="max-w-4xl mx-auto py-8 sm:px-8">
      <h1 className="text-3xl font-bold mb-2">
        {isTr ? 'Adam-Gün Raporu' : 'Person-Days Report'}
      </h1>
      <p className="text-ink-2 mb-8">
        {isTr
          ? 'Pipeline’ınızdaki tüm fırsatlara harcanan eforu takip edin.'
          : 'Track effort investment across all opportunities in your pipeline.'}
      </p>

      {queryFailed && (
        <div
          role="alert"
          className="mb-6 border border-amber-200 bg-amber-50 text-amber-900 text-sm rounded-lg p-4"
        >
          {isTr
            ? 'Efor kayıtları okunamadı. Sorun kaydedildi; lütfen birazdan tekrar deneyin.'
            : 'Effort records could not be read. The failure has been recorded; please try again shortly.'}
        </div>
      )}

      <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden mb-8 min-w-0">
        <div className="p-3 sm:p-4 bg-ground border-b border-border flex flex-wrap gap-3 justify-between items-center sm:items-center">
          <div className="flex gap-2">
            <span className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white">
              {isTr ? 'Fırsata Göre' : 'By Opportunity'}
            </span>
          </div>
          <div className="text-xs sm:text-sm font-medium text-ink-2 whitespace-nowrap">
            {isTr ? 'Toplam' : 'Total'}: {totalHours} {isTr ? 'saat' : 'hours'} (
            {toPersonDays(totalHours).toFixed(1)} {isTr ? 'AG' : 'PDs'})
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface border-b border-border text-muted uppercase tracking-wider text-xs">
              <tr>
                <th className="px-3 sm:px-6 py-3 font-semibold">{isTr ? 'Fırsat' : 'Opportunity'}</th>
                <th className="px-3 sm:px-6 py-3 font-semibold text-right">
                  {isTr ? 'Toplam Saat' : 'Total Hours'}
                </th>
                <th className="px-3 sm:px-6 py-3 font-semibold text-right">
                  {isTr ? 'Adam-Gün' : 'Person-Days'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groupedData.map((row) => (
                <tr key={row.opportunityId} className="hover:bg-ground">
                  <td className="px-3 sm:px-6 py-4 text-ink font-medium">
                    {/* Was `../pipeline/mock_id` — a link to nothing. */}
                    <Link
                      href={`${getWorkspaceRoute('pipeline', locale, workspace)}/${row.opportunityId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-3 sm:px-6 py-4 text-ink text-right text-sm">{row.hours}</td>
                  <td className="px-3 sm:px-6 py-4 text-ink font-semibold text-right text-sm">
                    {toPersonDays(row.hours).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!queryFailed && groupedData.length === 0 && (
          <div className="p-12 text-center text-sm text-muted space-y-1">
            <p className="font-semibold text-ink">
              {isTr ? 'Henüz efor kaydı yok.' : 'No effort has been logged yet.'}
            </p>
            <p>
              {isTr
                ? 'Bir fırsatın efor sekmesinden saat girdiğinizde burada görünür.'
                : 'Hours logged on an opportunity’s effort tab appear here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
