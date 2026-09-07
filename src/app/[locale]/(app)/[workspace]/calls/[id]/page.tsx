'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { createOpportunity } from '../../pipeline/actions';

export default function CallDetailsPage({ params }: { params: Promise<{ id: string, workspace: string, locale: string }> }) {
  const resolvedParams = React.use(params);
  const { id, workspace, locale } = resolvedParams;
  const isTr = locale === 'tr';
  const t = useTranslations('callDetails');
  const call = {
    id,
    title: t('mockTitle'),
    programme: t('mockProgramme'),
    status: t('mockStatus'),
    typeOfAction: 'RIA (Research & Innovation Action)',
    budgetPerProjectCents: 500000000,
    numProjects: 3,
    deadlines: [
      { stage: 1, at: '2026-09-15T17:00:00Z' },
      { stage: 2, at: '2027-02-15T17:00:00Z' }
    ],
    description: t('mockDescription'),
    keywords: t('mockKeywords').split(',').map((kw) => kw.trim()),
  };
  const router = useRouter();
  const [isPending, setIsPending] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  const handleAddToPipeline = async () => {
    setIsPending(true);
    setAddError(null);
    try {
      await createOpportunity({ workspaceSlug: workspace, title: call.title, topicId: call.id });
      router.push(`/${locale}/${workspace}/firsatlar`);
    } catch (e) {
      console.error(e);
      setAddError(t('addError'));
      setIsPending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/${workspace}/cagrilar`}
          className="text-accent hover:underline text-xs sm:text-sm font-medium flex items-center gap-1"
        >
          ← {t('backToCalls')}
        </Link>
      </div>

      {addError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2 mb-6"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{addError}</span>
        </div>
      )}

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

          <button
            disabled={isPending}
            onClick={handleAddToPipeline}
            className="bg-accent hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition shadow-2xs shrink-0 text-xs sm:text-sm"
          >
            {isPending ? t('addingButton') : t('addButton')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-t border-b border-border py-6">
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              {t('keyMetrics')}
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-ink-2">
              <li>
                <strong className="text-ink">{t('budgetPerProject')}</strong> €{(call.budgetPerProjectCents / 100).toLocaleString()}
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
              {call.deadlines.map(d => (
                <li key={d.stage}>
                  <strong className="text-ink font-sans">{t('stageLabel', { stage: d.stage })}</strong> {new Date(d.at).toLocaleDateString(isTr ? 'tr-TR' : 'en-US')}
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
            {call.keywords.map(kw => (
              <span key={kw} className="bg-ground border border-border text-ink-2 px-3 py-1 rounded-full text-xs font-medium">
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
