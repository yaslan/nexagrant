import { getTranslations } from 'next-intl/server';
import React from 'react';
import { env } from '@/lib/env';
import { CORDIS_WIDGET_EMBED_PATH } from '@/lib/cordis-widget';
import CordisProjectsWidget from './CordisProjectsWidget';

interface CordisProjectsSectionProps {
  locale: string;
}

/**
 * Landing-page block with CORDIS's own project-list widget (FO-169): the six most
 * recently updated Horizon Europe projects with a participant from Türkiye, read
 * live from CORDIS — nothing here is counted or stored by us.
 *
 * The widget itself runs in a sandboxed iframe on its own route
 * (src/app/[locale]/embed/cordis/route.ts, K-573263): nothing from CORDIS runs in
 * this page. The heading, text, source line and fallback link stay here.
 *
 * The widget key comes from NEXT_PUBLIC_CORDIS_WIDGET_KEY only. Without one, the
 * block still renders, with a link to the same search on CORDIS in place of the
 * table, and the frame is not added at all.
 */
export default async function CordisProjectsSection({ locale }: CordisProjectsSectionProps) {
  const t = await getTranslations({ locale, namespace: 'landing.cordisProjects' });
  const hasKey = Boolean(env.NEXT_PUBLIC_CORDIS_WIDGET_KEY?.trim());

  return (
    <section
      id="cordis-projects"
      aria-labelledby="cordis-projects-title"
      className="py-20 lg:py-28 bg-ground/50 border-b border-border"
    >
      <div className="max-w-7xl mx-auto px-edge sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-10 space-y-4">
          <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
            {t('eyebrow')}
          </span>
          <h2 id="cordis-projects-title" className="text-3xl sm:text-4xl font-extrabold font-heading text-ink leading-tight">
            {t('title')}
          </h2>
          <p className="text-xs sm:text-sm text-muted leading-relaxed">{t('subtitle')}</p>
        </div>

        <CordisProjectsWidget
          src={hasKey ? `/${locale}${CORDIS_WIDGET_EMBED_PATH}` : null}
          labels={{
            frameTitle: t('frameTitle'),
            loading: t('loading'),
            fallback: t('fallback'),
            fallbackLink: t('fallbackLink'),
          }}
        />

        <p className="mt-4 text-[11px] text-muted">{t('source')}</p>
      </div>
    </section>
  );
}
