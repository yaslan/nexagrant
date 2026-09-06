import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { Role } from '@prisma/client';
import { Dashboard } from '@/modules/m5/ui/Dashboard';
import { getKpiMetrics, getKpiTrend } from '@/modules/m5/server/queries';

const DEFAULT_RANGE_DAYS = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard' });

  return {
    title: `${t('title')} — Fabrika`,
    description: t('metaDescription'),
    // KPI figures are tenant data; keep the page out of every index.
    robots: { index: false, follow: false },
  };
}

/** `YYYY-MM-DD` in local time — the client sends the same shape back. */
function toParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Accepts `YYYY-MM-DD` only; anything else falls back to the default range. */
function parseRangeParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function Notice({ title, body, detail }: { title: string; body: string; detail?: string }) {
  return (
    <div className="max-w-2xl mx-auto p-8 text-center" role="alert">
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-ink-2">{body}</p>
      {detail && <p className="text-xs text-gray-500 mt-4">{detail}</p>}
    </div>
  );
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await params;
  const { from, to } = await searchParams;
  const t = await getTranslations('Dashboard');

  const session = (await auth()) as unknown;
  const sessionObj = session as { tenantId?: string; role?: string } | null;
  const tenantId = sessionObj?.tenantId;
  const userRole = sessionObj?.role as Role | undefined;

  // Authorization: pipeline manager and above (plan/module gating happens upstream).
  if (!can(userRole, 'evaluate_gates')) {
    return <Notice title={t('accessDeniedTitle')} body={t('accessDeniedBody')} />;
  }

  if (!tenantId) {
    return <Notice title={t('sessionErrorTitle')} body={t('sessionErrorBody')} />;
  }

  const today = new Date();
  const toDate =
    parseRangeParam(to) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const parsedFrom = parseRangeParam(from);
  const fromDate =
    parsedFrom && parsedFrom <= toDate
      ? parsedFrom
      : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  // The range is inclusive of the end day.
  const rangeEnd = new Date(toDate.getTime() + 24 * 60 * 60 * 1000 - 1);

  let metrics;
  let trendData;

  try {
    [metrics, trendData] = await Promise.all([
      getKpiMetrics(tenantId, fromDate, rangeEnd),
      getKpiTrend(tenantId, fromDate, rangeEnd),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Dashboard] KPI query failed:', msg);
    return <Notice title={t('loadErrorTitle')} body={t('loadErrorBody')} />;
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <Dashboard
        metrics={metrics}
        trendData={trendData}
        from={toParam(fromDate)}
        to={toParam(toDate)}
      />
    </div>
  );
}
