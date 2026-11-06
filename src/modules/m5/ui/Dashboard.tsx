'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { KpiCard } from './KpiCard';
import { DateRangeFilter } from './DateRangeFilter';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getWorkspaceRoute } from '@/lib/routes';
import type { KpiMetrics, MetricValue } from '../server/queries';

export interface DashboardProps {
  metrics: KpiMetrics;
  trendData: Array<{ date: string; metric: string; value: number }>;
  /** Applied range — resolved on the server from the `from`/`to` search params. */
  from: string;
  to: string;
  /** Rendered under the page header, above the tabs (the B6 readiness card). */
  aside?: ReactNode;
  /**
   * The reader may open Settings › Modules (`can(role, 'manage_modules')`, decided on the
   * server). Without it the active-modules card is not a link: that page refuses them.
   */
  canManageModules?: boolean;
}

type Tab = 'overview' | 'trends' | 'export';

/** `YYYY-MM-DD` in local time; the server parses these back into the range. */
function toParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function Dashboard({
  metrics,
  trendData,
  from,
  to,
  aside,
  canManageModules = false,
}: DashboardProps) {
  const t = useTranslations('Dashboard');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // The range lives in the URL so the server component refetches on change and
  // the filtered view stays shareable and bookmarkable.
  const handleRangeChange = useCallback(
    (range: { from: Date; to: Date }) => {
      const params = new URLSearchParams({
        from: toParam(range.from),
        to: toParam(range.to),
      });
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router]
  );

  const mergedTrendData = useMemo(() => {
    const byDate = new Map<string, { date: string; offers: number; successRate: number }>();
    for (const point of trendData) {
      const row = byDate.get(point.date) ?? { date: point.date, offers: 0, successRate: 0 };
      if (point.metric === 'offers') row.offers = point.value;
      if (point.metric === 'success_rate') row.successRate = point.value;
      byDate.set(point.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [trendData]);

  const exportHref = `${pathname}/api/export-csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const count = (value: number) => value.toLocaleString(locale);
  const decimal = (value: number) =>
    value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  /**
   * One KPI card, honest about absence.
   *
   * An unmeasured metric prints a readable "no data" instead of a formatted 0, drops the
   * unit (there is no "0.0 %" to qualify) and falls back to the neutral variant — the
   * green "success" frame around a missing hit rate would read as a good result.
   * The description is swapped for the reason, so the card says *why* it is empty and
   * what would fill it, rather than leaving the reader to guess.
   */
  const metricCard = (opts: {
    title: string;
    metric: MetricValue;
    unit: string;
    description: string;
    emptyDescription: string;
    variant?: 'default' | 'success' | 'warning';
    href: string;
  }) =>
    opts.metric.measured ? (
      <KpiCard
        title={opts.title}
        value={decimal(opts.metric.value)}
        unit={opts.unit}
        description={opts.description}
        variant={opts.variant ?? 'default'}
        href={opts.href}
        actionHint={t('cardLinkAction')}
      />
    ) : (
      <KpiCard
        title={opts.title}
        value={t('noData')}
        description={opts.emptyDescription}
        variant="default"
        unmeasured
        href={opts.href}
        actionHint={t('cardLinkAction')}
      />
    );

  // The workspace slug sits between the locale and the page segment: /tr/<workspace>/panel.
  const workspace = pathname.split('/')[2] ?? 'default';
  const pipelineHref = getWorkspaceRoute('pipeline', locale, workspace);
  // Where each card's figure is worked on (FO-69). None of these pages reads a date range,
  // so the panel's `from`/`to` is not carried: a query the target ignores would only
  // suggest a filter that is not there. The pipeline board is the stage-gate view, so it
  // is also where scores, gate outcomes and G0→G2 progress are worked on.
  const personDaysHref = getWorkspaceRoute('reportsPersonDays', locale, workspace);
  const modulesHref = canManageModules
    ? getWorkspaceRoute('settingsModules', locale, workspace)
    : undefined;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: t('tabOverview') },
    { id: 'trends', label: t('tabTrends') },
    { id: 'export', label: t('tabExport') },
  ];

  const tabClass = (isActive: boolean) =>
    `px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
      isActive
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
        <DateRangeFilter
          from={new Date(`${from}T00:00:00`)}
          to={new Date(`${to}T00:00:00`)}
          onChange={handleRangeChange}
        />
      </div>

      {aside}

      <div role="tablist" className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`dashboard-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`dashboard-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={tabClass(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div
          id="dashboard-panel-overview"
          role="tabpanel"
          aria-labelledby="dashboard-tab-overview"
        >
          {/* A workspace with no opportunities at all has no KPIs to round down to zero.
              Six cards reading "0,0 %" tell a tenant on day one that its hit rate is
              zero, which is a verdict on work it has not started. Say that instead, and
              point at the one action that starts producing the numbers. */}
          {!metrics.hasAnyOpportunity ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-8 text-center max-w-xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('emptyTitle')}
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('emptyBody')}</p>
              <a
                href={pipelineHref}
                className="mt-6 inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                {t('emptyCta')}
              </a>
            </div>
          ) : metrics.totalOffers === 0 ? (
            /* Opportunities exist, this range just has none — a different sentence, and
               one the reader can act on without leaving the page. */
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-8 text-center max-w-xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('emptyRangeTitle')}
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('emptyRangeBody')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                title={t('totalProposals')}
                value={count(metrics.totalOffers)}
                unit={t('unitProjects')}
                description={t('descTotalProposals')}
                variant="default"
                href={pipelineHref}
                actionHint={t('cardLinkAction')}
              />
              {metricCard({
                title: t('hitRate'),
                metric: metrics.successRate,
                unit: '%',
                description: t('descHitRate'),
                emptyDescription: t('emptyHitRate'),
                href: pipelineHref,
                variant: 'success',
              })}
              {metricCard({
                title: t('thresholdRate'),
                metric: metrics.thresholdRate,
                unit: '%',
                description: t('descThresholdRate'),
                emptyDescription: t('emptyThresholdRate'),
                href: pipelineHref,
              })}
              {metricCard({
                title: t('averageScore'),
                metric: metrics.averageScore,
                unit: t('unitScore'),
                description: t('descAverageScore'),
                emptyDescription: t('emptyAverageScore'),
                href: pipelineHref,
              })}
              {metricCard({
                title: t('personDays'),
                metric: metrics.personDays,
                unit: t('unitDays'),
                description: t('descPersonDays'),
                emptyDescription: t('emptyPersonDays'),
                href: personDaysHref,
              })}
              {metricCard({
                title: t('avgDaysG2'),
                metric: metrics.g0ToG2Days,
                unit: t('unitDays'),
                description: t('descAvgDaysG2'),
                emptyDescription: t('emptyAvgDaysG2'),
                href: pipelineHref,
                variant: 'warning',
              })}
              <KpiCard
                title={t('activeModules')}
                value={count(metrics.activeModules)}
                unit={t('unitModules')}
                description={t('descActiveModules')}
                variant="success"
                href={modulesHref}
                actionHint={modulesHref ? t('cardLinkAction') : undefined}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'trends' && (
        <div
          id="dashboard-panel-trends"
          role="tabpanel"
          aria-labelledby="dashboard-tab-trends"
          className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {t('trendChartTitle')}
          </h2>
          {mergedTrendData.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('emptyTrend')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mergedTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="offers"
                  stroke="#3b82f6"
                  dot={false}
                  name={t('legendOffers')}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="successRate"
                  stroke="#10b981"
                  dot={false}
                  name={t('legendSuccessRate')}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {activeTab === 'export' && (
        <div
          id="dashboard-panel-export"
          role="tabpanel"
          aria-labelledby="dashboard-tab-export"
          className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {t('exportTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t('exportBody')}</p>
          <a
            href={exportHref}
            aria-label={t('exportAria')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            <span aria-hidden="true">⬇</span>
            {t('exportButton')}
          </a>
        </div>
      )}
    </div>
  );
}
