import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenantPage } from '@/lib/tenant';
import { trlCriterionState } from '@/lib/project-ideas/validate';
import ProjectIdeaForm from './ProjectIdeaForm';

/**
 * Project idea entry page (NG-14, FE-2.3).
 *
 * The TRL criterion reads "eksik" (missing) until a project idea exists, and points
 * the user at the form below. Reading saved ideas is NG-38's job (BE-05): until that
 * table and its read path land, the idea count is 0 here, so the criterion stays
 * "eksik" — which is the true state, not a placeholder.
 */
export default async function ProjectIdeaPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  // Redirects anonymous or non-member visitors; never returns without a tenant.
  await requireTenantPage(locale);
  const t = await getTranslations('projectIdea');

  const ideaCount = 0; // no read path until NG-38 (BE-05) lands
  const trlState = trlCriterionState(ideaCount);

  return (
    <div className="max-w-3xl mx-auto py-8 sm:px-4 space-y-8">
      <header>
        <h1 className="text-3xl font-bold font-heading text-ink">{t('pageTitle')}</h1>
        <p className="text-muted text-xs sm:text-sm mt-2 max-w-3xl leading-relaxed">
          {t('pageIntro')}
        </p>
      </header>

      <section
        aria-labelledby="trl-criterion-heading"
        className="rounded-lg border border-border p-4"
      >
        <h2 id="trl-criterion-heading" className="text-sm font-semibold text-ink">
          {t('trlCriterionHeading')}
        </h2>
        {trlState === 'missing' ? (
          <p className="mt-2 text-xs text-ink-2">
            <span className="font-semibold text-ink">{t('trlCriterionMissing')}</span>{' '}
            {t('trlCriterionMissingHint')}{' '}
            <Link href={`/${locale}/${workspace}/proje-fikri#proje-fikri-form`} className="underline text-accent">
              {t('trlCriterionGoToForm')}
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-2">{t('trlCriterionPresent')}</p>
        )}
      </section>

      <ProjectIdeaForm />
    </div>
  );
}
