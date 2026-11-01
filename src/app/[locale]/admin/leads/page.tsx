import React from 'react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PRODUCT_NAME } from '@/lib/brand';
import { errorMessage } from '@/lib/errors';
import {
  listPublicLeads,
  publicLeadDeletionDate,
  publicLeadRetentionMonths,
  type PublicLeadRow,
} from '@/lib/leads/public-lead';
import { PlatformAdminRequiredError, requirePlatformAdmin } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminLeads' });
  return { title: `${t('title')} · ${PRODUCT_NAME} Admin` };
}

/** UTC, like the other admin tables: `2026-09-30 14:05 UTC`. */
function formatUtc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

const LEVELS = ['baslangic', 'gelisen', 'hazir'] as const;

/**
 * Contact requests from the readiness result screen (TASK-MULR765AR5G0C).
 * Personal data: the admin layout already 404s a non-admin, and the page checks
 * the role again itself because it reads the rows. Read-only, no export.
 */
export default async function AdminLeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  try {
    await requirePlatformAdmin();
  } catch (e) {
    if (e instanceof PlatformAdminRequiredError) notFound();
    throw e;
  }
  const t = await getTranslations({ locale, namespace: 'adminLeads' });
  const tLevels = await getTranslations({ locale, namespace: 'readiness.levels' });

  let rows: PublicLeadRow[] = [];
  let total = 0;
  let loadError = false;
  try {
    ({ rows, total } = await listPublicLeads());
  } catch (e) {
    console.error(`[AdminLeadsPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

  const levelLabel = (level: string | null) =>
    LEVELS.find((l) => l === level) ? tLevels(level as (typeof LEVELS)[number]) : null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">{t('subtitle', { months: publicLeadRetentionMonths() })}</p>
      </header>

      {loadError ? (
        <p role="alert" className="rounded-lg border border-bad bg-surface px-4 py-3 text-sm font-medium text-bad">
          {t('load_error')}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-ink-2">{t('empty')}</p>
      ) : (
        <>
          <p className="text-sm text-ink-2">{t('count', { shown: rows.length, total })}</p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0} role="region" aria-label={t('table_caption')}>
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">{t('table_caption')}</caption>
              <thead className="bg-surface-hover text-xs font-semibold uppercase tracking-wide text-ink-2">
                <tr>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_created')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_name')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_email')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_org')}</th>
                  <th scope="col" className="px-3 py-2">{t('col_location')}</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_result')}</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_consent')}</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">{t('col_deletion')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-ink">
                {rows.map((r) => {
                  const level = levelLabel(r.readinessLevel);
                  const location = [r.province, r.district].filter(Boolean).join(' / ');
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{formatUtc(r.createdAt)}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">
                        <a href={`mailto:${r.email}`} className="break-all text-accent-ink underline underline-offset-2">
                          {r.email}
                        </a>
                      </td>
                      <td className="px-3 py-2">{r.organisation}</td>
                      <td className="px-3 py-2">{location || t('none')}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.readinessTotal !== null && level
                          ? t('result_value', { total: r.readinessTotal, level })
                          : t('none')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                        {r.consentVersion}
                        <br />
                        {formatUtc(r.consentAt)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                        {formatUtc(publicLeadDeletionDate(r.createdAt)).slice(0, 10)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
