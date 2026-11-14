import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { formatMinorWhole } from '@/lib/money';
import { requireTenantPage } from '@/lib/tenant';
import { normalizeWorkspaceSlug, resolveScopedWorkspace } from '@/lib/workspaces';
import { getWorkspaceRoute, publicCallDetailHref } from '@/lib/routes';
import AddToPipelineButton from './add-button';
import { PartnerSignalBox } from '@/modules/m1/ui/partner-search/PartnerSignalBox';
import { createRelationship } from '../../relationships/actions';

export default async function CallDetailsPage({
  params,
}: {
  params: Promise<{ id: string; workspace: string; locale: string }>;
}) {
  const { id, workspace, locale } = await params;

  // The `[workspace]` segment is only a request (TASK-MUO12A7NHANOT, İNCELEME-76
  // Y-1). "Add to pipeline" below writes into it, so the page renders only under
  // a live workspace this membership covers: the `default` alias is replaced by
  // the real slug, and any other slug goes back through the workspace-free route,
  // which picks a permitted one (or /no-workspace). `createOpportunity` checks
  // again on write; this keeps the button from being offered for a workspace it
  // would refuse.
  //
  // The segment is normalised first (TASK-MUO64UQJUWEBI, İNCELEME-83 O-1): it may
  // arrive percent-encoded or upper-cased, and one that cannot be a slug at all is a
  // 404 here — sending it back through the workspace-free route is what looped.
  const scope = await requireTenantPage(locale);
  const requested = normalizeWorkspaceSlug(workspace);
  if (!requested) notFound();
  const scoped = await resolveScopedWorkspace(scope, requested);
  if (!scoped) redirect(publicCallDetailHref(locale, id));
  if (scoped.slug !== workspace) {
    redirect(getWorkspaceRoute('callDetail', locale, scoped.slug, encodeURIComponent(id)));
  }
  const isTr = locale === 'tr';
  const t = await getTranslations('callDetails');

  let call: {
    id: string;
    title: string;
    programme: string;
    status: string;
    typeOfAction: string;
    budgetPerProjectCents: number;
    /** ISO-4217 of `budgetPerProjectCents` (Call.currency for a stored topic; SEDIA is always EUR). */
    currency: string;
    numProjects: number;
    deadlines: Array<{ stage: number; at: string }>;
    description: string;
    keywords: string[];
  } | null = null;

  try {
    const dbTopic = await prisma.topic.findFirst({
      where: { OR: [{ id }, { identifier: id }] },
      include: { call: { include: { programme: true } } },
    });

    if (dbTopic) {
      call = {
        id: dbTopic.identifier,
        title: dbTopic.title,
        programme: dbTopic.call?.programme?.name || 'Horizon Europe',
        status: dbTopic.status,
        typeOfAction: dbTopic.typeOfAction || 'RIA (Research & Innovation Action)',
        // The stored amount when the topic has one (TR agency topics are in TRY); the old placeholder
        // only stands in for a topic that publishes none, and is euro.
        budgetPerProjectCents:
          dbTopic.budgetPerProjectCents !== null &&
          dbTopic.budgetPerProjectCents <= BigInt(Number.MAX_SAFE_INTEGER)
            ? Number(dbTopic.budgetPerProjectCents)
            : 500000000,
        currency:
          dbTopic.budgetPerProjectCents !== null ? dbTopic.call?.currency?.trim() || 'EUR' : 'EUR',
        numProjects: 3,
        deadlines: (dbTopic.deadlines as Array<{ stage: number; at: string }>) || [],
        description: t('mockDescription'),
        keywords: t('mockKeywords').split(',').map((kw) => kw.trim()),
      };
    } else {
      // Try live SEDIA fetch for valid topic identifier
      const adapter = new SediaAdapter();
      const result = await adapter.searchSedia({ text: id, pageSize: 5 });
      const matched = result.topics.find(
        (top) => top.identifier.toLowerCase() === id.toLowerCase()
      );

      if (matched) {
        call = {
          id: matched.identifier,
          title: matched.title,
          programme: matched.frameworkProgramme || 'Horizon Europe',
          status: matched.status,
          typeOfAction: matched.typeOfAction || 'RIA (Research & Innovation Action)',
          budgetPerProjectCents: matched.budgetPerProjectCents || 500000000,
          currency: 'EUR',
          numProjects: matched.numProjects || 3,
          deadlines: matched.deadlines?.map((d) => ({ stage: d.stage, at: d.at })) || [],
          description: matched.description || t('mockDescription'),
          keywords: matched.keywords || t('mockKeywords').split(',').map((kw) => kw.trim()),
        };
      }
    }
  } catch (e) {
    console.warn(`[CallDetailsPage] Topic resolution warning for ${id}:`, e);
  }

  if (!call) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto py-4 sm:px-4 md:p-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/${workspace}/cagrilar`}
          className="text-accent hover:underline text-xs sm:text-sm font-medium flex items-center gap-1"
        >
          ← {t('backToCalls')}
        </Link>
      </div>

      <div className="bg-surface p-6 md:p-8 rounded-xl shadow-xs border border-border">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold bg-accent/15 text-accent-ink border border-accent/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {call.programme}
              </span>
              <span className="text-xs font-semibold bg-ok/15 text-ok border border-ok/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {call.status}
              </span>
              <span className="text-xs font-semibold bg-ground text-ink-2 border border-border px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {call.typeOfAction}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink mb-2">{call.title}</h1>
            <p className="text-muted font-mono text-xs sm:text-sm">{call.id}</p>
          </div>

          <AddToPipelineButton
            workspace={workspace}
            locale={locale}
            title={call.title}
            topicId={call.id}
            buttonLabel={t('addButton')}
            addingLabel={t('addingButton')}
            errorLabel={t('addError')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-t border-b border-border py-6">
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              {t('keyMetrics')}
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-ink-2">
              <li>
                <strong className="text-ink">{t('budgetPerProject')}</strong> {formatMinorWhole(call.budgetPerProjectCents, call.currency, locale)}
              </li>
              <li>
                <strong className="text-ink">{t('expectedProjects')}</strong> {call.numProjects}
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              {t('deadlinesTitle')}
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-ink-2 font-mono">
              {call.deadlines.map((d) => (
                <li key={d.stage}>
                  <strong className="text-ink font-sans">{t('stageLabel', { stage: d.stage })}</strong>{' '}
                  {new Date(d.at).toLocaleDateString(isTr ? 'tr-TR' : 'en-US')}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h2 className="text-lg sm:text-xl font-bold text-ink mb-4 font-heading">
            {t('topicDescriptionTitle')}
          </h2>
          <div className="prose max-w-none text-ink-2 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
            {call.description}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            {t('keywordsTitle')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {call.keywords.map((kw) => (
              <span key={kw} className="bg-ground border border-border text-ink-2 px-3 py-1 rounded-full text-xs font-medium">
                {kw}
              </span>
            ))}
          </div>
        </div>

        <PartnerSignalBox
          topicIdentifier={call.id}
          upgradeHref={getWorkspaceRoute('settingsBilling', locale, workspace)}
          links={{
            partnerHref: getWorkspaceRoute('partnerDetail', locale, workspace, ':pic'),
            addToRelationships: createRelationship,
          }}
        />
      </div>
    </div>
  );
}
