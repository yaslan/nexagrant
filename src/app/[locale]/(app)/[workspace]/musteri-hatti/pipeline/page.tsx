import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { moduleGate } from '@/lib/modules/guard';
import { formatMoney } from '@/lib/money';
import { asRole, can } from '@/lib/rbac';
import { listDealsByStage } from '@/modules/m18/server/deals-repo';
import { SectionNav } from '../_components/section-nav';
import { LiveNoticeProvider } from '../_components/live-notice';
import { StageSelect } from '../_components/client-forms';

/** The 12-stage board: nine open stages, then WON / REJECTED / LOST. Empty columns stay visible. */
export default async function ClientPipelinePage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId, role } = await requireTenantPageRole(locale, 'client_pipeline_read');
  const locked = await moduleGate('M18', locale);
  if (locked) return locked;
  const canWrite = can(asRole(role), 'client_pipeline_write');
  const t = await getTranslations({ locale, namespace: 'm18' });

  const columns = await withTenant(tenantId, (tx) => listDealsByStage(tx, tenantId));

  return (
    <LiveNoticeProvider>
      <main className="space-y-6 p-6">
        <h1 className="text-2xl font-semibold">{t('pipeline.heading')}</h1>
        <SectionNav locale={locale} workspace={workspace} active="pipeline" />
        <div className="flex gap-4 overflow-x-auto pb-4" role="list">
          {columns.map((col) => (
            <section
              key={col.stage}
              role="listitem"
              aria-labelledby={`stage-${col.stage}`}
              className="w-64 shrink-0 rounded border border-slate-200 bg-slate-50 p-3"
            >
              <h2 id={`stage-${col.stage}`} className="mb-2 text-sm font-semibold">
                {t('pipeline.columnTitle', { stage: t(`stage.${col.stage}`), count: col.deals.length })}
              </h2>
              {col.deals.length === 0 ? (
                <p className="text-xs text-slate-600">{t('pipeline.empty')}</p>
              ) : (
                <ul className="space-y-2">
                  {col.deals.map((deal) => (
                    <li key={deal.id} className="rounded border border-slate-200 bg-white p-2 text-sm">
                      <Link href={`/${locale}/${workspace}/musteri-hatti/leads/${deal.organizationId}`} className="font-medium text-sky-800 underline">
                        {deal.title}
                      </Link>
                      <p className="text-xs text-slate-600">{deal.organization.name}</p>
                      {deal.estimatedFeeCents != null ? (
                        <p className="text-xs tabular-nums">
                          {t('pipeline.fee')}: {formatMoney(deal.estimatedFeeCents, deal.currency, locale)}
                        </p>
                      ) : null}
                      {canWrite ? (
                        <div className="mt-2">
                          <StageSelect dealId={deal.id} stage={deal.stage} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </LiveNoticeProvider>
  );
}
