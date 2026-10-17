import React from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { BadgeCheck, Building2, Gift } from 'lucide-react';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { appUrl } from '@/lib/app-url';
import { errorMessage } from '@/lib/errors';
import { FOUNDER_SEAT_LIMIT, VERIFY_TOKEN_TTL_MS } from '@/lib/expert-prereg/server/constants';
import { getRemainingFounderSeats } from '@/lib/expert-prereg/server/seats';
import ExpertPreregForm from './ExpertPreregForm';
import { loadKvkkNotice } from './kvkk-text.server';
import { expertPreregPath } from './paths';

type PageProps = { params: Promise<{ locale: string }> };

export async function expertPreregMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ExpertPrereg.meta' });
  const base = appUrl();
  const url = `${base}${expertPreregPath(locale)}`;
  const title = t('title');
  const description = t('description', { limit: FOUNDER_SEAT_LIMIT });
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { tr: `${base}${expertPreregPath('tr')}`, en: `${base}${expertPreregPath('en')}` },
    },
    openGraph: { title, description, type: 'website', locale: locale === 'tr' ? 'tr_TR' : 'en_GB', url },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/**
 * FO-20 — /tr/uzman and /en/experts: hero with the Founding Expert strip, three
 * value points, the form and the FAQ. The seat count is read per request; if it
 * cannot be read the strip drops the number instead of inventing one (kural 7).
 */
export default async function ExpertPreregPage({ params }: PageProps) {
  const { locale: raw } = await params;
  const locale = raw === 'en' ? 'en' : 'tr';
  await connection();
  const t = await getTranslations({ locale, namespace: 'ExpertPrereg' });

  let seats: number | null = null;
  try {
    seats = await getRemainingFounderSeats();
  } catch (e) {
    console.error(`[ExpertPreregPage] founder seats unavailable: ${errorMessage(e)}`);
  }
  const kvkkBlocks = await loadKvkkNotice(locale);

  const values = [
    { icon: BadgeCheck, title: t('values.verified_title'), text: t('values.verified_text') },
    { icon: Building2, title: t('values.found_title'), text: t('values.found_text') },
    { icon: Gift, title: t('values.free_title'), text: t('values.free_text') },
  ];
  const faq = (['paid', 'visible', 'verify', 'delete'] as const).map((k) => ({
    q: t(`faq.${k}_q`),
    a: t(`faq.${k}_a`),
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink">
      <PublicNavbar locale={locale} />

      <main id="main" className="flex-1 w-full max-w-3xl mx-auto px-edge sm:px-4 py-8 sm:py-12 space-y-10">
        <section aria-labelledby="ep-hero" className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">{t('hero.eyebrow')}</p>
          <h1 id="ep-hero" className="font-heading text-3xl sm:text-5xl font-semibold leading-tight text-ink">
            {t('hero.title')}
          </h1>
          <p className="text-base sm:text-lg text-ink-2">{t('hero.subtitle')}</p>
          <p
            data-testid="ep-founder-strip"
            className="rounded-lg border border-accent-strong bg-accent-light px-4 py-3 text-sm font-semibold text-ink"
          >
            {seats === null
              ? t('hero.founder_unknown', { limit: FOUNDER_SEAT_LIMIT })
              : seats > 0
                ? t('hero.founder_open', { limit: FOUNDER_SEAT_LIMIT, count: seats })
                : t('hero.founder_full')}
          </p>
          <a
            href="#ep-form-heading"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent-strong px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t('hero.cta')}
          </a>
        </section>

        <section aria-labelledby="ep-values">
          <h2 id="ep-values" className="sr-only">
            {t('values.heading')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {values.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-xl border border-border bg-surface p-4">
                <Icon className="h-6 w-6 text-accent-ink" aria-hidden="true" />
                <h3 className="mt-2 text-sm font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm text-ink-2">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <ExpertPreregForm
          locale={locale}
          kvkkBlocks={kvkkBlocks}
          pageUrl={`${appUrl()}${expertPreregPath(locale)}`}
          verifyHours={VERIFY_TOKEN_TTL_MS / 3_600_000}
        />

        <section aria-labelledby="ep-faq" className="space-y-3">
          <h2 id="ep-faq" className="font-heading text-2xl font-semibold text-ink">
            {t('faq.heading')}
          </h2>
          {faq.map(({ q, a }) => (
            <details key={q} className="group rounded-xl border border-border bg-surface">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {q}
              </summary>
              <p className="px-4 pb-4 text-sm text-ink-2">{a}</p>
            </details>
          ))}
        </section>
      </main>

      <PublicFooter locale={locale} />
    </div>
  );
}
