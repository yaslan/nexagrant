import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getWorkspaceRoute } from '@/lib/routes';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';
import { cordisTopicPrefixSchema } from '@/lib/k2-cordis/api-query';
import { coordinatorLeaders, type CoordinatorLeaderRow } from '@/lib/k2-cordis/coordinator-leaders';

interface GlobalLeader {
  organisationId: string;
  name: string;
  totalProjects: number;
  coordinatorProjects: number;
  country: string | null;
  activityType: string | null;
}

export default async function LeadersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const { workspace, locale } = await params;
  const { topic } = await searchParams;
  const locked = await moduleGate('M1', locale);
  if (locked) return locked;
  const t = await getTranslations('PartnersLeaders');

  // `?topic=` filters by CORDIS topic-code prefix. Empty means the global list.
  const topicRaw = topic?.trim() ?? '';
  const topicCheck = topicRaw ? cordisTopicPrefixSchema.safeParse(topicRaw) : null;
  const topicPrefix = topicCheck?.success ? topicCheck.data : null;
  const topicInvalid = topicCheck !== null && !topicCheck.success;

  let leaders: GlobalLeader[] = [];
  let byTopic: CoordinatorLeaderRow[] = [];
  try {
    if (topicPrefix) {
      byTopic = await coordinatorLeaders({ topicPrefix, limit: 20 });
    } else if (!topicInvalid) {
      leaders = await prisma.cordisPartnerProfile.findMany({
        take: 20,
        orderBy: { totalProjects: 'desc' },
        select: {
          organisationId: true,
          name: true,
          totalProjects: true,
          coordinatorProjects: true,
          country: true,
          activityType: true,
        },
      });
    }
  } catch (e) {
    console.warn(`[LeadersPage] Failed to fetch leaders: ${errorMessage(e)}`);
  }

  const numberFormat = new Intl.NumberFormat(locale);
  const partnersHref = getWorkspaceRoute('partners', locale, workspace);

  return (
    <div className="max-w-6xl mx-auto py-8 sm:px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbDashboard')}
        </Link>
        <span>/</span>
        <Link href={partnersHref} className="hover:text-ink transition-colors">
          {t('breadcrumbPartners')}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{t('breadcrumbLeaders')}</span>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <Link href={partnersHref} className="text-accent hover:underline text-xs font-semibold">
          {t('backToPartners')}
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
          {topicPrefix ? t('titleByTopic', { prefix: topicPrefix }) : t('title')}
        </h1>
      </div>

      <p className="mb-6 text-xs md:text-sm text-muted max-w-3xl leading-relaxed">
        {topicPrefix ? t('introByTopic') : t('intro')}
      </p>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2 max-w-xl">
        <label className="flex-1 min-w-[12rem] text-xs font-semibold text-ink-2">
          {t('topicLabel')}
          <input
            type="text"
            name="topic"
            defaultValue={topicRaw}
            placeholder={t('topicPlaceholder')}
            maxLength={40}
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-ink"
          />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">
          {t('topicSubmit')}
        </button>
        {topicRaw ? (
          <Link href="?" className="px-2 py-2 text-xs font-semibold text-accent hover:underline">
            {t('topicClear')}
          </Link>
        ) : null}
      </form>

      {topicInvalid ? <p className="mb-6 text-xs text-red-700">{t('topicInvalid')}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {topicPrefix
          ? byTopic.map((org) => (
              <Link href={getWorkspaceRoute('partnerDetail', locale, workspace, org.organisationId)} key={org.organisationId} className="block group">
                <div className="bg-surface border border-border rounded-2xl p-5 hover:border-accent transition-all shadow-xs">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-mono font-bold bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded">
                      {t('picLabel')} {org.organisationId}
                    </span>
                    <span className="text-[10px] font-bold text-muted uppercase">{org.country || '—'}</span>
                  </div>
                  <h3 className="font-bold text-sm text-ink mb-2 truncate group-hover:text-accent transition-colors" title={org.name}>
                    {org.shortName || org.name}
                  </h3>

                  <div className="space-y-1.5 text-xs text-ink-2">
                    <div className="flex justify-between">
                      <span className="text-muted">{t('coordinatedLabel')}</span>
                      <span className="font-semibold text-ink">{numberFormat.format(org.coordinatedProjects)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">{t('ecContributionLabel')}</span>
                      <span className="font-semibold text-ink">{numberFormat.format(Number(org.totalEcContribution))} €</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          : leaders.map((org) => (
              <Link href={getWorkspaceRoute('partnerDetail', locale, workspace, org.organisationId)} key={org.organisationId} className="block group">
                <div className="bg-surface border border-border rounded-2xl p-5 hover:border-accent transition-all shadow-xs">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-mono font-bold bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded">
                      {t('picLabel')} {org.organisationId}
                    </span>
                    <span className="text-[10px] font-bold text-muted uppercase">{org.country || '—'} - {org.activityType || '—'}</span>
                  </div>
                  <h3 className="font-bold text-sm text-ink mb-2 truncate group-hover:text-accent transition-colors" title={org.name}>{org.name}</h3>

                  <div className="space-y-1.5 text-xs text-ink-2">
                    <div className="flex justify-between">
                      <span className="text-muted">{t('coordinatedLabel')}</span>
                      <span className="font-semibold text-ink">{org.coordinatorProjects}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">{t('totalLabel')}</span>
                      <span className="font-semibold text-ink">{org.totalProjects}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
      </div>

      {topicPrefix && byTopic.length === 0 ? <p className="text-xs text-muted">{t('noTopicResults')}</p> : null}
    </div>
  );
}
