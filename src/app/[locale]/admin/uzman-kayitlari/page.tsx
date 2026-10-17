import React from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { PRODUCT_NAME } from '@/lib/brand';
import { errorMessage } from '@/lib/errors';
import { EXPERTISE_AREAS, PROVINCES } from '@/lib/expert-prereg/options';
import {
  expertPreRegFilterSchema,
  listExpertPreRegistrations,
  type ExpertPreRegFilters,
  type ExpertPreRegRow,
} from '@/lib/expert-prereg/server/admin';
import { PlatformAdminRequiredError, requirePlatformAdmin } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** The page shows the newest rows; the CSV carries every match. */
const PAGE_ROWS = 500;
const STATUSES = ['pending', 'verified', 'disabled'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminExpertPrereg' });
  return { title: `${t('title')} · ${PRODUCT_NAME} Admin` };
}

/** UTC, like the other admin tables: `2026-09-30 14:05 UTC`. */
function formatUtc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

const PROVINCE_NAME = new Map<string, string>(PROVINCES.map((p) => [p.value, p.name]));

/**
 * FO-20 — the platform-admin list of expert pre-registrations (FO-19 data).
 * Personal data: the admin layout already 404s a non-admin, and the page checks
 * the role again itself because it reads the rows. Filters are a plain GET form,
 * so a filtered view is a URL and the CSV link carries the same query.
 */
export default async function AdminExpertPreregPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  try {
    await requirePlatformAdmin();
  } catch (e) {
    if (e instanceof PlatformAdminRequiredError) notFound();
    throw e;
  }
  const t = await getTranslations({ locale, namespace: 'AdminExpertPrereg' });
  const tOpt = await getTranslations({ locale, namespace: 'ExpertPrereg.options' });

  const query = await searchParams;
  const raw = Object.fromEntries(
    (['province', 'area', 'status', 'q'] as const)
      .map((k) => [k, typeof query[k] === 'string' && query[k] ? query[k] : undefined] as const)
      .filter(([, v]) => v !== undefined),
  );
  // An unknown filter value (a hand-edited URL) is dropped, not an error page.
  const parsed = expertPreRegFilterSchema.safeParse(raw);
  const filters: ExpertPreRegFilters = parsed.success ? parsed.data : {};

  let rows: ExpertPreRegRow[] = [];
  let loadError = false;
  try {
    rows = await listExpertPreRegistrations(filters, { take: PAGE_ROWS });
  } catch (e) {
    console.error(`[AdminExpertPreregPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

  const csvQuery = new URLSearchParams(
    Object.entries(filters).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''),
  ).toString();
  const csvHref = `/api/admin/expert-preregistrations/export.csv${csvQuery ? `?${csvQuery}` : ''}`;
  const statusLabel = (s: string) => ((STATUSES as readonly string[]).includes(s) ? t(`status.${s as (typeof STATUSES)[number]}`) : s);
  const list = (group: 'areas' | 'roles', slugs: string[]) =>
    slugs.length ? slugs.map((s) => tOpt(`${group}.${s}`)).join(', ') : t('none');

  const control =
    'mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const labelClass = 'block text-xs font-semibold text-ink-2';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">{t('subtitle')}</p>
        </div>
        <a
          href={csvHref}
          data-testid="ep-admin-csv"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t('export_csv')}
        </a>
      </header>

      <form method="get" className="rounded-xl border border-border bg-surface p-4" role="search" aria-label={t('filters_legend')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="ep-admin-q" className={labelClass}>
              {t('search_label')}
            </label>
            <input id="ep-admin-q" name="q" type="search" defaultValue={filters.q ?? ''} maxLength={120} className={control} />
          </div>
          <div>
            <label htmlFor="ep-admin-province" className={labelClass}>
              {t('province_label')}
            </label>
            <select id="ep-admin-province" name="province" defaultValue={filters.province ?? ''} className={control}>
              <option value="">{t('any')}</option>
              {PROVINCES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ep-admin-area" className={labelClass}>
              {t('area_label')}
            </label>
            <select id="ep-admin-area" name="area" defaultValue={filters.area ?? ''} className={control}>
              <option value="">{t('any')}</option>
              {EXPERTISE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {tOpt(`areas.${a}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ep-admin-status" className={labelClass}>
              {t('status_label')}
            </label>
            <select id="ep-admin-status" name="status" defaultValue={filters.status ?? ''} className={control}>
              <option value="">{t('any')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent-strong px-4 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t('apply')}
          </button>
          <a
            href={`/${locale}/admin/uzman-kayitlari`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t('reset')}
          </a>
        </div>
      </form>

      {loadError ? (
        <p role="alert" className="rounded-lg border border-bad bg-surface px-4 py-3 text-sm font-medium text-bad">
          {t('load_error')}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-ink-2">{t('empty')}</p>
      ) : (
        <>
          <p className="text-sm text-ink-2" data-testid="ep-admin-count">
            {t('count', { count: rows.length })}
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0} role="region" aria-label={t('table_caption')}>
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">{t('table_caption')}</caption>
              <thead className="bg-surface-hover text-xs font-semibold uppercase tracking-wide text-ink-2">
                <tr>
                  <th scope="col" className="px-3 py-2">{t('col_name')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_organization')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_province')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_areas')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_roles')}</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_status')}</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_founder')}</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_created')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-ink">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top" data-testid="ep-admin-row">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.fullName}</div>
                      <a href={`mailto:${r.email}`} className="break-all text-xs text-accent-ink underline underline-offset-2">
                        {r.email}
                      </a>
                    </td>
                    <td className="px-3 py-2 min-w-40">{r.organization ?? t('none')}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{PROVINCE_NAME.get(r.province) ?? r.province}</td>
                    <td className="px-3 py-2 min-w-48">{list('areas', r.expertiseAreas)}</td>
                    <td className="px-3 py-2 min-w-40">{list('roles', r.roles)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{statusLabel(r.status)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{r.founderNumber ?? t('none')}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{formatUtc(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
