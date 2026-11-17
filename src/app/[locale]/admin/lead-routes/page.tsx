import React from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { errorMessage } from '@/lib/errors';
import { PlatformAdminRequiredError } from '@/lib/tenant';
import { TR_PROVINCES } from '@/lib/readiness/provinces';
import type { IntakeTenantOption, ProvinceLeadRouteRow, StuckRoutedLeadPage, UnmatchedLeadRow, UnmatchedReason } from '@/core/contracts/lead-routing';
import { listIntakeTenantOptionsAction, listProvinceLeadRoutesAction, listStuckRoutedLeadsAction, listUnmatchedLeadsAction } from './actions';
import LeadRoutesClient, { type ProvinceView } from './client';

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
  consent_recipient_mismatch: 'reason_consent_recipient_mismatch',
} as const satisfies Record<UnmatchedReason, string>;

/**
 * NG-168 — platform-admin screen: province → consultancy mapping and the unmatched-lead list.
 * Every read goes through a NG-167/NG-171 server action (`./actions`): routes (with the last
 * changer's name in `updatedByName`), the unmatched worklist, and the intake tenant pick-list.
 * The page holds no business rule and no direct database query.
 */
export default async function AdminLeadRoutesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminLeadRoutes' });
  const tLevels = await getTranslations({ locale, namespace: 'readiness.levels' });
  // Readiness level code (`PublicLead.readinessLevel`) → the label the scorecard already shows; null or unknown → "—".
  const levelLabel = (code: string | null): string =>
    code === 'baslangic' || code === 'gelisen' || code === 'hazir' ? tLevels(code) : t('none');

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
    if (e instanceof PlatformAdminRequiredError) notFound();
    console.error(`[AdminLeadRoutesPage] unmatched load failed: ${errorMessage(e)}`);
    unmatchedError = true;
  }

  // NG-182: routed leads with no copy in their tenant. Read-only; no re-send here.
  let stuck: StuckRoutedLeadPage | null = null;
  try {
    stuck = await listStuckRoutedLeadsAction();
  } catch (e) {
    if (e instanceof PlatformAdminRequiredError) notFound();
    console.error(`[AdminLeadRoutesPage] stuck load failed: ${errorMessage(e)}`);
  }

  // Tenants a province can be routed to (the `isIntakeTenant` rule, applied by the action). The server re-checks on save.
  let intakeTenants: IntakeTenantOption[] = [];
  let tenantsError = false;
  try {
    intakeTenants = await listIntakeTenantOptionsAction();
  } catch (e) {
    if (e instanceof PlatformAdminRequiredError) notFound();
    console.error(`[AdminLeadRoutesPage] tenant options load failed: ${errorMessage(e)}`);
    tenantsError = true;
  }
  const picked = pickRoutes(routes);
  const provinces: ProvinceView[] = TR_PROVINCES.map((province) => {
    const r = picked.get(province);
    if (!r) return { province, status: 'unmapped', tenantId: null, tenantName: null, changedBy: null, changedAt: null };
    return {
      province,
      status: r.active ? 'active' : 'inactive',
      tenantId: r.active ? r.tenantId : null,
      tenantName: r.tenantName,
      changedBy: r.updatedBy ? r.updatedByName || t('unknown_actor') : null,
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
            {tenantsError && (
              <p role="alert" className="rounded-lg border border-bad bg-surface px-4 py-3 text-sm font-medium text-bad">
                {t('tenants_load_error')}
              </p>
            )}
            <LeadRoutesClient provinces={provinces} tenants={intakeTenants} />
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
                    <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_readiness')}</th>
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
                        <td className="px-3 py-2 whitespace-nowrap">{levelLabel(r.readinessLevel)}</td>
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

      <section aria-labelledby="lead-routes-stuck" className="space-y-3" data-testid="lead-routes-stuck">
        <div>
          <h2 id="lead-routes-stuck" className="text-lg font-bold text-ink">{t('stuck_title')}</h2>
          {stuck && <p className="mt-1 max-w-3xl text-sm text-ink-2">{t('stuck_subtitle', { minutes: stuck.olderThanMinutes })}</p>}
        </div>

        {!stuck ? (
          <p role="alert" className="rounded-lg border border-bad bg-surface px-4 py-3 text-sm font-medium text-bad">
            {t('stuck_load_error')}
          </p>
        ) : stuck.rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-ink-2">{t('stuck_empty')}</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-bad">{t('stuck_count', { shown: stuck.rows.length, total: stuck.total })}</p>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0} role="region" aria-label={t('stuck_title')}>
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">{t('stuck_title')}</caption>
                <thead className="bg-surface-hover text-xs font-semibold uppercase tracking-wide text-ink-2">
                  <tr>
                    <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_routed_at')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_routed_tenant')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_org')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_location')}</th>
                    <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_created')}</th>
                    <th scope="col" className="px-3 py-2">{t('col_lead_id')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-ink">
                  {stuck.rows.map((r) => (
                    <tr key={r.publicLeadId} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.routedAt ? formatUtc(r.routedAt) : t('none')}</td>
                      <td className="px-3 py-2">
                        <div>{r.routedTenantName ?? t('none')}</div>
                        {r.tenantDeleted && <div className="text-xs font-semibold text-bad">{t('tenant_deleted')}</div>}
                      </td>
                      <td className="px-3 py-2">{r.organisation}</td>
                      <td className="px-3 py-2">{r.province ?? t('none')}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{formatUtc(r.createdAt)}</td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{r.publicLeadId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
