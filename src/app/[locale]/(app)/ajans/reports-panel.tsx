import { getTranslations } from 'next-intl/server';
import type { AgencyReportListItem } from '@/lib/agency/report';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const link = `inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-hover ${focusRing}`;

/**
 * The agency's monthly region reports (FB KAMU B3, TASK-MULRR08Y9YI77). Each is a
 * stored copy of the dashboard's masked numbers; downloads only, no e-mail.
 * "PDF" is the browser's print dialog, and the link says so.
 */
export default async function ReportsPanel({ locale, reports }: { locale: string; reports: AgencyReportListItem[] }) {
  const t = await getTranslations({ locale, namespace: 'agency.reports' });
  const dateLocale = locale === 'en' ? 'en-GB' : 'tr-TR';
  const lang = locale === 'en' ? 'en' : 'tr';

  return (
    <section aria-labelledby="agency-reports-title" className="space-y-3" data-testid="agency-reports">
      <div>
        <h2 id="agency-reports-title" className="font-heading text-xl font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">{t('description')}</p>
      </div>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-2">{t('empty')}</p>
      ) : (
        <ul aria-label={t('listLabel')} className="divide-y divide-border rounded-xl border border-border bg-surface">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4" data-testid="agency-report-row">
              <div className="min-w-40 grow">
                <p className="font-semibold text-ink">
                  {t('period')}: <span className="tabular-nums">{r.period}</span>
                </p>
                <p className="text-sm text-ink-2">
                  {t('generatedAt')}:{' '}
                  {r.generatedAt.toLocaleDateString(dateLocale, { timeZone: 'Europe/Istanbul' })}
                </p>
              </div>
              <a className={link} href={`/api/agency/reports/${r.id}?format=print&locale=${lang}`} target="_blank" rel="noopener">
                {t('downloadPrint')}
              </a>
              <a className={link} href={`/api/agency/reports/${r.id}?format=csv&locale=${lang}`} download>
                {t('downloadCsv')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
