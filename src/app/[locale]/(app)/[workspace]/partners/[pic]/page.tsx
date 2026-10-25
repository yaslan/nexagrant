import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { errorMessage } from '@/lib/errors';
import { formatWholeMoney } from '@/lib/money';
import { moduleGate } from '@/lib/modules/guard';
import { getTranslations } from 'next-intl/server';
import { PartnerOutreach, type PartnerOutreachProps } from '@/modules/m1/ui/PartnerOutreach';

interface OrgDetail {
  id: string;
  name: string;
  country: string | null;
  activityType: string | null;
  sme: boolean;
  participationCount: number;
  coordinatorCount: number;
  ecContributionSum: bigint;
  participations: Array<{
    projectId: string;
    organisationId: string;
    role: string;
    ecContribution: bigint | null;
    project: {
      id: string;
      acronym: string | null;
      title: string | null;
    } | null;
  }>;
}

export default async function PartnerDetailPage({
  params
}: {
  params: Promise<{ pic: string; locale: string; workspace: string }>
}) {
  const { pic, workspace, locale } = await params;
  const locked = await moduleGate('M1', locale);
  if (locked) return locked;
  const t = await getTranslations('PartnerDetail');

  let org: OrgDetail | null = null;
  let topics: PartnerOutreachProps['topics'] = [];
  try {
    const cordisOrg = await prisma.cordisOrganization.findUnique({
      where: { organisationId: pic },
    });

    if (cordisOrg) {
      const participations = await prisma.cordisParticipation.findMany({
        where: { organisationId: pic },
        include: { project: { select: { id: true, acronym: true, title: true } } },
      });

      const coordinatorCount = participations.filter((p: typeof participations[number]) => p.role === 'coordinator').length;
      const ecSum = participations.reduce((sum: bigint, p: typeof participations[number]) => sum + (p.ecContribution || BigInt(0)), BigInt(0));

      org = {
        id: cordisOrg.organisationId,
        name: cordisOrg.name,
        country: cordisOrg.country,
        activityType: cordisOrg.activityType,
        sme: cordisOrg.sme,
        participationCount: participations.length,
        coordinatorCount,
        ecContributionSum: ecSum,
        participations,
      };

      // K4 outreach: the organisation's topics, most frequent first, to seed external searches.
      const projectTopics = await prisma.cordisProjectTopic.findMany({
        where: { projectId: { in: participations.map((p) => p.projectId) } },
        select: { topicCode: true, topicTitle: true },
      });
      const topicCounts = new Map<string, { code: string; title: string | null; count: number }>();
      for (const tp of projectTopics) {
        const entry = topicCounts.get(tp.topicCode) ?? { code: tp.topicCode, title: tp.topicTitle, count: 0 };
        entry.count += 1;
        topicCounts.set(tp.topicCode, entry);
      }
      topics = [...topicCounts.values()]
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
        .slice(0, 15)
        .map(({ code, title }) => ({ code, title }));
    }
  } catch (e) {
    console.warn(`[PartnerDetailPage] Failed to fetch organization: ${errorMessage(e)}`);
  }

  if (!org) return notFound();

  // Both languages' templates: the user may write to a foreign partner from a Turkish UI.
  const [tTr, tEn] = await Promise.all([
    getTranslations({ locale: 'tr', namespace: 'PartnerOutreach' }),
    getTranslations({ locale: 'en', namespace: 'PartnerOutreach' }),
  ]);
  const templates: PartnerOutreachProps['templates'] = {
    tr: tTr.raw('templates') as PartnerOutreachProps['templates']['tr'],
    en: tEn.raw('templates') as PartnerOutreachProps['templates']['en'],
  };

  return (
    <div className="max-w-5xl mx-auto py-8 sm:px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbDashboard')}
        </Link>
        <span>/</span>
        <Link href={getWorkspaceRoute('partners', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbPartners')}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{org.name}</span>
      </div>

      <div className="mb-6">
        <Link 
          href={getWorkspaceRoute('partners', locale, workspace)} 
          className="text-accent hover:underline text-xs font-semibold flex items-center gap-1"
        >
          {t('backToPartners')}
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 mb-8 shadow-xs">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink mb-2">{org.name}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted mb-6">
              <span className="bg-ground border border-border px-2.5 py-1 rounded-md font-mono">PIC: {org.id}</span>
              <span className="bg-ground border border-border px-2.5 py-1 rounded-md">{t('countryLabel', { value: org.country || '-' })}</span>
              <span className="bg-ground border border-border px-2.5 py-1 rounded-md">{t('typeLabel', { value: org.activityType || '-' })}</span>
              {org.sme && <span className="bg-accent/15 text-accent-ink border border-accent/20 px-2.5 py-1 rounded-md font-bold">{t('smeBadge')}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-ground border border-border rounded-xl">
            <div className="text-xs text-muted font-medium">{t('totalParticipations')}</div>
            <div className="text-2xl font-bold text-ink mt-1">{org.participationCount}</div>
          </div>
          <div className="p-4 bg-ground border border-border rounded-xl">
            <div className="text-xs text-muted font-medium">{t('coordinatorRoles')}</div>
            <div className="text-2xl font-bold text-ink mt-1">{org.coordinatorCount}</div>
          </div>
          <div className="p-4 bg-ground border border-border rounded-xl">
            <div className="text-xs text-muted font-medium">{t('totalEcFunding')}</div>
            <div className="text-xl md:text-2xl font-bold text-ink font-mono mt-1">{formatWholeMoney(org.ecContributionSum, 'EUR', locale)}</div>
          </div>
        </div>

        {/* Network Graph Placeholder */}
        <div className="mb-8">
          <h2 className="text-lg font-bold font-heading text-ink mb-4">{t('graphTitle')}</h2>
          <div className="h-48 bg-ground rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted text-xs text-center p-4">
            {t('graphPlaceholder')}
          </div>
        </div>

        <div className="mb-8">
          <PartnerOutreach
            orgName={org.name}
            country={org.country}
            topics={topics}
            templates={templates}
            locale={locale}
          />
        </div>

        <div>
          <h2 className="text-lg font-bold font-heading text-ink mb-4">{t('pastProjects')}</h2>
          <div className="space-y-3">
            {org.participations.map((p) => (
              <div key={`${p.projectId}-${p.organisationId}`} className="p-4 border border-border rounded-xl bg-surface hover:bg-surface-hover transition-colors flex justify-between items-center gap-4">
                <div>
                  <div className="font-bold text-accent text-sm">{p.project?.acronym}</div>
                  <div className="text-xs text-ink-2 truncate max-w-md">{p.project?.title}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase font-bold text-muted">{p.role}</div>
                  <div className="font-mono text-xs font-semibold text-ink">{formatWholeMoney(p.ecContribution ?? 0n, 'EUR', locale)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
