import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { asRole, can } from '@/lib/rbac';
import { landingPathFor } from '@/lib/landing';
import { Role } from '@prisma/client';
import { PRODUCT_NAME } from '@/lib/brand';
import { Dashboard } from '@/modules/m5/ui/Dashboard';
import { getKpiMetrics, getKpiTrend } from '@/modules/m5/server/queries';
import { resolveDashboardRange, toRangeParam } from '@/modules/m5/server/range';
import { ReadinessCard } from './readiness-card';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard' });

  return {
    title: `${t('title')} — ${PRODUCT_NAME}`,
    description: t('metaDescription', { brand: PRODUCT_NAME }),
    // KPI figures are tenant data; keep the page out of every index.
    robots: { index: false, follow: false },
  };
}

function Notice({ title, body, detail }: { title: string; body: string; detail?: string }) {
  return (
    <div className="max-w-2xl mx-auto py-8 sm:px-8 text-center" role="alert">
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
  const { locale, workspace } = await params;
  const { from, to } = await searchParams;
  const t = await getTranslations('Dashboard');

  const session = (await auth()) as unknown;
  const sessionObj = session as { tenantId?: string; role?: string } | null;
  const tenantId = sessionObj?.tenantId;
  const userRole = sessionObj?.role as Role | undefined;

  // No tenant is not a missing permission: a tenantless session has no role
  // either, so checking the role first told someone removed from their
  // tenant that they needed a higher one (TASK-MUNWZA26VGK0B, İNCELEME-68 Y-1).
  // They go where every other tenant page sends them.
  if (!tenantId) {
    redirect(`/${locale}/no-workspace`);
  }

  // Authorization: pipeline manager and above (plan/module gating happens upstream).
  if (!can(userRole, 'evaluate_gates')) {
    // The sign-in default is this page for every role (AuthCard), so a member or
    // writer is sent on to the screen their role can open instead of a refusal
    // (QA Y-1, TASK-MUPUGXME9DP6K). The gate itself is unchanged; a role the
    // table does not know still gets the refusal.
    const known = asRole(userRole);
    if (known) redirect(landingPathFor(known, locale, workspace));
    return <Notice title={t('accessDeniedTitle')} body={t('accessDeniedBody')} />;
  }

  const { from: fromDate, to: toDate, rangeEnd } = resolveDashboardRange(from, to);

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
    <div className="space-y-8 py-6 sm:px-6 max-w-7xl mx-auto">
      <Dashboard
        metrics={metrics}
        trendData={trendData}
        from={toRangeParam(fromDate)}
        to={toRangeParam(toDate)}
        canManageModules={can(userRole, 'manage_modules')}
        aside={<ReadinessCard tenantId={tenantId} locale={locale} />}
      />
    </div>
  );
}
