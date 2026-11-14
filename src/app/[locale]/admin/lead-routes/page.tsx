import React from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { errorMessage } from '@/lib/errors';
import { withSystemScope } from '@/lib/system-scope';
import { PlatformAdminRequiredError } from '@/lib/tenant';
import { TR_PROVINCES } from '@/lib/readiness/provinces';
import type { ProvinceLeadRouteRow, UnmatchedLeadRow, UnmatchedReason } from '@/core/contracts/lead-routing';
import { listProvinceLeadRoutesAction, listUnmatchedLeadsAction } from './actions';
import LeadRoutesClient, { type ProvinceView, type TenantOption } from './client';

export const dynamic = 'force-dynamic';

/** UTC, like the other admin tables: `2026-09-30 14:05 UTC`. */
function formatUtc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * The first route per province in `rows` (already newest first). Active rows win over inactive
 * ones, so a province with an active mapping always shows that one.
 */
function pickRoutes(rows: ProvinceLeadRouteRow[]): Map<string, ProvinceLeadRouteRow> {
  const picked = new Map<string, ProvinceLeadRouteRow>();
  for (const active of [true, false]) {
    for (const r of rows) {
      if (r.active === active && !picked.has(r.province)) picked.set(r.province, r);
    }
  }
  return picked;
}

const REASON_KEY = {
  province_missing: 'reason_province_missing',
  province_unmapped: 'reason_province_unmapped',
  tenant_refused: 'reason_tenant_refused',
} as const satisfies Record<UnmatchedReason, string>;

/**
 * NG-168 — platform-admin screen: province → consultancy mapping and the unmatched-lead list.
 * Reads and writes go through the NG-167 server actions (`./actions`); the only direct read is the
 * tenant pick-list, the same platform-admin query the tenants page uses.
 */
export default async function AdminLeadRoutesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminLeadRoutes' });

  let routes: ProvinceLeadRouteRow[] = [];
  let routesError = false;
  try {
    routes = await listProvinceLeadRoutesAction();
  } catch (e) {
    if (e instanceof PlatformAdminRequiredError) notFound();
    console.error(`[AdminLeadRoutesPage] routes load failed: ${errorMessage(e)}`);
    routesError = true;
  }

  let unmatched: { rows: UnmatchedLeadRow[]; total: number } = { rows: [], total: 0 };
  let unmatchedError = false;
  try {
    unmatched = await listUnmatchedLeadsAction();
  } catch (e) {
    console.error(`[AdminLeadRoutesPage] unmatched load failed: ${errorMessage(e)}`);
    unmatchedError = true;
  }

  // Tenants a province can be routed to: not deleted, and a consultancy or an agency
  // (the same rule as `isIntakeTenant` in the M18 module). Read-only; the server re-checks on save.
  const tenantRows = await withSystemScope('platform-admin', 'admin-lead-routes.tenants', (tx) =>
    tx.tenant.findMany({
      where: { deletedAt: null, OR: [{ orgType: 'CONSULTANCY' }, { kind: 'AGENCY' }] },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    })
  );
  const tenants: TenantOption[] = tenantRows.map((x) => ({ id: x.id, name: x.name, slug: x.slug }));

  // Names of the admins who last changed a route (name only, no e-mail).
  const actorIds = [...new Set(routes.map((r) => r.updatedBy).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await withSystemScope('platform-admin', 'admin-lead-routes.actors', (tx) =>
        tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      )
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const picked = pickRoutes(routes);
  const provinces: ProvinceView[] = TR_PROVINCES.map((province) => {
    const r = picked.get(province);
    if (!r) return { province, status: 'unmapped', tenantId: null, tenantName: null, changedBy: null, changedAt: null };
    return {
      province,
      status: r.active ? 'active' : 'inactive',
      tenantId: r.active ? r.tenantId : null,
      tenantName: r.tenantName,
      changedBy: r.updatedBy ? actorName.get(r.updatedBy) || t('unknown_actor') : null,
      changedAt: formatUtc(r.updatedAt),
    };
  });
  const unmappedCount = provinces.filter((p) => p.status !== 'active').length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">{t('subtitle')}</p>
      </header>

      <section aria-labelledby="lead-routes-map" className="space-y-3">
        <h2 id="lead-routes-map" className="text-lg font-bold text-ink">{t('map_title')}</h2>
        {routesError ? (
          <p role="alert" className="rounded-lg border border-bad bg-surface px-4 py-3 text-sm font-medium text-bad">
            {t('load_error')}
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-bad">{t('unmapped_count', { count: unmappedCount })}</p>
            <LeadRoutesClient provinces={provinces} tenants={tenants} />
          </>
        )}
      </section>

      <section aria-labelledby="lead-routes-unmatched" className="space-y-3">
        <div>
          <h2 id="lead-routes-unmatched" className="text-lg font-bold text-ink">{t('unmatched_title')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">{t('unmatched_subtitle')}</p>
        </div>

        {unmatchedError ? (
          <p role="alert" className="rounded-lg border border-bad bg-surface px-4 py-3 text-sm font-medium text-bad">
            {t('unmatched_load_error')}
          </p>
        ) : unmatched.rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-ink-2">{t('unmatched_empty')}</p>
        ) : (
          <>
            <p className="text-sm text-ink-2">{t('unmatched_count', { shown: unmatched.rows.length, total: unmatched.total })}</p>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0} role="region" aria-label={t('unmatched_title')}>
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">{t('unmatched_title')}</caption>
                <thead className="bg-surface-hover text-xs font-semibold uppercase tracking-wide text-ink-2">
                  <tr>
                    <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_created')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_contact')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_org')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_location')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_reason')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-ink">
                  {unmatched.rows.map((r) => {
                    const location = [r.province, r.district].filter(Boolean).join(' / ');
                    return (
                      <tr key={r.publicLeadId} className="align-top">
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{formatUtc(r.createdAt)}</td>
                        <td className="px-3 py-2">
                          <div>{r.name}</div>
                          <a href={`mailto:${r.email}`} className="break-all text-xs text-accent-ink underline underline-offset-2">
                            {r.email}
                          </a>
                        </td>
                        <td className="px-3 py-2">{r.organisation}</td>
                        <td className="px-3 py-2">{location || t('none')}</td>
                        <td className="px-3 py-2">{t(REASON_KEY[r.reason])}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
