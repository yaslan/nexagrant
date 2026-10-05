import React from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { readTenantReadiness } from '@/lib/readiness/account';
import { scoreReadiness } from '@/lib/readiness/score';
import { buildShareQuery, readinessPath } from '@/lib/readiness/share';
import { toTenantProvince } from '@/lib/province';

/** Gaps listed on the card; the rest are one click away on the full result. */
const GAPS_SHOWN = 5;

const link =
  'inline-flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

/**
 * FB KAMU B6 (TASK-MULRR8P7HIII4) — "Hazırlık durumu" on the organisation's own
 * dashboard: the scorecard result the person chose to add at registration
 * (Tenant.settings.readiness, see src/lib/readiness/account.ts). Score, level
 * and gaps are recomputed from the stored answers with scoreReadiness, so they
 * match the scorecard. Renders nothing for a tenant with no stored result, and
 * nothing when the read fails: the KPI dashboard must not break over this card.
 */
export async function ReadinessCard({ tenantId, locale }: { tenantId: string; locale: string }) {
  let tenant: { settings: unknown; province: string | null; country: string } | null;
  try {
    // Tenant is a system-wide table (not under RLS); the id is the session's own.
    tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true, province: true, country: true },
    });
  } catch (e) {
    console.warn(`[Dashboard.ReadinessCard] tenant read failed, card skipped: ${errorMessage(e)}`);
    return null;
  }
  const stored = readTenantReadiness(tenant?.settings);
  if (!tenant || !stored) return null;

  const t = await getTranslations({ locale, namespace: 'readiness' });
  const tCard = await getTranslations({ locale, namespace: 'Dashboard' });
  const province = toTenantProvince(tenant.province, tenant.country);
  const result = scoreReadiness(stored.answers, stored.orgType, { province });
  const shown = result.gaps.slice(0, GAPS_SHOWN);
  const query = buildShareQuery(stored.orgType, stored.answers, province);
  const importedAt = stored.importedAt ? new Date(stored.importedAt) : null;

  return (
    <section
      aria-labelledby="readiness-card-title"
      data-testid="readiness-card"
      className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="readiness-card-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            {tCard('readinessTitle')}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t(`orgTypes.${stored.orgType}`)}
            {importedAt && !Number.isNaN(importedAt.getTime()) && (
              <>
                {' · '}
                {tCard('readinessImportedAt', {
                  date: importedAt.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB'),
                })}
              </>
            )}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-3xl font-bold text-gray-900 tabular-nums dark:text-white" data-testid="readiness-card-score">
            {t('score_out_of', { score: result.total0to100 })}
          </p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t(`levels.${result.level}`)}</p>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-gray-900 dark:text-white">{t('gaps_title')}</h3>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('gaps_empty')}</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="readiness-card-gaps">
          {shown.map((g) => (
            <li key={g.questionId} className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
              <span
                className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  g.severity === 'critical'
                    ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200'
                }`}
              >
                {g.severity === 'critical' ? t('gap_critical') : t('gap_improve')}
              </span>
              <span className="leading-relaxed">{t(`gaps.${g.questionId}`)}</span>
            </li>
          ))}
        </ul>
      )}
      {result.gaps.length > shown.length && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {tCard('readinessMoreGaps', { count: result.gaps.length - shown.length })}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {query && (
          <a
            href={`${readinessPath(locale)}?${query}`}
            className={`${link} border border-gray-300 text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700`}
          >
            {tCard('readinessViewResult')}
          </a>
        )}
        <a
          href={readinessPath(locale)}
          data-testid="readiness-card-retake"
          className={`${link} bg-blue-600 text-white hover:bg-blue-700`}
        >
          {tCard('readinessRetake')}
        </a>
      </div>
    </section>
  );
}
